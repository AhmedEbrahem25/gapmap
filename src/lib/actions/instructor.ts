"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { assertCourseAccess, audit, examWithAccess } from "@/lib/data";
import { analyseAnswer, draftCriteriaFor } from "@/lib/jobs";
import { clusterMisconceptions, tagSlides } from "@/lib/ai/pipelines";
import { computeAlerts } from "@/lib/alerts";
import { answerFlags } from "@/lib/review";
import { draftChainsForExam } from "@/lib/chains";
import { scoreChoice } from "@/lib/mcq";

const staff = () => requireRole("instructor", "ta", "admin");
const refresh = () => revalidatePath("/", "layout");

function answerContext(answerId: string) {
  const row = db
    .select({ answer: s.answers, paper: s.papers, exam: s.exams })
    .from(s.answers)
    .innerJoin(s.papers, eq(s.papers.id, s.answers.paperId))
    .innerJoin(s.exams, eq(s.exams.id, s.papers.examId))
    .where(eq(s.answers.id, answerId))
    .get();
  if (!row) throw new Error("Answer not found");
  return row;
}

/* ───────── Course material ───────── */

export async function confirmSlideTags(formData: FormData) {
  const user = await staff();
  const slideId = String(formData.get("slideId"));
  const slide = db
    .select({ courseId: s.lectures.courseId })
    .from(s.slides)
    .innerJoin(s.lectures, eq(s.lectures.id, s.slides.lectureId))
    .where(eq(s.slides.id, slideId))
    .get();
  if (!slide) return;
  assertCourseAccess(user, slide.courseId);
  db.update(s.slideConcepts).set({ status: "confirmed" }).where(eq(s.slideConcepts.slideId, slideId)).run();
  audit(user.id, "confirm_tags", slideId);
  refresh();
}

export async function confirmAllLectureTags(formData: FormData) {
  const user = await staff();
  const lectureId = String(formData.get("lectureId"));
  const lecture = db.select().from(s.lectures).where(eq(s.lectures.id, lectureId)).get();
  if (!lecture) return;
  assertCourseAccess(user, lecture.courseId);
  const ids = db.select({ id: s.slides.id }).from(s.slides).where(eq(s.slides.lectureId, lectureId)).all().map((r) => r.id);
  if (ids.length) db.update(s.slideConcepts).set({ status: "confirmed" }).where(inArray(s.slideConcepts.slideId, ids)).run();
  refresh();
}

export async function toggleSlideConcept(formData: FormData) {
  const user = await staff();
  const slideId = String(formData.get("slideId"));
  const conceptId = String(formData.get("conceptId"));
  const slide = db
    .select({ courseId: s.lectures.courseId })
    .from(s.slides)
    .innerJoin(s.lectures, eq(s.lectures.id, s.slides.lectureId))
    .where(eq(s.slides.id, slideId))
    .get();
  if (!slide) return;
  assertCourseAccess(user, slide.courseId);
  const existing = db
    .select()
    .from(s.slideConcepts)
    .where(and(eq(s.slideConcepts.slideId, slideId), eq(s.slideConcepts.conceptId, conceptId)))
    .get();
  if (existing) {
    db.delete(s.slideConcepts).where(and(eq(s.slideConcepts.slideId, slideId), eq(s.slideConcepts.conceptId, conceptId))).run();
  } else {
    db.insert(s.slideConcepts).values({ slideId, conceptId, status: "confirmed" }).run();
  }
  refresh();
}

export async function addConcept(formData: FormData) {
  const user = await staff();
  const courseId = String(formData.get("courseId"));
  assertCourseAccess(user, courseId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  db.insert(s.concepts)
    .values({
      id: crypto.randomUUID(),
      courseId,
      name,
      description: String(formData.get("description") ?? "") || null,
      unit: Number(formData.get("unit") ?? 1) || 1,
      prerequisiteId: (formData.get("prerequisiteId") as string) || null,
    })
    .run();
  refresh();
}

/* ───────── Exams & rubric ───────── */

export async function createExam(formData: FormData) {
  const user = await staff();
  const courseId = String(formData.get("courseId"));
  assertCourseAccess(user, courseId);
  const parsed = z
    .object({ title: z.string().trim().min(2), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), kind: z.enum(["midterm", "quiz", "final", "practice"]) })
    .safeParse({ title: formData.get("title"), date: formData.get("date"), kind: formData.get("kind") ?? "quiz" });
  if (!parsed.success) return;
  const id = crypto.randomUUID();
  db.insert(s.exams).values({ id, courseId, ...parsed.data, status: "setup" }).run();
  audit(user.id, "create_exam", id);
  redirect(`/instructor/exams/${id}`);
}

export async function addQuestion(formData: FormData) {
  const user = await staff();
  const examId = String(formData.get("examId"));
  examWithAccess(user, examId);
  const count = db.select({ id: s.questions.id }).from(s.questions).where(eq(s.questions.examId, examId)).all().length;
  const prompt = String(formData.get("prompt") ?? "").trim();
  if (!prompt) return;
  const id = crypto.randomUUID();
  db.insert(s.questions)
    .values({
      id,
      examId,
      number: count + 1,
      prompt,
      maxMarks: Number(formData.get("maxMarks") ?? 4) || 4,
      modelAnswer: String(formData.get("modelAnswer") ?? ""),
      conceptId: (formData.get("conceptId") as string) || null,
    })
    .run();
  refresh();
  redirect(`/instructor/exams/${examId}?q=${count + 1}`);
}

export async function aiDraftRubric(formData: FormData) {
  const user = await staff();
  const questionId = String(formData.get("questionId"));
  const q = db.select().from(s.questions).where(eq(s.questions.id, questionId)).get();
  if (!q) return;
  examWithAccess(user, q.examId);
  await draftCriteriaFor(questionId);
  refresh();
}

export async function updateCriterion(formData: FormData) {
  const user = await staff();
  const id = String(formData.get("criterionId"));
  const c = db
    .select({ crit: s.criteria, examId: s.questions.examId })
    .from(s.criteria)
    .innerJoin(s.questions, eq(s.questions.id, s.criteria.questionId))
    .where(eq(s.criteria.id, id))
    .get();
  if (!c) return;
  examWithAccess(user, c.examId);
  db.update(s.criteria)
    .set({
      description: String(formData.get("description") ?? c.crit.description).trim() || c.crit.description,
      marks: Number(formData.get("marks") ?? c.crit.marks),
      slideId: (formData.get("slideId") as string) || c.crit.slideId,
      aiDrafted: false,
    })
    .where(eq(s.criteria.id, id))
    .run();
  refresh();
}

export async function addCriterion(formData: FormData) {
  const user = await staff();
  const questionId = String(formData.get("questionId"));
  const q = db.select().from(s.questions).where(eq(s.questions.id, questionId)).get();
  if (!q) return;
  examWithAccess(user, q.examId);
  const n = db.select({ id: s.criteria.id }).from(s.criteria).where(eq(s.criteria.questionId, questionId)).all().length;
  db.insert(s.criteria)
    .values({ id: crypto.randomUUID(), questionId, code: `C${n + 1}`, description: "New criterion — describe one idea the answer must show", marks: 1, conceptId: q.conceptId })
    .run();
  refresh();
}

export async function deleteCriterion(formData: FormData) {
  const user = await staff();
  const id = String(formData.get("criterionId"));
  const c = db
    .select({ examId: s.questions.examId })
    .from(s.criteria)
    .innerJoin(s.questions, eq(s.questions.id, s.criteria.questionId))
    .where(eq(s.criteria.id, id))
    .get();
  if (!c) return;
  examWithAccess(user, c.examId);
  db.delete(s.criterionResults).where(eq(s.criterionResults.criterionId, id)).run();
  db.delete(s.criteria).where(eq(s.criteria.id, id)).run();
  refresh();
}

/* ───────── Review ───────── */

export async function updateTranscription(formData: FormData) {
  const user = await staff();
  const answerId = String(formData.get("answerId"));
  const ctx = answerContext(answerId);
  examWithAccess(user, ctx.exam.id);
  const text = String(formData.get("transcription") ?? "").trim();
  db.update(s.answers).set({ transcription: text, confidence: 1, lowConfidence: [] }).where(eq(s.answers.id, answerId)).run();
  if (text) await analyseAnswer(answerId);
  audit(user.id, "edit_transcription", answerId);
  refresh();
}

export async function reanalyse(formData: FormData) {
  const user = await staff();
  const answerId = String(formData.get("answerId"));
  examWithAccess(user, answerContext(answerId).exam.id);
  await analyseAnswer(answerId);
  refresh();
}

export async function updateResult(formData: FormData) {
  const user = await staff();
  const resultId = String(formData.get("resultId"));
  const r = db.select().from(s.criterionResults).where(eq(s.criterionResults.id, resultId)).get();
  if (!r) return;
  const ctx = answerContext(r.answerId);
  examWithAccess(user, ctx.exam.id);
  const crit = db.select().from(s.criteria).where(eq(s.criteria.id, r.criterionId)).get()!;
  const status = z.enum(["met", "partial", "missing"]).catch(r.status).parse(formData.get("status"));
  const marks = Math.max(0, Math.min(crit.marks, Number(formData.get("marks") ?? r.marks)));
  const explanation = formData.has("explanation") ? String(formData.get("explanation")).trim() : r.explanation;
  db.update(s.criterionResults)
    .set({
      status,
      marks,
      gap: String(formData.get("gap") ?? r.gap),
      explanation,
      // The reviewer vouches for the text they saved, so it cites the criterion's slide.
      citedSlideId: explanation ? (r.citedSlideId ?? crit.slideId) : null,
      edited: true,
    })
    .where(eq(s.criterionResults.id, resultId))
    .run();
  audit(user.id, "edit_result", resultId);
  refresh();
}

export async function setAnswerMeta(formData: FormData) {
  const user = await staff();
  const answerId = String(formData.get("answerId"));
  examWithAccess(user, answerContext(answerId).exam.id);
  const patch: Partial<typeof s.answers.$inferInsert> = {};
  if (formData.has("errorType")) patch.errorType = String(formData.get("errorType")) || null;
  if (formData.has("followupToggle")) patch.followupEnabled = formData.get("followupEnabled") === "on";
  if (formData.has("followupQuestion")) patch.followupQuestion = String(formData.get("followupQuestion")) || null;
  db.update(s.answers).set(patch).where(eq(s.answers.id, answerId)).run();
  refresh();
}

/** Sets the instructor's mark when the reader could not find it or read it wrong. */
export async function setPaperMark(formData: FormData) {
  const user = await staff();
  const answerId = String(formData.get("answerId"));
  const ctx = answerContext(answerId);
  examWithAccess(user, ctx.exam.id);
  const q = db.select().from(s.questions).where(eq(s.questions.id, ctx.answer.questionId)).get()!;
  const mark = Number(formData.get("mark"));
  if (!Number.isFinite(mark)) return;
  const paperMarks = Math.max(0, Math.min(q.maxMarks, mark));
  db.update(s.answers).set({ paperMarks, paperMarkConfidence: 1, suggestedMarks: paperMarks }).where(eq(s.answers.id, answerId)).run();
  audit(user.id, "set_paper_mark", answerId);
  refresh();
}

/** Assigns an unmatched scan to a student of the course (the AI never reads names). */
export async function assignPaperStudent(formData: FormData) {
  const user = await staff();
  const paperId = String(formData.get("paperId"));
  const studentId = String(formData.get("studentId"));
  const paper = db.select().from(s.papers).where(eq(s.papers.id, paperId)).get();
  if (!paper) return;
  const { exam } = examWithAccess(user, paper.examId);
  const enrolled = db
    .select()
    .from(s.enrollments)
    .where(and(eq(s.enrollments.courseId, exam.courseId), eq(s.enrollments.userId, studentId), eq(s.enrollments.role, "student")))
    .get();
  if (!enrolled) return;
  db.update(s.papers).set({ studentId, section: enrolled.section }).where(eq(s.papers.id, paperId)).run();
  audit(user.id, "assign_paper", paperId);
  refresh();
}

export async function approveAnswer(formData: FormData) {
  const user = await staff();
  const answerId = String(formData.get("answerId"));
  const ctx = answerContext(answerId);
  examWithAccess(user, ctx.exam.id);
  // The final mark is the instructor's mark from the paper; without one there is nothing to approve yet.
  if (ctx.answer.paperMarks === null) return;
  db.update(s.answers)
    .set({ status: "approved", finalMarks: ctx.answer.paperMarks, reviewedBy: user.id, reviewedAt: new Date() })
    .where(eq(s.answers.id, answerId))
    .run();
  const pending = db
    .select({ id: s.answers.id })
    .from(s.answers)
    .where(and(eq(s.answers.paperId, ctx.paper.id), inArray(s.answers.status, ["pending", "analysed"])))
    .all();
  if (pending.length === 0) db.update(s.papers).set({ status: "reviewed" }).where(eq(s.papers.id, ctx.paper.id)).run();
  audit(user.id, "approve_answer", answerId);
  refresh();
  const next = String(formData.get("next") ?? "");
  if (next.startsWith("/instructor/")) redirect(next);
}

/** Approves every answer to one question that no review rule flags. Flagged answers stay for a one-by-one look. */
export async function approveQuestion(formData: FormData) {
  const user = await staff();
  const examId = String(formData.get("examId"));
  const questionId = String(formData.get("questionId"));
  examWithAccess(user, examId);
  const question = db.select().from(s.questions).where(and(eq(s.questions.id, questionId), eq(s.questions.examId, examId))).get();
  if (!question) return;
  const rows = db
    .select({ answer: s.answers })
    .from(s.answers)
    .innerJoin(s.papers, eq(s.papers.id, s.answers.paperId))
    .where(and(eq(s.papers.examId, examId), eq(s.answers.questionId, questionId), eq(s.answers.status, "analysed")))
    .all();
  const ids = rows.map((r) => r.answer.id);
  const results = ids.length ? db.select().from(s.criterionResults).where(inArray(s.criterionResults.answerId, ids)).all() : [];
  const now = new Date();
  const papers = new Set<string>();
  let approved = 0;
  for (const { answer } of rows) {
    const own = results.filter((r) => r.answerId === answer.id);
    if (answer.paperMarks === null || answerFlags(answer, own, question.maxMarks).length) continue;
    db.update(s.answers)
      .set({ status: "approved", finalMarks: answer.paperMarks, reviewedBy: user.id, reviewedAt: now })
      .where(eq(s.answers.id, answer.id))
      .run();
    papers.add(answer.paperId);
    approved++;
  }
  for (const pid of papers) {
    const left = db.select({ id: s.answers.id }).from(s.answers).where(and(eq(s.answers.paperId, pid), inArray(s.answers.status, ["pending", "analysed"]))).all();
    if (!left.length) db.update(s.papers).set({ status: "reviewed" }).where(eq(s.papers.id, pid)).run();
  }
  audit(user.id, "approve_question", `${questionId}:${approved}`);
  refresh();
}

export async function releaseApproved(formData: FormData) {
  const user = await staff();
  const examId = String(formData.get("examId"));
  const { exam } = examWithAccess(user, examId);
  const paperIds = db.select({ id: s.papers.id }).from(s.papers).where(eq(s.papers.examId, examId)).all().map((p) => p.id);
  if (!paperIds.length) return;
  const toRelease = db
    .select({ answer: s.answers, paper: s.papers, question: s.questions })
    .from(s.answers)
    .innerJoin(s.papers, eq(s.papers.id, s.answers.paperId))
    .innerJoin(s.questions, eq(s.questions.id, s.answers.questionId))
    .where(and(inArray(s.answers.paperId, paperIds), eq(s.answers.status, "approved")))
    .all();
  for (const r of toRelease) {
    db.update(s.answers).set({ status: "released" }).where(eq(s.answers.id, r.answer.id)).run();
    if (r.paper.studentId && r.question.conceptId) {
      db.insert(s.attempts)
        .values({
          id: crypto.randomUUID(),
          studentId: r.paper.studentId,
          conceptId: r.question.conceptId,
          label: `${exam.title} · Q${r.question.number}`,
          date: exam.date,
          score: r.answer.finalMarks ?? 0,
          maxScore: r.question.maxMarks,
          source: "exam",
        })
        .run();
    }
  }
  for (const pid of paperIds) {
    const left = db
      .select({ id: s.answers.id })
      .from(s.answers)
      .where(and(eq(s.answers.paperId, pid), inArray(s.answers.status, ["pending", "analysed", "approved"])))
      .all();
    if (!left.length) db.update(s.papers).set({ status: "released" }).where(eq(s.papers.id, pid)).run();
  }
  const unreleased = db
    .select({ id: s.papers.id })
    .from(s.papers)
    .where(and(eq(s.papers.examId, examId), inArray(s.papers.status, ["uploaded", "segmented", "transcribed", "analysed", "reviewed"])))
    .all().length;
  db.update(s.exams).set({ status: unreleased ? "review" : "released" }).where(eq(s.exams.id, examId)).run();
  audit(user.id, "release", `${examId}:${toRelease.length}`);
  refresh();
}

/* ───────── Class insights ───────── */

export async function decideFlag(formData: FormData) {
  const user = await staff();
  const flagId = String(formData.get("flagId"));
  const decision = z.enum(["clarify", "revisit_criteria", "reteach"]).parse(formData.get("decision"));
  const flag = db
    .select({ flag: s.questionFlags, examId: s.questions.examId, conceptId: s.questions.conceptId })
    .from(s.questionFlags)
    .innerJoin(s.questions, eq(s.questions.id, s.questionFlags.questionId))
    .where(eq(s.questionFlags.id, flagId))
    .get();
  if (!flag) return;
  examWithAccess(user, flag.examId);
  db.update(s.questionFlags).set({ decision, decidedAt: new Date() }).where(eq(s.questionFlags.id, flagId)).run();
  db.insert(s.classDecisions)
    .values({ id: crypto.randomUUID(), examId: flag.examId, conceptId: flag.conceptId, decision, note: flag.flag.reason, createdBy: user.id })
    .run();
  refresh();
}

export async function addClassDecision(formData: FormData) {
  const user = await staff();
  const examId = String(formData.get("examId"));
  examWithAccess(user, examId);
  db.insert(s.classDecisions)
    .values({
      id: crypto.randomUUID(),
      examId,
      conceptId: (formData.get("conceptId") as string) || null,
      decision: String(formData.get("decision") ?? "reteach"),
      note: String(formData.get("note") ?? "") || null,
      createdBy: user.id,
    })
    .run();
  refresh();
}

export async function reclusterQuestion(formData: FormData) {
  const user = await staff();
  const questionId = String(formData.get("questionId"));
  const q = db.select().from(s.questions).where(eq(s.questions.id, questionId)).get();
  if (!q) return;
  examWithAccess(user, q.examId);
  const rows = db
    .select({ evidence: s.criterionResults.evidence, gap: s.criterionResults.gap, status: s.criterionResults.status })
    .from(s.criterionResults)
    .innerJoin(s.answers, eq(s.answers.id, s.criterionResults.answerId))
    .where(eq(s.answers.questionId, questionId))
    .all()
    .filter((r) => r.status !== "met");
  const clusters = await clusterMisconceptions({ question: q.prompt, gaps: rows.map((r) => ({ evidence: r.evidence, gap: r.gap })) });
  db.delete(s.misconceptions).where(eq(s.misconceptions.questionId, questionId)).run();
  for (const c of clusters.slice(0, 4)) {
    db.insert(s.misconceptions)
      .values({ id: crypto.randomUUID(), questionId, title: c.title, studentCount: c.count, examples: c.examples })
      .run();
  }
  refresh();
}

/* ───────── Discussions, alerts, internships ───────── */

export async function replyThread(formData: FormData) {
  const user = await staff();
  const threadId = String(formData.get("threadId"));
  const t = db.select().from(s.threads).where(eq(s.threads.id, threadId)).get();
  if (!t) return;
  assertCourseAccess(user, t.courseId);
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  db.insert(s.threadMessages).values({ id: crypto.randomUUID(), threadId, authorRole: "instructor", body }).run();
  db.update(s.threads).set({ status: "answered" }).where(eq(s.threads.id, threadId)).run();
  refresh();
}

export async function actOnAlert(formData: FormData) {
  const user = await staff();
  const alertId = String(formData.get("alertId"));
  const a = db.select().from(s.alerts).where(eq(s.alerts.id, alertId)).get();
  if (!a) return;
  assertCourseAccess(user, a.courseId);
  const action = String(formData.get("action"));
  if (action === "useful" || action === "not_useful") {
    db.update(s.alerts).set({ useful: action === "useful" }).where(eq(s.alerts.id, alertId)).run();
  } else if (action === "dismiss") {
    db.update(s.alerts).set({ status: "dismissed" }).where(eq(s.alerts.id, alertId)).run();
  } else {
    db.update(s.alerts).set({ status: "actioned", action }).where(eq(s.alerts.id, alertId)).run();
    if (action === "assign_practice") {
      const concept = db.select().from(s.concepts).where(eq(s.concepts.id, a.conceptId)).get();
      db.insert(s.activities)
        .values({
          id: crypto.randomUUID(),
          studentId: a.studentId,
          conceptId: a.conceptId,
          type: "worked_example",
          title: `Practice set: ${concept?.name ?? "concept"}`,
          reason: "Your instructor assigned this before the next unit builds on it.",
          payload: { prompt: `Work through the ${concept?.name} examples on the linked slides, then explain the key rule in your own words.` },
          priority: 0,
        })
        .run();
    }
  }
  refresh();
}

export async function recomputeAlerts(formData: FormData) {
  const user = await staff();
  const courseId = String(formData.get("courseId"));
  assertCourseAccess(user, courseId);
  computeAlerts(courseId);
  refresh();
}

export async function nominate(formData: FormData) {
  const user = await staff();
  const vacancyId = String(formData.get("vacancyId"));
  const studentId = String(formData.get("studentId"));
  const student = db.select().from(s.users).where(eq(s.users.id, studentId)).get();
  if (!student?.recruitOptIn) return;
  const quota = user.role === "ta" ? 1 : 2;
  const used = db
    .select({ id: s.nominations.id })
    .from(s.nominations)
    .where(and(eq(s.nominations.vacancyId, vacancyId), eq(s.nominations.nominatedBy, user.id)))
    .all().length;
  if (used >= quota) return;
  const dup = db
    .select()
    .from(s.nominations)
    .where(and(eq(s.nominations.vacancyId, vacancyId), eq(s.nominations.studentId, studentId)))
    .get();
  if (dup) return;
  db.insert(s.nominations)
    .values({ id: crypto.randomUUID(), vacancyId, studentId, nominatedBy: user.id, note: String(formData.get("note") ?? "") || null })
    .run();
  audit(user.id, "nominate", `${vacancyId}:${studentId}`);
  refresh();
}

/* Re-run analysis for every pending answer of an exam (used after rubric edits). */
export async function reanalyseExam(formData: FormData) {
  const user = await staff();
  const examId = String(formData.get("examId"));
  examWithAccess(user, examId);
  const ids = db
    .select({ id: s.answers.id })
    .from(s.answers)
    .innerJoin(s.papers, eq(s.papers.id, s.answers.paperId))
    .where(and(eq(s.papers.examId, examId), eq(s.answers.status, "analysed")))
    .orderBy(asc(s.answers.id))
    .all()
    .map((r) => r.id);
  after(async () => {
    for (const id of ids) await analyseAnswer(id);
  });
  refresh();
}

/* ───────── Multiple choice & Socratic-style fix ───────── */

export async function addMcqQuestion(formData: FormData) {
  const user = await staff();
  const examId = String(formData.get("examId"));
  examWithAccess(user, examId);
  const prompt = String(formData.get("prompt") ?? "").trim();
  const options = ["A", "B", "C", "D"].map((l) => String(formData.get(`option${l}`) ?? "").trim()).filter(Boolean);
  const correct = String(formData.get("correctOption") ?? "");
  if (!prompt || options.length < 2 || "ABCD".indexOf(correct) < 0 || "ABCD".indexOf(correct) >= options.length) return;
  const count = db.select({ id: s.questions.id }).from(s.questions).where(eq(s.questions.examId, examId)).all().length;
  db.insert(s.questions)
    .values({
      id: crypto.randomUUID(),
      examId,
      number: count + 1,
      prompt,
      maxMarks: Number(formData.get("maxMarks") ?? 1) || 1,
      kind: "mcq",
      options,
      correctOption: correct,
      conceptId: (formData.get("conceptId") as string) || null,
    })
    .run();
  refresh();
  redirect(`/instructor/exams/${examId}?q=${count + 1}`);
}

/** Writes the missing chains for every wrong option students chose (up to 30 per quiz). */
export async function writeChains(formData: FormData) {
  const user = await staff();
  const examId = String(formData.get("examId"));
  examWithAccess(user, examId);
  const n = await draftChainsForExam(examId);
  audit(user.id, "write_chains", `${examId}:${n}`);
  refresh();
}

/** One click per question: approves every cited draft chain. Uncited ones stay for an edit. */
export async function approveQuestionChains(formData: FormData) {
  const user = await staff();
  const questionId = String(formData.get("questionId"));
  const q = db.select().from(s.questions).where(eq(s.questions.id, questionId)).get();
  if (!q) return;
  examWithAccess(user, q.examId);
  const drafts = db.select().from(s.chains).where(and(eq(s.chains.questionId, questionId), eq(s.chains.status, "draft"))).all();
  const ready = drafts.filter((c) => c.citedSlideId);
  for (const c of ready) db.update(s.chains).set({ status: "approved" }).where(eq(s.chains.id, c.id)).run();
  audit(user.id, "approve_chains", `${questionId}:${ready.length}`);
  refresh();
}

/** The lecturer's edit is approved text: it cites the slide the chain was written from, or the concept's first slide. */
export async function updateChain(formData: FormData) {
  const user = await staff();
  const chainId = String(formData.get("chainId"));
  const c = db.select().from(s.chains).where(eq(s.chains.id, chainId)).get();
  if (!c) return;
  const q = db.select().from(s.questions).where(eq(s.questions.id, c.questionId)).get()!;
  examWithAccess(user, q.examId);
  const steps = c.steps.map((st, i) => ({ ...st, prompt: String(formData.get(`prompt${i}`) ?? st.prompt).trim() || st.prompt, hint: String(formData.get(`hint${i}`) ?? st.hint).trim() }));
  const fallbackSlide = q.conceptId
    ? db.select({ id: s.slideConcepts.slideId }).from(s.slideConcepts).where(eq(s.slideConcepts.conceptId, q.conceptId)).get()?.id ?? null
    : null;
  db.update(s.chains)
    .set({
      misconception: String(formData.get("misconception") ?? c.misconception).trim() || c.misconception,
      explanation: String(formData.get("explanation") ?? c.explanation).trim() || c.explanation,
      steps,
      citedSlideId: c.citedSlideId ?? fallbackSlide,
      edited: true,
      status: "approved",
    })
    .where(eq(s.chains.id, chainId))
    .run();
  audit(user.id, "edit_chain", chainId);
  refresh();
}

export async function redraftChain(formData: FormData) {
  const user = await staff();
  const chainId = String(formData.get("chainId"));
  const c = db.select().from(s.chains).where(eq(s.chains.id, chainId)).get();
  if (!c) return;
  const q = db.select().from(s.questions).where(eq(s.questions.id, c.questionId)).get()!;
  examWithAccess(user, q.examId);
  db.delete(s.chainRuns).where(eq(s.chainRuns.chainId, chainId)).run();
  db.delete(s.chains).where(eq(s.chains.id, chainId)).run();
  await draftChainsForExam(q.examId);
  refresh();
}

/** Sets an MCQ key and rescores every answer to the question by rules. */
export async function setCorrectOption(formData: FormData) {
  const user = await staff();
  const questionId = String(formData.get("questionId"));
  const q = db.select().from(s.questions).where(eq(s.questions.id, questionId)).get();
  if (!q || q.kind !== "mcq") return;
  examWithAccess(user, q.examId);
  const correct = String(formData.get("correctOption") ?? "");
  if ("ABCDE".indexOf(correct) < 0 || "ABCDE".indexOf(correct) >= (q.options?.length ?? 0)) return;
  db.update(s.questions).set({ correctOption: correct }).where(eq(s.questions.id, questionId)).run();
  for (const a of db.select().from(s.answers).where(eq(s.answers.questionId, questionId)).all()) {
    if (!a.chosenOption) continue;
    const marks = scoreChoice(a.chosenOption, correct, q.maxMarks);
    db.update(s.answers)
      .set({ paperMarks: marks, suggestedMarks: marks, ...(a.finalMarks !== null ? { finalMarks: marks } : {}) })
      .where(eq(s.answers.id, a.id))
      .run();
  }
  audit(user.id, "set_key", `${questionId}:${correct}`);
  refresh();
}

/* ───────── Courses ───────── */

export async function createCourse(formData: FormData) {
  const user = await requireRole("instructor", "admin");
  const parsed = z
    .object({ code: z.string().trim().min(2).max(20), title: z.string().trim().min(2).max(120), term: z.string().trim().min(2).max(40) })
    .safeParse({ code: formData.get("code"), title: formData.get("title"), term: formData.get("term") });
  if (!parsed.success) return;
  const id = crypto.randomUUID();
  const me = db.select({ universityId: s.users.universityId }).from(s.users).where(eq(s.users.id, user.id)).get();
  db.insert(s.courses).values({ id, ...parsed.data, instructorId: user.id, universityId: me?.universityId ?? null }).run();
  db.insert(s.enrollments).values({ id: crypto.randomUUID(), courseId: id, userId: user.id, role: "instructor", section: "A" }).run();
  audit(user.id, "create_course", id);
  redirect(`/instructor/courses/${id}`);
}

/** Enrols existing student accounts by email (one per line or comma-separated). */
export async function enrollStudents(formData: FormData) {
  const user = await staff();
  const courseId = String(formData.get("courseId"));
  assertCourseAccess(user, courseId);
  const section = String(formData.get("section") ?? "A").trim().slice(0, 8) || "A";
  const emails = String(formData.get("emails") ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
  let added = 0;
  for (const email of new Set(emails)) {
    const st = db.select().from(s.users).where(and(eq(s.users.email, email), eq(s.users.role, "student"))).get();
    if (!st) continue;
    const already = db.select().from(s.enrollments).where(and(eq(s.enrollments.courseId, courseId), eq(s.enrollments.userId, st.id))).get();
    if (already) continue;
    db.insert(s.enrollments).values({ id: crypto.randomUUID(), courseId, userId: st.id, role: "student", section }).run();
    added++;
  }
  audit(user.id, "enroll", `${courseId}:${added}`);
  refresh();
}

/** Re-runs the AI tagging for one lecture; confirmed tags are kept, suggestions are replaced. */
export async function retagLecture(formData: FormData) {
  const user = await staff();
  const lectureId = String(formData.get("lectureId"));
  const lecture = db.select().from(s.lectures).where(eq(s.lectures.id, lectureId)).get();
  if (!lecture) return;
  assertCourseAccess(user, lecture.courseId);
  const slides = db.select().from(s.slides).where(eq(s.slides.lectureId, lectureId)).all();
  if (!slides.length) return;
  db.delete(s.slideConcepts).where(and(inArray(s.slideConcepts.slideId, slides.map((x) => x.id)), eq(s.slideConcepts.status, "suggested"))).run();
  const concepts = db.select().from(s.concepts).where(eq(s.concepts.courseId, lecture.courseId)).all();
  const tags = await tagSlides(concepts, slides);
  for (const tg of tags) {
    for (const conceptId of tg.conceptIds) {
      db.insert(s.slideConcepts).values({ slideId: tg.slideId, conceptId, status: "suggested" }).onConflictDoNothing().run();
    }
  }
  audit(user.id, "retag_lecture", lectureId);
  refresh();
}
