"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { audit, studentCourse } from "@/lib/data";
import { ownAnswer, profileFor, resultsFor } from "@/lib/student";
import { checkSubmission, followupTurn, generateRetest, gradeRetest } from "@/lib/ai/pipelines";
import { activityFor } from "@/lib/activities";
import type { ChatMessage } from "@/lib/db/schema";
import { PROFILE_QUESTIONS, cleanCheckin, profileFromCheckin } from "@/lib/profile-questions";

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

export async function sendFollowup(answerId: string, reply: string): Promise<FollowupState> {
  const user = await student();
  const { answer, question } = ownAnswer(user.id, answerId);
  const text = reply.trim().slice(0, 800);
  if (!text) return { messages: [], branch: null, activityId: null, done: false, error: "Write a short reply first." };

  let f = db.select().from(s.followups).where(and(eq(s.followups.answerId, answerId), eq(s.followups.studentId, user.id))).get();
  if (!f) {
    const id = crypto.randomUUID();
    db.insert(s.followups)
      .values({ id, answerId, studentId: user.id, messages: [{ role: "assistant", text: answer.followupQuestion ?? "What part of this question felt unclear?", at: Date.now() }] })
      .run();
    f = db.select().from(s.followups).where(eq(s.followups.id, id)).get()!;
  }
  if (f.resolved) return { messages: f.messages, branch: f.branch ?? null, activityId: null, done: true };

  const results = resultsFor([answerId]);
  const gap = results.find((r) => r.result.status !== "met")?.result.gap ?? "";
  const concept = question.conceptId ? db.select().from(s.concepts).where(eq(s.concepts.id, question.conceptId)).get() : undefined;
  const turn = await followupTurn({
    question: question.prompt,
    studentAnswer: answer.transcription,
    gap,
    concept: concept?.name ?? "this topic",
    history: f.messages.map((m) => ({ role: m.role, text: m.text })),
    reply: text,
  });
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
  if (Object.keys(answers).length < PROFILE_QUESTIONS.length) redirect("/student/profile");
  const p = profileFromCheckin(answers);
  const row = { studentId: user.id, answers, traits: p.traits, preferredActivity: p.preferred, minutesPerDay: p.minutes, summary: p.summary };
  db.insert(s.studyProfiles)
    .values(row)
    .onConflictDoUpdate({ target: s.studyProfiles.studentId, set: { ...row, updatedAt: new Date() } })
    .run();
  // Re-shape any open activity to the new preference.
  const open = db.select().from(s.activities).where(and(eq(s.activities.studentId, user.id), eq(s.activities.status, "todo"))).all();
  for (const a of open) {
    if (a.type === "own_words") continue;
    const pick = await activityFor({ conceptId: a.conceptId, branch: "misconception", preferred: p.preferred, answerId: a.answerId });
    if (pick) db.update(s.activities).set({ type: pick.type, title: pick.title, reason: pick.reason, payload: pick.payload }).where(eq(s.activities.id, a.id)).run();
  }
  refresh();
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/student") ? next : "/student/me");
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
  const enrolled = studentCourse(user.id);
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
  const answer = String(formData.get("answer") ?? "").trim().slice(0, 2000);
  if (answer.length < 5) return { error: "Write your answer first." };
  const results = await gradeRetest({ prompt: item.prompt, criteria: item.criteria, answer });
  const score = results.reduce((t, r) => t + r.marks, 0);
  db.update(s.practiceItems)
    .set({ answer, result: results.map((r) => ({ code: r.code, status: r.status, evidence: r.evidence, gap: r.gap })), score })
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
  const enrolled = studentCourse(user.id);
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
