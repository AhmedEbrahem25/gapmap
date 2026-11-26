import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, schema as s } from "./db";
import type { CurrentUser } from "./auth";

/** Courses this staff member can see (instructor, TA or admin). */
export function staffCourses(user: CurrentUser) {
  if (user.role === "admin" || user.role === "coordinator") {
    return db.select().from(s.courses).orderBy(asc(s.courses.title)).all();
  }
  const ids = db
    .select({ id: s.enrollments.courseId })
    .from(s.enrollments)
    .where(and(eq(s.enrollments.userId, user.id), inArray(s.enrollments.role, ["instructor", "ta"])))
    .all()
    .map((r) => r.id);
  const own = db.select().from(s.courses).where(eq(s.courses.instructorId, user.id)).all();
  const extra = ids.length ? db.select().from(s.courses).where(inArray(s.courses.id, ids)).all() : [];
  const map = new Map([...own, ...extra].map((c) => [c.id, c]));
  return Array.from(map.values());
}

export function assertCourseAccess(user: CurrentUser, courseId: string) {
  const course = staffCourses(user).find((c) => c.id === courseId);
  if (!course) notFound();
  return course;
}

export function primaryCourse(user: CurrentUser) {
  return staffCourses(user)[0] ?? null;
}

export function courseExams(courseId: string) {
  return db.select().from(s.exams).where(eq(s.exams.courseId, courseId)).orderBy(desc(s.exams.date)).all();
}

export function examWithAccess(user: CurrentUser, examId: string) {
  const exam = db.select().from(s.exams).where(eq(s.exams.id, examId)).get();
  if (!exam) notFound();
  const course = assertCourseAccess(user, exam.courseId);
  return { exam, course };
}

export function conceptsFor(courseId: string) {
  return db.select().from(s.concepts).where(eq(s.concepts.courseId, courseId)).orderBy(asc(s.concepts.unit)).all();
}

/** Slide lookup with its lecture number, for "L4 · 12" links. */
export function slideRef(slideId: string | null | undefined) {
  if (!slideId) return null;
  const row = db
    .select({ id: s.slides.id, page: s.slides.page, title: s.slides.title, body: s.slides.body, lectureNumber: s.lectures.number, lectureId: s.lectures.id, lectureTitle: s.lectures.title })
    .from(s.slides)
    .innerJoin(s.lectures, eq(s.lectures.id, s.slides.lectureId))
    .where(eq(s.slides.id, slideId))
    .get();
  return row ?? null;
}

export function studentCourse(userId: string) {
  const row = db
    .select({ course: s.courses, section: s.enrollments.section })
    .from(s.enrollments)
    .innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
    .where(and(eq(s.enrollments.userId, userId), eq(s.enrollments.role, "student")))
    .get();
  return row ?? null;
}

export function audit(actorId: string | null, action: string, object: string) {
  db.insert(s.auditLog).values({ id: crypto.randomUUID(), actorId, action, object }).run();
}

/** Mastery per concept from attempts: latest-weighted average (0–100). */
export function masteryByConcept(studentId: string) {
  const rows = db.select().from(s.attempts).where(eq(s.attempts.studentId, studentId)).orderBy(asc(s.attempts.date)).all();
  const map = new Map<string, { score: number; max: number; last: { score: number; max: number; label: string } }>();
  for (const r of rows) {
    const m = map.get(r.conceptId) ?? { score: 0, max: 0, last: { score: 0, max: 1, label: "" } };
    m.score += r.score;
    m.max += r.maxScore;
    m.last = { score: r.score, max: r.maxScore, label: r.label };
    map.set(r.conceptId, m);
  }
  return map;
}
