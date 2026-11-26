import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema as s } from "./db";

/**
 * Rule-based early-support alerts (v1). A student is flagged when, on a concept
 * that a later unit depends on, they scored under 60% in at least two dated
 * attempts while their overall course average is still a pass (≥ 50%).
 */
export function computeAlerts(courseId: string) {
  const concepts = db.select().from(s.concepts).where(eq(s.concepts.courseId, courseId)).all();
  const dependents = new Map<string, string>();
  for (const c of concepts) if (c.prerequisiteId) dependents.set(c.prerequisiteId, c.name);

  const students = db
    .select({ id: s.users.id, name: s.users.name })
    .from(s.enrollments)
    .innerJoin(s.users, eq(s.users.id, s.enrollments.userId))
    .where(and(eq(s.enrollments.courseId, courseId), eq(s.enrollments.role, "student")))
    .all();

  let created = 0;
  for (const st of students) {
    const attempts = db.select().from(s.attempts).where(eq(s.attempts.studentId, st.id)).orderBy(asc(s.attempts.date)).all();
    const total = attempts.reduce((a, r) => a + r.score, 0);
    const max = attempts.reduce((a, r) => a + r.maxScore, 0);
    if (!max || total / max < 0.5) continue;
    for (const [prereqId, dependent] of dependents) {
      const weak = attempts.filter((a) => a.conceptId === prereqId && a.score / a.maxScore < 0.6);
      if (weak.length < 2) continue;
      const exists = db
        .select()
        .from(s.alerts)
        .where(and(eq(s.alerts.studentId, st.id), eq(s.alerts.conceptId, prereqId)))
        .get();
      if (exists) continue;
      const concept = concepts.find((c) => c.id === prereqId)!;
      db.insert(s.alerts)
        .values({
          id: crypto.randomUUID(),
          courseId,
          studentId: st.id,
          conceptId: prereqId,
          dependentConcept: dependent,
          summary: `${st.name} is passing overall but scored under 60% on ${concept.name} in ${weak.length} assessments. ${dependent} builds on it.`,
          suggestion: `A short check-in, or assign the ${concept.name.toLowerCase()} practice set before ${dependent} starts.`,
        })
        .run();
      created++;
    }
  }
  return created;
}
