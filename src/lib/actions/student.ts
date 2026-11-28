"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { audit } from "@/lib/data";
import { activeCourse, ownAnswer, profileFor } from "@/lib/student";
import { checkSubmission, generateMcqRetest, generateRetest, gradeRetest } from "@/lib/ai/pipelines";
import { LETTERS, parseChoice, scoreChoice } from "@/lib/mcq";
import { followupChoicesFor, followupResponse } from "@/lib/ai/fallback";
import { activityFor } from "@/lib/activities";
import { chainForAnswer } from "@/lib/chains";
import type { ChatMessage } from "@/lib/db/schema";
import { cleanCheckin, profileFromCheckin } from "@/lib/profile-questions";
import { changedReason, parseConfidence } from "@/lib/profile-rules";
import type { ActivityType } from "@/lib/db/schema";

const student = () => requireRole("student");
const refresh = () => revalidatePath("/student", "layout");

/* ───────── Diagnosis follow-up chat ───────── */

export type FollowupState = {
  messages: ChatMessage[];
  branch: "understands" | "misconception" | "unclear" | null;
  activityId: string | null;
  done: boolean;
  error?: string;
};

export async function sendFollowup(answerId: string, choice: number): Promise<FollowupState> {
  const user = await student();
  const { answer, question } = ownAnswer(user.id, answerId);
  // Taps only: the branch comes from the choice the student tapped, so nothing they type reaches the AI.
  const choices = answer.followupChoices?.length ? answer.followupChoices : followupChoicesFor(question.prompt);
  const picked = choices[choice];
  if (!picked) return { messages: [], branch: null, activityId: null, done: false, error: "Pick one of the replies." };
  const text = picked.text;

  let f = db.select().from(s.followups).where(and(eq(s.followups.answerId, answerId), eq(s.followups.studentId, user.id))).get();
  if (!f) {
    const id = crypto.randomUUID();
    db.insert(s.followups)
      .values({ id, answerId, studentId: user.id, messages: [{ role: "assistant", text: answer.followupQuestion ?? "What part of this question felt unclear?", at: Date.now() }] })
      .run();
    f = db.select().from(s.followups).where(eq(s.followups.id, id)).get()!;
  }
  if (f.resolved) return { messages: f.messages, branch: f.branch ?? null, activityId: null, done: true };

  const concept = question.conceptId ? db.select().from(s.concepts).where(eq(s.concepts.id, question.conceptId)).get() : undefined;
  const turn = {
    branch: picked.branch,
    reply: followupResponse(picked.branch, concept?.name ?? "this topic"),
    identifiedGap: picked.branch === "misconception" ? `Believes: ${picked.text}` : picked.branch === "understands" ? "Understands; wrote it too briefly." : "Not yet clear.",
    done: true,
  };
  const messages: ChatMessage[] = [...f.messages, { role: "student", text, at: Date.now() }, { role: "assistant", text: turn.reply, at: Date.now() + 1 }];
  db.update(s.followups)
    .set({ messages, branch: turn.branch, identifiedGap: turn.identifiedGap, resolved: turn.done })
    .where(eq(s.followups.id, f.id))
    .run();

  let activityId: string | null = null;
  if (turn.done && concept) {
    const profile = profileFor(user.id);
    const pick = await activityFor({ conceptId: concept.id, branch: turn.branch, preferred: profile?.preferredActivity ?? "experiment", answerId });
    if (pick) {
      activityId = crypto.randomUUID();
      db.insert(s.activities)
        .values({ id: activityId, studentId: user.id, conceptId: concept.id, answerId, type: pick.type, title: pick.title, reason: pick.reason, payload: pick.payload, priority: 0 })
        .run();
    }
  }
  audit(user.id, "followup_reply", answerId);
  refresh();
  return { messages, branch: turn.branch, activityId, done: turn.done };
}

export async function restartFollowup(answerId: string) {
  const user = await student();
  ownAnswer(user.id, answerId);
  db.delete(s.followups).where(and(eq(s.followups.answerId, answerId), eq(s.followups.studentId, user.id))).run();
  refresh();
}

/* ───────── Study profile ───────── */


export async function saveProfile(formData: FormData) {
  const user = await student();
  // Taps only, scored by rules: the check-in never reaches the AI.
  const answers = cleanCheckin(Object.fromEntries(formData));
  const next = String(formData.get("next") ?? "");
  const back = next.startsWith("/student") ? next : "/student/me";
  // Every question can be skipped; skipping them all is the same as having no check-in.
  if (!Object.keys(answers).length) {
    db.delete(s.studyProfiles).where(eq(s.studyProfiles.studentId, user.id)).run();
    refresh();
    redirect(back);
  }
  const p = profileFromCheckin(answers);
  const row = { studentId: user.id, answers, traits: p.traits, preferredActivity: p.preferred, minutesPerDay: p.minutes, summary: p.summary };
  db.insert(s.studyProfiles)
    .values(row)
    .onConflictDoUpdate({ target: s.studyProfiles.studentId, set: { ...row, updatedAt: new Date() } })
    .run();
  await reshapeOpenActivities(user.id, p.preferred, "after you updated your check-in");
  refresh();
  redirect(back);
}

/** Re-shapes open activities to a new preferred type, and says on each one what changed and why. */
async function reshapeOpenActivities(studentId: string, preferred: ActivityType, why: string) {
  const open = db.select().from(s.activities).where(and(eq(s.activities.studentId, studentId), eq(s.activities.status, "todo"))).all();
  for (const a of open) {
    if (a.type === "own_words") continue;
    const pick = await activityFor({ conceptId: a.conceptId, branch: "misconception", preferred, answerId: a.answerId });
    if (!pick) continue;
    const reason = pick.type !== a.type ? changedReason(a.type, pick.type, why) : a.reason;
    db.update(s.activities).set({ type: pick.type, title: pick.title, reason, payload: pick.payload }).where(eq(s.activities.id, a.id)).run();
  }
}

/** Deletes the check-in. Marks and course evidence stay; only the student's own answers about habits go. */
export async function resetProfile() {
  const user = await student();
  db.delete(s.studyProfiles).where(eq(s.studyProfiles.studentId, user.id)).run();
  audit(user.id, "profile_reset", user.id);
  refresh();
  redirect("/student/me");
}

/** The student accepted a suggestion to try another approach after rating the current one "not really". */
export async function switchApproach(formData: FormData) {
  const user = await student();
  const type = z.enum(["experiment", "mind_map", "worked_example", "own_words", "try_first"]).parse(formData.get("type"));
  db.update(s.studyProfiles).set({ preferredActivity: type }).where(eq(s.studyProfiles.studentId, user.id)).run();
  await reshapeOpenActivities(user.id, type, "because the last two activities did not help much");
  refresh();
}

export async function setPreferredActivity(formData: FormData) {
  const user = await student();
  const type = z.enum(["experiment", "mind_map", "worked_example", "own_words", "try_first"]).parse(formData.get("type"));
  const activityId = String(formData.get("activityId") ?? "");
  db.update(s.studyProfiles).set({ preferredActivity: type }).where(eq(s.studyProfiles.studentId, user.id)).run();
  const a = db.select().from(s.activities).where(and(eq(s.activities.id, activityId), eq(s.activities.studentId, user.id))).get();
  const pick = a ? await activityFor({ conceptId: a.conceptId, branch: "misconception", preferred: type, answerId: a.answerId }) : null;
  if (a && pick) {
    db.update(s.activities).set({ type: pick.type, title: pick.title, reason: "You asked to try a different approach.", payload: pick.payload, status: "todo", feedback: null }).where(eq(s.activities.id, a.id)).run();
  }
  refresh();
}

/* ───────── Activities ───────── */

export type SubmitState = { ok?: boolean; feedback?: string; error?: string };

export async function submitActivity(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const user = await student();
  const id = String(formData.get("activityId"));
  const a = db.select().from(s.activities).where(and(eq(s.activities.id, id), eq(s.activities.studentId, user.id))).get();
  if (!a) return { error: "Activity not found." };
  const text = String(formData.get("submission") ?? "").trim().slice(0, 2000);
  if (text.length < 8) return { error: "Write at least a sentence." };
  const concept = db.select().from(s.concepts).where(eq(s.concepts.id, a.conceptId)).get();
  const res = await checkSubmission({
    concept: concept?.name ?? "",
    task: String(a.payload.prompt ?? a.title),
    submission: text,
    reference: String(a.payload.reference ?? ""),
    checkFor: Array.isArray(a.payload.checkFor) ? a.payload.checkFor.map(String) : [],
    answer: typeof a.payload.answer === "string" ? a.payload.answer : undefined,
  });
  db.update(s.activities)
    .set({ submission: text, feedback: res.feedback, status: res.ok ? "done" : "submitted" })
    .where(eq(s.activities.id, id))
    .run();
  refresh();
  return { ok: res.ok, feedback: res.feedback };
}

export async function rateActivity(formData: FormData) {
  const user = await student();
  const id = String(formData.get("activityId"));
  const v = z.enum(["a_lot", "a_little", "not_really"]).parse(formData.get("usefulness"));
  db.update(s.activities).set({ usefulness: v }).where(and(eq(s.activities.id, id), eq(s.activities.studentId, user.id))).run();
  refresh();
}

/* ───────── Practice & fresh tests ───────── */

export async function startRetest(formData: FormData) {
  const user = await student();
  const conceptId = String(formData.get("conceptId"));
  const concept = db.select().from(s.concepts).where(eq(s.concepts.id, conceptId)).get();
  const enrolled = await activeCourse(user.id);
  if (!concept || concept.courseId !== enrolled?.course.id) return;
  const followup = db
    .select({ gap: s.followups.identifiedGap })
    .from(s.followups)
    .where(eq(s.followups.studentId, user.id))
    .all()
    .find((f) => f.gap)?.gap;
  const lastQ = db.select().from(s.questions).where(eq(s.questions.conceptId, conceptId)).get();
  const q = await generateRetest({ concept: concept.name, gap: followup ?? concept.description ?? "", avoid: lastQ?.prompt ?? "" });
  const id = crypto.randomUUID();
  db.insert(s.practiceItems)
    .values({ id, studentId: user.id, conceptId, kind: "retest", prompt: q.prompt, criteria: q.criteria, maxScore: q.criteria.reduce((t, c) => t + c.marks, 0) })
    .run();
  redirect(`/student/practice/${id}`);
}

export async function submitRetest(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const user = await student();
  const id = String(formData.get("itemId"));
  const item = db.select().from(s.practiceItems).where(and(eq(s.practiceItems.id, id), eq(s.practiceItems.studentId, user.id))).get();
  if (!item) return { error: "Question not found." };
  if (item.answer) return { ok: true };
  // Optional tap: with no answer, nothing about confidence is recorded or guessed.
  const confidence = parseConfidence(formData.get("confidence"));
  if (item.options?.length) {
    // Multiple choice: scored by rules on the key.
    const chosen = parseChoice(String(formData.get("choice") ?? ""), item.options.length);
    if (!chosen) return { error: "Tap an answer first." };
    const score = scoreChoice(chosen, item.correctOption, item.maxScore);
    const right = item.options[LETTERS.indexOf(item.correctOption as (typeof LETTERS)[number])] ?? "";
    db.update(s.practiceItems)
      .set({
        answer: `${chosen}) ${item.options[LETTERS.indexOf(chosen as (typeof LETTERS)[number])] ?? ""}`,
        result: [{ code: "C1", status: score ? "met" : "missing", evidence: "", gap: score ? "" : `The answer is ${item.correctOption}) ${right}.` }],
        score,
        confidence,
      })
      .where(eq(s.practiceItems.id, id))
      .run();
    db.insert(s.attempts)
      .values({ id: crypto.randomUUID(), studentId: user.id, conceptId: item.conceptId, label: "Fresh test", date: new Date().toISOString().slice(0, 10), score, maxScore: item.maxScore, source: "retest" })
      .run();
    audit(user.id, "retest", id);
    refresh();
    return { ok: true };
  }
  const answer = String(formData.get("answer") ?? "").trim().slice(0, 2000);
  if (answer.length < 5) return { error: "Write your answer first." };
  const results = await gradeRetest({ prompt: item.prompt, criteria: item.criteria, answer });
  const score = results.reduce((t, r) => t + r.marks, 0);
  db.update(s.practiceItems)
    .set({ answer, result: results.map((r) => ({ code: r.code, status: r.status, evidence: r.evidence, gap: r.gap })), score, confidence })
    .where(eq(s.practiceItems.id, id))
    .run();
  db.insert(s.attempts)
    .values({ id: crypto.randomUUID(), studentId: user.id, conceptId: item.conceptId, label: "Fresh test", date: new Date().toISOString().slice(0, 10), score, maxScore: item.maxScore, source: "retest" })
    .run();
  db.update(s.activities).set({ status: "done" }).where(and(eq(s.activities.studentId, user.id), eq(s.activities.conceptId, item.conceptId))).run();
  audit(user.id, "retest", id);
  refresh();
  return { ok: true };
}

/* ───────── Anonymous questions & preferences ───────── */

export async function askQuestion(formData: FormData) {
  const user = await student();
  const enrolled = await activeCourse(user.id);
  if (!enrolled) return;
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 140);
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  if (!subject || !body) return;
  const answerId = (formData.get("answerId") as string) || null;
  if (answerId) ownAnswer(user.id, answerId);
  const alias = `Student ${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
  const id = crypto.randomUUID();
  db.insert(s.threads).values({ id, courseId: enrolled.course.id, studentId: user.id, answerId, alias, subject }).run();
  db.insert(s.threadMessages).values({ id: crypto.randomUUID(), threadId: id, authorRole: "student", body }).run();
  refresh();
  redirect(`/student/ask?t=${id}`);
}

export async function replyAsStudent(formData: FormData) {
  const user = await student();
  const threadId = String(formData.get("threadId"));
  const t = db.select().from(s.threads).where(and(eq(s.threads.id, threadId), eq(s.threads.studentId, user.id))).get();
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  if (!t || !body) return;
  db.insert(s.threadMessages).values({ id: crypto.randomUUID(), threadId, authorRole: "student", body }).run();
  db.update(s.threads).set({ status: "open" }).where(eq(s.threads.id, threadId)).run();
  refresh();
}

export async function toggleOptIn(formData: FormData) {
  const user = await student();
  db.update(s.users).set({ recruitOptIn: formData.get("optIn") === "on" }).where(eq(s.users.id, user.id)).run();
  refresh();
}

/* ───────── Socratic-style fix: taps only ───────── */

export async function recordChainRun(answerId: string, taps: { step: number; choice: number }[]) {
  const user = await student();
  const { answer, question } = ownAnswer(user.id, answerId);
  const chain = chainForAnswer(question.id, answer.chosenOption);
  if (!chain) return { ok: false };
  // Taps are checked against the stored chain on the server, so the result can't be faked from the page.
  const checked = taps
    .filter((t) => chain.steps[t.step]?.choices[t.choice])
    .map((t) => ({ step: t.step, choice: t.choice, correct: chain.steps[t.step]!.choices[t.choice]!.correct }));
  const firstTaps = chain.steps.map((_, i) => checked.find((t) => t.step === i));
  const selfFound = firstTaps.every((t) => t?.correct);
  db.insert(s.chainRuns).values({ id: crypto.randomUUID(), chainId: chain.id, studentId: user.id, answerId, taps: checked, selfFound }).run();
  audit(user.id, "chain_run", chain.id);
  refresh();
  return { ok: true, selfFound };
}

/** After a 2-tap fix: a fresh multiple-choice question on the same concept (course bank first, then the AI). */
export async function startMcqRetest(formData: FormData) {
  const user = await student();
  const questionId = String(formData.get("questionId"));
  const q = db.select().from(s.questions).where(eq(s.questions.id, questionId)).get();
  if (!q?.conceptId) return;
  const enrolled = await activeCourse(user.id);
  const exam = db.select().from(s.exams).where(eq(s.exams.id, q.examId)).get();
  if (!exam || exam.courseId !== enrolled?.course.id) return;
  const examIds = db.select({ id: s.exams.id }).from(s.exams).where(eq(s.exams.courseId, exam.courseId)).all().map((e) => e.id);
  const bank = db
    .select()
    .from(s.questions)
    .where(and(eq(s.questions.kind, "mcq"), eq(s.questions.conceptId, q.conceptId)))
    .all()
    .filter((x) => x.id !== q.id && examIds.includes(x.examId) && x.correctOption && x.options?.length);
  const answered = new Set(
    db
      .select({ questionId: s.answers.questionId })
      .from(s.answers)
      .innerJoin(s.papers, eq(s.papers.id, s.answers.paperId))
      .where(eq(s.papers.studentId, user.id))
      .all()
      .map((a) => a.questionId),
  );
  // Skip questions already used as this student's fresh tests, so "one more question" is really a new one.
  const taken = new Set(db.select({ prompt: s.practiceItems.prompt }).from(s.practiceItems).where(eq(s.practiceItems.studentId, user.id)).all().map((p) => p.prompt));
  const pick = bank.find((x) => !answered.has(x.id) && !taken.has(x.prompt)) ?? bank.find((x) => !taken.has(x.prompt)) ?? bank[0];
  const concept = db.select().from(s.concepts).where(eq(s.concepts.id, q.conceptId)).get()!;
  let fresh: { prompt: string; options: string[]; correct: string } | null = pick ? { prompt: pick.prompt, options: pick.options!, correct: pick.correctOption! } : null;
  if (!fresh) {
    const slides = db
      .select({ title: s.slides.title, body: s.slides.body })
      .from(s.slideConcepts)
      .innerJoin(s.slides, eq(s.slides.id, s.slideConcepts.slideId))
      .where(eq(s.slideConcepts.conceptId, q.conceptId))
      .limit(5)
      .all();
    fresh = await generateMcqRetest({ concept: concept.name, avoid: q.prompt, slides });
  }
  if (!fresh) {
    // No bank question and no AI: fall back to a written fresh test.
    const fd = new FormData();
    fd.set("conceptId", q.conceptId);
    return startRetest(fd);
  }
  const id = crypto.randomUUID();
  db.insert(s.practiceItems)
    .values({
      id,
      studentId: user.id,
      conceptId: q.conceptId,
      kind: "retest",
      prompt: fresh.prompt,
      criteria: [{ code: "C1", description: "Chooses the right option", marks: 1 }],
      maxScore: 1,
      options: fresh.options,
      correctOption: fresh.correct,
    })
    .run();
  redirect(`/student/practice/${id}`);
}
