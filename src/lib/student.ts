import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, schema as s } from "./db";

export type ReleasedAnswer = ReturnType<typeof releasedAnswers>[number];

/** Answers a student may see: released only. */
export function releasedAnswers(studentId: string) {
  return db
    .select({ answer: s.answers, question: s.questions, exam: s.exams, paper: s.papers })
    .from(s.answers)
    .innerJoin(s.papers, eq(s.papers.id, s.answers.paperId))
    .innerJoin(s.questions, eq(s.questions.id, s.answers.questionId))
    .innerJoin(s.exams, eq(s.exams.id, s.papers.examId))
    .where(and(eq(s.papers.studentId, studentId), eq(s.answers.status, "released")))
    .orderBy(desc(s.exams.date), asc(s.questions.number))
    .all();
}

export function ownAnswer(studentId: string, answerId: string) {
  const row = releasedAnswers(studentId).find((r) => r.answer.id === answerId);
  if (!row) notFound();
  return row;
}

export function resultsFor(answerIds: string[]) {
  if (!answerIds.length) return [];
  return db
    .select({ result: s.criterionResults, criterion: s.criteria })
    .from(s.criterionResults)
    .innerJoin(s.criteria, eq(s.criteria.id, s.criterionResults.criterionId))
    .where(inArray(s.criterionResults.answerId, answerIds))
    .orderBy(asc(s.criteria.code))
    .all();
}

/** The single most useful next step: an unresolved follow-up first, then the biggest gap. */
export function nextStep(studentId: string) {
  const answers = releasedAnswers(studentId);
  if (!answers.length) return null;
  const latestExam = answers[0]!.exam.id;
  const current = answers.filter((a) => a.exam.id === latestExam);
  const followups = db.select().from(s.followups).where(eq(s.followups.studentId, studentId)).all();
  const unresolvedFollowup = (id: string) => !followups.some((f) => f.answerId === id && f.resolved);
  const closed = closedConcepts(studentId, answers[0]!.exam.date);
  const ratio = (a: ReleasedAnswer) => (a.answer.finalMarks ?? 0) / a.question.maxMarks;
  const withGap = current.filter((a) => ratio(a) < 1 && !closed.has(a.question.conceptId ?? ""));
  const candidate =
    withGap.find((a) => a.answer.followupQuestion && a.answer.followupEnabled && unresolvedFollowup(a.answer.id)) ??
    [...withGap].sort((x, y) => ratio(x) - ratio(y))[0] ??
    null;
  return candidate;
}

export function profileFor(studentId: string) {
  return db.select().from(s.studyProfiles).where(eq(s.studyProfiles.studentId, studentId)).get() ?? null;
}

/** Concepts where a fresh test after the exam reached at least 80%. */
export function closedConcepts(studentId: string, since: string) {
  const rows = db.select().from(s.attempts).where(and(eq(s.attempts.studentId, studentId), eq(s.attempts.source, "retest"))).all();
  return new Set(rows.filter((r) => r.date >= since && r.score / r.maxScore >= 0.8).map((r) => r.conceptId));
}
