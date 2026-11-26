import { and, eq, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { staffCourses } from "@/lib/data";
import { pct } from "@/lib/utils";

/** Class-level CSV: concept mastery per section. No individual student rows. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !["coordinator", "admin", "instructor", "ta"].includes(user.role)) return new Response("Not allowed", { status: 403 });
  const courseId = new URL(req.url).searchParams.get("course") ?? "";
  if (!staffCourses(user).some((c) => c.id === courseId)) return new Response("Not found", { status: 404 });
  const enrol = db.select().from(s.enrollments).where(and(eq(s.enrollments.courseId, courseId), eq(s.enrollments.role, "student"))).all();
  const concepts = db.select().from(s.concepts).where(eq(s.concepts.courseId, courseId)).all();
  const attempts = enrol.length ? db.select().from(s.attempts).where(inArray(s.attempts.studentId, enrol.map((e) => e.userId))).all() : [];
  const sectionOf = new Map(enrol.map((e) => [e.userId, e.section]));
  const sections = Array.from(new Set(enrol.map((e) => e.section))).sort();
  const lines = [["concept", ...sections.map((x) => `section_${x}_mastery_pct`), "attempts"].join(",")];
  for (const c of concepts) {
    const rows = attempts.filter((a) => a.conceptId === c.id);
    const cols = sections.map((sec) => {
      const r = rows.filter((a) => sectionOf.get(a.studentId) === sec);
      return String(pct(r.reduce((t, x) => t + x.score, 0), r.reduce((t, x) => t + x.maxScore, 0)));
    });
    lines.push([`"${c.name}"`, ...cols, String(rows.length)].join(","));
  }
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="gapmap-class-report.csv"` },
  });
}
