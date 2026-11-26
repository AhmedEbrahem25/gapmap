import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "./db";
import { aiEnabled } from "./ai/client";
import { tagSlides, transcribePaper, matchAnswer } from "./ai/pipelines";

export const STORAGE_DIR = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.STORAGE_DIR ?? "storage");

export async function saveUpload(file: File, folder: string) {
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
  const dir = path.join(STORAGE_DIR, folder);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${Date.now()}-${safe}`);
  await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()));
  return path.relative(STORAGE_DIR, filePath);
}

export function storagePath(rel: string) {
  const full = path.resolve(STORAGE_DIR, rel);
  if (!full.startsWith(STORAGE_DIR)) throw new Error("Invalid storage path");
  return full;
}

/* ───────── Lecture ingestion: split into slides, tag with concepts ───────── */

async function extractPages(filePath: string, fileName: string): Promise<string[]> {
  const buf = await fs.readFile(storagePath(filePath));
  if (/\.pdf$/i.test(fileName)) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: false });
    return (Array.isArray(text) ? text : [text]).map((t) => t.trim());
  }
  if (/\.docx$/i.test(fileName)) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    // Word files have no slides: treat each heading-led block as one "page".
    const blocks = value.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
    const pages: string[] = [];
    let cur = "";
    for (const b of blocks) {
      if (cur && (cur.length > 500 || b.length < 70)) {
        pages.push(cur);
        cur = b;
      } else cur = cur ? `${cur}\n${b}` : b;
    }
    if (cur) pages.push(cur);
    return pages;
  }
  return [buf.toString("utf8")];
}

export async function processLecture(lectureId: string) {
  const lecture = db.select().from(s.lectures).where(eq(s.lectures.id, lectureId)).get();
  if (!lecture?.filePath || !lecture.fileName) return;
  try {
    const pages = await extractPages(lecture.filePath, lecture.fileName);
    db.update(s.lectures).set({ progress: 40 }).where(eq(s.lectures.id, lectureId)).run();
    const created = pages.map((text, i) => {
      const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
      const title = (lines[0] ?? `Slide ${i + 1}`).slice(0, 90);
      const body = lines.slice(1).join(" ").slice(0, 1500) || title;
      const id = crypto.randomUUID();
      db.insert(s.slides).values({ id, lectureId, page: i + 1, title, body }).run();
      return { id, page: i + 1, title, body };
    });
    db.update(s.lectures).set({ progress: 70 }).where(eq(s.lectures.id, lectureId)).run();
    const concepts = db.select().from(s.concepts).where(eq(s.concepts.courseId, lecture.courseId)).all();
    const tags = await tagSlides(concepts, created);
    for (const t of tags) {
      for (const conceptId of t.conceptIds) {
        db.insert(s.slideConcepts).values({ slideId: t.slideId, conceptId, status: "suggested" }).onConflictDoNothing().run();
      }
    }
    db.update(s.lectures).set({ status: "ready", progress: 100 }).where(eq(s.lectures.id, lectureId)).run();
  } catch (e) {
    console.error("[jobs] processLecture failed", e);
    db.update(s.lectures).set({ status: "failed" }).where(eq(s.lectures.id, lectureId)).run();
  }
}

/* ───────── Paper analysis: transcribe → match every criterion ───────── */

export function examQuestions(examId: string) {
  const qs = db.select().from(s.questions).where(eq(s.questions.examId, examId)).orderBy(asc(s.questions.number)).all();
  const crits = qs.length
    ? db.select().from(s.criteria).where(inArray(s.criteria.questionId, qs.map((q) => q.id))).orderBy(asc(s.criteria.code)).all()
    : [];
  return qs.map((q) => ({ ...q, criteria: crits.filter((c) => c.questionId === q.id) }));
}

export async function analyseAnswer(answerId: string) {
  const answer = db.select().from(s.answers).where(eq(s.answers.id, answerId)).get();
  if (!answer) return;
  const q = db.select().from(s.questions).where(eq(s.questions.id, answer.questionId)).get()!;
  const crits = db.select().from(s.criteria).where(eq(s.criteria.questionId, q.id)).orderBy(asc(s.criteria.code)).all();
  const slideTitles = new Map(
    db
      .select({ id: s.slides.id, title: s.slides.title })
      .from(s.slides)
      .where(inArray(s.slides.id, crits.map((c) => c.slideId).filter((x): x is string => !!x)))
      .all()
      .map((r) => [r.id, r.title]),
  );
  const match = await matchAnswer({
    question: q.prompt,
    modelAnswer: q.modelAnswer,
    criteria: crits.map((c) => ({ code: c.code, description: c.description, marks: c.marks, slideTitle: c.slideId ? slideTitles.get(c.slideId) : null })),
    transcription: answer.transcription,
  });
  db.delete(s.criterionResults).where(eq(s.criterionResults.answerId, answerId)).run();
  for (const c of crits) {
    const r = match.results.find((x) => x.code === c.code)!;
    db.insert(s.criterionResults)
      .values({ id: crypto.randomUUID(), answerId, criterionId: c.id, status: r.status, evidence: r.evidence, gap: r.gap, marks: r.marks, aiConfidence: r.confidence })
      .run();
  }
  db.update(s.answers)
    .set({
      status: "analysed",
      suggestedMarks: match.results.reduce((a, r) => a + r.marks, 0),
      followupQuestion: match.followupQuestion,
      followupReason: match.followupReason,
      errorType: match.errorType,
      model: match.model,
    })
    .where(eq(s.answers.id, answerId))
    .run();
}

export async function processPaper(paperId: string) {
  const paper = db.select().from(s.papers).where(eq(s.papers.id, paperId)).get();
  if (!paper?.filePath) return;
  const questions = examQuestions(paper.examId);
  try {
    db.update(s.papers).set({ status: "segmented", error: null }).where(eq(s.papers.id, paperId)).run();
    let transcribed: { number: number; text: string; confidence: number; lowConfidence: string[] }[] = [];
    let studentId = paper.studentId;
    if (aiEnabled() && paper.mimeType && /pdf|image/.test(paper.mimeType)) {
      const buf = await fs.readFile(storagePath(paper.filePath));
      const t = await transcribePaper({ mediaType: paper.mimeType, base64: buf.toString("base64") }, questions);
      transcribed = t.answers;
      if (!studentId && t.studentName) studentId = matchStudent(paper.examId, t.studentName);
    } else {
      // Demo mode without an API key: create empty answers for a TA to type in.
      transcribed = questions.map((q) => ({ number: q.number, text: "", confidence: 0, lowConfidence: [] }));
    }
    db.update(s.papers).set({ status: "transcribed", studentId }).where(eq(s.papers.id, paperId)).run();

    for (const q of questions) {
      const t = transcribed.find((x) => x.number === q.number);
      const answerId = crypto.randomUUID();
      db.insert(s.answers)
        .values({
          id: answerId,
          paperId,
          questionId: q.id,
          transcription: t?.text ?? "",
          handwriting: null,
          confidence: t?.confidence ?? 0,
          lowConfidence: t?.lowConfidence ?? [],
          status: "pending",
        })
        .run();
      if (t?.text) await analyseAnswer(answerId);
    }
    db.update(s.papers).set({ status: "analysed" }).where(eq(s.papers.id, paperId)).run();
  } catch (e) {
    console.error("[jobs] processPaper failed", e);
    db.update(s.papers)
      .set({ status: "failed", error: e instanceof Error ? e.message.slice(0, 300) : "Unknown error" })
      .where(eq(s.papers.id, paperId))
      .run();
  }
}

function matchStudent(examId: string, name: string) {
  const exam = db.select().from(s.exams).where(eq(s.exams.id, examId)).get();
  if (!exam) return null;
  const students = db
    .select({ id: s.users.id, name: s.users.name })
    .from(s.enrollments)
    .innerJoin(s.users, eq(s.users.id, s.enrollments.userId))
    .where(and(eq(s.enrollments.courseId, exam.courseId), eq(s.enrollments.role, "student")))
    .all();
  const n = name.toLowerCase().trim();
  return students.find((st) => st.name.toLowerCase() === n || n.includes(st.name.toLowerCase().split(" ")[0]!))?.id ?? null;
}
