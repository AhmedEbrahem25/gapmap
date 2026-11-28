import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "./db";
import { profileFor } from "./student";
import { activityReward, armStats, bktTrace, pickArm, pickReason, type MasteryStep, type Outcome } from "./adaptive";
import type { ActivityType } from "./db/schema";

const day = (d: Date) => d.toISOString().slice(0, 10);

const courseConceptIds = (courseId: string) =>
  db.select({ id: s.concepts.id }).from(s.concepts).where(eq(s.concepts.courseId, courseId)).all().map((c) => c.id);

/** BKT mastery per concept from the student's marked answers and fresh tests. */
export function conceptMastery(studentId: string) {
  const rows = db.select().from(s.attempts).where(eq(s.attempts.studentId, studentId)).all();
  const byConcept = new Map<string, typeof rows>();
  for (const r of rows) byConcept.set(r.conceptId, [...(byConcept.get(r.conceptId) ?? []), r]);
  const out = new Map<string, { p: number; steps: MasteryStep[] }>();
  for (const [conceptId, list] of byConcept) {
    out.set(conceptId, bktTrace(list.map((r) => ({ label: r.label, date: r.date, score: r.score, max: r.maxScore }))));
  }
  return out;
}

/** Outcomes of past activities in a course, each scored by what happened next on that concept. */
function outcomes(studentIds: string[], conceptIds: string[]): Map<string, Outcome[]> {
  const out = new Map<string, Outcome[]>();
  if (!studentIds.length || !conceptIds.length) return out;
  const acts = db
    .select()
    .from(s.activities)
    .where(and(inArray(s.activities.studentId, studentIds), inArray(s.activities.conceptId, conceptIds)))
    .all();
  if (!acts.length) return out;
  const later = db
    .select()
    .from(s.attempts)
    .where(and(inArray(s.attempts.studentId, studentIds), inArray(s.attempts.conceptId, conceptIds)))
    .all();
  for (const a of acts) {
    if (a.type === "own_words") continue;
    const answers = later.filter((x) => x.studentId === a.studentId && x.conceptId === a.conceptId).map((x) => ({ date: x.date, score: x.score, max: x.maxScore }));
    const reward = activityReward({ createdDay: day(a.createdAt), usefulness: a.usefulness }, answers);
    if (reward === null) continue;
    out.set(a.studentId, [...(out.get(a.studentId) ?? []), { type: a.type, reward }]);
  }
  return out;
}

/** What the bandit knows about one student in one course: their own outcomes, the class's, and the check-in. */
export function planPolicy(studentId: string, courseId: string) {
  const conceptIds = courseConceptIds(courseId);
  const classmates = db
    .select({ id: s.enrollments.userId })
    .from(s.enrollments)
    .where(and(eq(s.enrollments.courseId, courseId), eq(s.enrollments.role, "student")))
    .all()
    .map((e) => e.id);
  const all = outcomes([...new Set([studentId, ...classmates])], conceptIds);
  const own = all.get(studentId) ?? [];
  const cls = [...all].filter(([id]) => id !== studentId).flatMap(([, o]) => o);
  const preferred = profileFor(studentId)?.preferredActivity ?? null;
  return { stats: armStats(own, cls, preferred), preferred, ownCount: own.length };
}

/** The activity type for a new activity on a concept, with the reason shown to the student. */
export function pickActivityType(studentId: string, conceptId: string): { type: ActivityType; reason: string } | null {
  const concept = db.select({ courseId: s.concepts.courseId }).from(s.concepts).where(eq(s.concepts.id, conceptId)).get();
  if (!concept) return null;
  const policy = planPolicy(studentId, concept.courseId);
  const pick = pickArm(policy.stats, `${studentId}:${conceptId}:${policy.ownCount}`);
  return { type: pick.type, reason: pickReason(pick, policy.preferred) };
}

/** Class-wide view for the lecturer: which activity types have helped in this course, no names. */
export function classPolicy(courseId: string) {
  const conceptIds = courseConceptIds(courseId);
  const students = db
    .select({ id: s.enrollments.userId })
    .from(s.enrollments)
    .where(and(eq(s.enrollments.courseId, courseId), eq(s.enrollments.role, "student")))
    .all()
    .map((e) => e.id);
  const all = [...outcomes(students, conceptIds).values()].flat();
  return armStats([], all, null).map((a) => ({ type: a.type, wins: a.cls.wins, n: a.cls.n }));
}
