import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, schema as s } from "./db";
import { profileFor, releasedAnswers } from "./student";
import { PROFILE_QUESTIONS } from "./profile-questions";
import { ACTIVITY_LABEL, calibration, isRight } from "./profile-rules";
import type { ActivityType } from "./db/schema";

export type EvidenceRow = { key: string; source: string; text: string; detail?: string; date: string | null };

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const latest = (dates: (string | null)[]) => dates.filter((d): d is string => !!d).sort().at(-1) ?? null;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * What the student's profile rests on, one row per kind of evidence, each with its source and date.
 * Everything except the check-in is limited to the course the student is looking at.
 */
export function profileEvidence(studentId: string, courseId: string | null): EvidenceRow[] {
  const rows: EvidenceRow[] = [];
  const profile = profileFor(studentId);
  if (profile) {
    const skipped = PROFILE_QUESTIONS.filter((q) => !profile.answers[q.key]).length;
    rows.push({
      key: "checkin",
      source: "Your check-in · all courses",
      text: profile.traits.join(" · ") || "Every question skipped",
      detail: skipped ? `${plural(skipped, "question")} skipped. Nothing is guessed in their place.` : undefined,
      date: day(profile.updatedAt),
    });
  }

  const conceptIds = courseId ? db.select({ id: s.concepts.id }).from(s.concepts).where(eq(s.concepts.courseId, courseId)).all().map((c) => c.id) : [];
  if (!conceptIds.length) return rows;
  const inCourse = (id: string | null) => !!id && conceptIds.includes(id);

  const marks = db.select().from(s.attempts).where(eq(s.attempts.studentId, studentId)).all().filter((a) => inCourse(a.conceptId) && a.source !== "retest" && a.source !== "practice");
  if (marks.length) {
    rows.push({
      key: "marks",
      source: "Quizzes and exams",
      text: `${plural(new Set(marks.map((m) => m.label)).size, "marked paper")} across ${plural(new Set(marks.map((m) => m.conceptId)).size, "concept")}`,
      detail: "Marks come from your lecturer's pen or the answer key, never from the AI.",
      date: latest(marks.map((m) => m.date)),
    });
  }

  const answerIds = releasedAnswers(studentId, courseId).map((a) => a.answer.id);
  if (answerIds.length) {
    const runs = db.select().from(s.chainRuns).where(eq(s.chainRuns.studentId, studentId)).all().filter((r) => r.answerId && answerIds.includes(r.answerId));
    if (runs.length) {
      rows.push({
        key: "fixes",
        source: "Two-step fixes",
        text: `${plural(runs.length, "fix", "fixes")} done · ${runs.filter((r) => r.selfFound).length} found before a hint`,
        date: latest(runs.map((r) => day(r.createdAt))),
      });
    }
    const replies = db.select().from(s.followups).where(inArray(s.followups.answerId, answerIds)).all().filter((f) => f.studentId === studentId && f.branch);
    if (replies.length) {
      const n = (b: string) => replies.filter((f) => f.branch === b).length;
      const parts = [n("understands") && `${n("understands")} showed understanding`, n("misconception") && `${n("misconception")} a mix-up`, n("unclear") && `${n("unclear")} unclear`].filter(Boolean);
      rows.push({ key: "replies", source: "Follow-up replies", text: parts.join(" · "), detail: "One reply starts a check; it is not a label.", date: latest(replies.map((f) => day(f.createdAt))) });
    }
  }

  const tests = db.select().from(s.practiceItems).where(eq(s.practiceItems.studentId, studentId)).all().filter((p) => inCourse(p.conceptId) && p.score !== null);
  if (tests.length) {
    const cal = tests.map((t) => calibration(isRight(t.score!, t.maxScore), t.confidence));
    const under = cal.filter((c) => c === "underconfident").length;
    const over = cal.filter((c) => c === "overconfident").length;
    const rated = cal.filter(Boolean).length;
    rows.push({
      key: "tests",
      source: "Fresh tests",
      text: `${plural(tests.length, "fresh test")} · ${tests.filter((t) => isRight(t.score!, t.maxScore)).length} right`,
      detail: rated
        ? `How sure you were: ${[rated - under - over && `${rated - under - over} matched the result`, under && `${under} right but unsure`, over && `${over} sure but wrong`].filter(Boolean).join(", ")}.`
        : undefined,
      date: latest(tests.map((t) => day(t.createdAt))),
    });
  }

  const ratings = db.select().from(s.activities).where(eq(s.activities.studentId, studentId)).all().filter((a) => inCourse(a.conceptId) && a.usefulness);
  if (ratings.length) {
    const word = { a_lot: "a lot", a_little: "a little", not_really: "not really" } as const;
    const byType = new Map<ActivityType, string[]>();
    for (const r of ratings) byType.set(r.type, [...(byType.get(r.type) ?? []), word[r.usefulness!]]);
    rows.push({
      key: "ratings",
      source: "Your activity ratings",
      text: [...byType].map(([t, ws]) => `${ACTIVITY_LABEL[t]}: ${ws.join(", ")}`).join(" · "),
      date: latest(ratings.map((r) => day(r.createdAt))),
    });
  }
  return rows;
}
