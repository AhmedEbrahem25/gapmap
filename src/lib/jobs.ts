import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "./db";
import { aiEnabled } from "./ai/client";
import { tagSlides, transcribePaper, matchAnswer, draftRubric, type PaperAnswer } from "./ai/pipelines";
import { keywords } from "./ai/fallback";
import { parseChoice, scoreChoice } from "./mcq";

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
  const slideIds = crits.map((c) => c.slideId).filter((x): x is string => !!x);
  const slides = new Map(
    (slideIds.length
      ? db
          .select({ id: s.slides.id, page: s.slides.page, title: s.slides.title, body: s.slides.body, lecture: s.lectures.number })
          .from(s.slides)
          .innerJoin(s.lectures, eq(s.lectures.id, s.slides.lectureId))
          .where(inArray(s.slides.id, slideIds))
          .all()
      : []
    ).map((r) => [r.id, r]),
  );
  const match = await matchAnswer({
    question: q.prompt,
    modelAnswer: q.modelAnswer,
    criteria: crits.map((c) => ({ code: c.code, description: c.description, marks: c.marks, slide: c.slideId ? (slides.get(c.slideId) ?? null) : null })),
    transcription: answer.transcription,
    instructorMark: answer.paperMarks === null ? null : { marks: answer.paperMarks, max: q.maxMarks },
  });
  db.delete(s.criterionResults).where(eq(s.criterionResults.answerId, answerId)).run();
  for (const c of crits) {
    const r = match.results.find((x) => x.code === c.code)!;
    db.insert(s.criterionResults)
      .values({
        id: crypto.randomUUID(),
        answerId,
        criterionId: c.id,
        status: r.status,
        evidence: r.evidence,
        gap: r.gap,
        marks: r.marks,
        aiConfidence: r.confidence,
        explanation: r.explanation,
        citedSlideId: r.citedSlideId,
      })
      .run();
  }
  db.update(s.answers)
    .set({
      status: "analysed",
      // The mark is the instructor's, read from the paper; the AI only diagnoses it.
      suggestedMarks: answer.paperMarks,
      followupQuestion: match.followupQuestion,
      followupReason: match.followupReason,
      followupChoices: match.followupChoices,
      errorType: match.errorType,
      model: match.model,
    })
    .where(eq(s.answers.id, answerId))
    .run();
}

/** Drafts criteria for a question (from its text, model answer and the course concepts) and links each to a slide. */
export async function draftCriteriaFor(questionId: string) {
  const q = db.select().from(s.questions).where(eq(s.questions.id, questionId)).get();
  if (!q) return;
  const exam = db.select().from(s.exams).where(eq(s.exams.id, q.examId)).get()!;
  const concepts = db.select().from(s.concepts).where(eq(s.concepts.courseId, exam.courseId)).all();
  const drafted = await draftRubric({ prompt: q.prompt, modelAnswer: q.modelAnswer, maxMarks: q.maxMarks, concepts: concepts.map((c) => c.name) });
  db.delete(s.criteria).where(eq(s.criteria.questionId, questionId)).run();
  drafted.forEach((c, i) => {
    const concept = concepts.find((x) => x.name.toLowerCase() === (c.concept ?? "").toLowerCase()) ?? concepts.find((x) => x.id === q.conceptId);
    // Of the concept's slides, link the one whose text is closest to the criterion.
    const words = keywords(c.description);
    const slide = concept
      ? db
          .select({ id: s.slides.id, title: s.slides.title, body: s.slides.body })
          .from(s.slideConcepts)
          .innerJoin(s.slides, eq(s.slides.id, s.slideConcepts.slideId))
          .where(eq(s.slideConcepts.conceptId, concept.id))
          .all()
          .map((sl) => ({ sl, hits: words.filter((w) => `${sl.title} ${sl.body}`.toLowerCase().includes(w)).length }))
          .sort((a, b) => b.hits - a.hits)[0]?.sl
      : undefined;
    db.insert(s.criteria)
      .values({
        id: crypto.randomUUID(),
        questionId,
        code: `C${i + 1}`,
        description: c.description,
        marks: c.marks,
        conceptId: concept?.id ?? null,
        slideId: slide?.id ?? null,
        aiDrafted: true,
      })
      .run();
    if (!q.conceptId && concept && i === 0) db.update(s.questions).set({ conceptId: concept.id }).where(eq(s.questions.id, questionId)).run();
  });
}

/** Questions are printed on the paper: the first paper of an exam with no questions creates them. */
async function questionsFromPaper(examId: string, read: PaperAnswer[]) {
  for (const r of [...read].sort((x, y) => x.number - y.number)) {
    if (!r.questionText.trim()) continue;
    const id = crypto.randomUUID();
    const mcq = r.options.length >= 2;
    const maxMarks = r.maxMarks ?? (r.mark !== null && r.mark > 0 ? Math.max(1, Math.ceil(r.mark)) : 1);
    const chosen = mcq ? parseChoice(r.text, r.options.length) : null;
    db.insert(s.questions)
      .values({
        id,
        examId,
        number: r.number,
        prompt: r.questionText.trim(),
        maxMarks,
        modelAnswer: "",
        kind: mcq ? "mcq" : "written",
        options: mcq ? r.options : null,
        // A full mark from the lecturer on this answer means the chosen letter is the key.
        correctOption: mcq && chosen && r.mark !== null && r.mark >= maxMarks ? chosen : null,
      })
      .run();
    if (!mcq) await draftCriteriaFor(id);
  }
}

export async function processPaper(paperId: string) {
  const paper = db.select().from(s.papers).where(eq(s.papers.id, paperId)).get();
  if (!paper?.filePath) return;
  let questions = examQuestions(paper.examId);
  try {
    db.update(s.papers).set({ status: "segmented", error: null }).where(eq(s.papers.id, paperId)).run();
    let read: PaperAnswer[] = [];
    // The AI never sees who the paper belongs to: the student comes from the upload form or the file name.
    const studentId = paper.studentId ?? matchStudentByFile(paper.examId, paper.fileName);
    if (aiEnabled() && paper.mimeType && /pdf|image/.test(paper.mimeType)) {
      const buf = await fs.readFile(storagePath(paper.filePath));
      read = (await transcribePaper({ mediaType: paper.mimeType, base64: buf.toString("base64") }, questions)).answers;
      if (!questions.length) {
        await questionsFromPaper(paper.examId, read);
        questions = examQuestions(paper.examId);
      }
    }
    db.update(s.papers).set({ status: "transcribed", studentId }).where(eq(s.papers.id, paperId)).run();

    // Without an API key a TA types the answer and the mark in the review screen.
    // Save every answer first so the whole paper shows up at once, then diagnose them one by one.
    const toAnalyse: string[] = [];
    for (const q of questions) {
      const r = read.find((x) => x.number === q.number);
      const answerId = crypto.randomUUID();
      if (q.kind === "mcq") {
        // Multiple choice: the AI only reads the letter; rules score it on the key. Without a key yet,
        // a full mark from the lecturer teaches it, and until then the lecturer's own mark counts.
        const chosen = parseChoice(r?.text, q.options?.length ?? 4);
        let correct = q.correctOption;
        if (!correct && chosen && r?.mark !== null && r?.mark !== undefined && r.mark >= q.maxMarks && r.mark > 0) {
          correct = chosen;
          db.update(s.questions).set({ correctOption: chosen }).where(eq(s.questions.id, q.id)).run();
          q.correctOption = chosen;
        }
        const marks = correct ? scoreChoice(chosen, correct, q.maxMarks) : (r?.mark ?? null);
        db.insert(s.answers)
          .values({
            id: answerId,
            paperId,
            questionId: q.id,
            transcription: chosen ? `${chosen}) ${q.options?.["ABCDE".indexOf(chosen)] ?? ""}`.trim() : (r?.text ?? ""),
            chosenOption: chosen,
            confidence: r?.confidence ?? 0,
            lowConfidence: [],
            paperMarks: marks,
            paperMarkConfidence: chosen ? (r?.confidence ?? 0) : 0,
            suggestedMarks: marks,
            model: "rules",
            status: "analysed",
          })
          .run();
        continue;
      }
      db.insert(s.answers)
        .values({
          id: answerId,
          paperId,
          questionId: q.id,
          transcription: r?.text ?? "",
          handwriting: null,
          confidence: r?.confidence ?? 0,
          lowConfidence: r?.lowConfidence ?? [],
          paperMarks: r?.mark === null || r?.mark === undefined ? null : Math.max(0, Math.min(q.maxMarks, r.mark)),
          paperMarkConfidence: r?.mark === null || r?.mark === undefined ? 0 : r.markConfidence,
          status: "pending",
        })
        .run();
      if (r?.text) toAnalyse.push(answerId);
    }
    for (const answerId of toAnalyse) await analyseAnswer(answerId);
    db.update(s.papers).set({ status: "analysed" }).where(eq(s.papers.id, paperId)).run();
  } catch (e) {
    console.error("[jobs] processPaper failed", e);
    db.update(s.papers)
      .set({ status: "failed", error: e instanceof Error ? e.message.slice(0, 300) : "Unknown error" })
      .where(eq(s.papers.id, paperId))
      .run();
  }
}

/** Matches a scan to a student from its file name, e.g. "mariam-adel.pdf" or "youssef.kamal.jpg". Exactly one match or none. */
export function matchStudentByFile(examId: string, fileName: string | null) {
  const exam = db.select().from(s.exams).where(eq(s.exams.id, examId)).get();
  if (!exam || !fileName) return null;
  const students = db
    .select({ id: s.users.id, name: s.users.name, email: s.users.email })
    .from(s.enrollments)
    .innerJoin(s.users, eq(s.users.id, s.enrollments.userId))
    .where(and(eq(s.enrollments.courseId, exam.courseId), eq(s.enrollments.role, "student")))
    .all();
  const words = ` ${fileName.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")} `;
  const hits = students.filter((st) => {
    const name = st.name.toLowerCase().split(/\s+/);
    const local = st.email.split("@")[0]!.toLowerCase().split(/[._-]+/);
    return name.every((w) => words.includes(` ${w} `)) || (local.length > 1 && local.every((w) => words.includes(` ${w} `)));
  });
  return hits.length === 1 ? hits[0]!.id : null;
}
