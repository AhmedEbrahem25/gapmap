"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { assertCourseAccess, audit, examWithAccess } from "@/lib/data";
import { analyseAnswer } from "@/lib/jobs";
import { clusterMisconceptions, draftRubric } from "@/lib/ai/pipelines";
import { computeAlerts } from "@/lib/alerts";

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
  const { course } = examWithAccess(user, q.examId);
  const concepts = db.select().from(s.concepts).where(eq(s.concepts.courseId, course.id)).all();
  const drafted = await draftRubric({ prompt: q.prompt, modelAnswer: q.modelAnswer, maxMarks: q.maxMarks, concepts: concepts.map((c) => c.name) });
  db.delete(s.criteria).where(eq(s.criteria.questionId, questionId)).run();
  drafted.forEach((c, i) => {
    const concept = concepts.find((x) => x.name.toLowerCase() === (c.concept ?? "").toLowerCase()) ?? concepts.find((x) => x.id === q.conceptId);
    const slide = concept
      ? db
          .select({ id: s.slides.id })
          .from(s.slideConcepts)
          .innerJoin(s.slides, eq(s.slides.id, s.slideConcepts.slideId))
          .where(eq(s.slideConcepts.conceptId, concept.id))
          .get()
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
  });
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
  db.update(s.criterionResults)
    .set({ status, marks, gap: String(formData.get("gap") ?? r.gap), edited: true })
    .where(eq(s.criterionResults.id, resultId))
    .run();
  const total = db.select().from(s.criterionResults).where(eq(s.criterionResults.answerId, r.answerId)).all().reduce((a, x) => a + x.marks, 0);
  db.update(s.answers).set({ suggestedMarks: total }).where(eq(s.answers.id, r.answerId)).run();
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

export async function approveAnswer(formData: FormData) {
  const user = await staff();
  const answerId = String(formData.get("answerId"));
  const ctx = answerContext(answerId);
  examWithAccess(user, ctx.exam.id);
  const total = db.select().from(s.criterionResults).where(eq(s.criterionResults.answerId, answerId)).all().reduce((a, x) => a + x.marks, 0);
  db.update(s.answers)
    .set({ status: "approved", finalMarks: total, reviewedBy: user.id, reviewedAt: new Date() })
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
