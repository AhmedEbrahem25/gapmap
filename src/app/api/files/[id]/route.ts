import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { staffCourses } from "@/lib/data";
import { storagePath } from "@/lib/jobs";

/** Serves an uploaded scan to staff of its course, or to the student it belongs to. */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const paper = db.select({ paper: s.papers, exam: s.exams }).from(s.papers).innerJoin(s.exams, eq(s.exams.id, s.papers.examId)).where(eq(s.papers.id, id)).get();
  if (!paper?.paper.filePath) return new Response("Not found", { status: 404 });
  const isStaff = staffCourses(user).some((c) => c.id === paper.exam.courseId);
  const isOwner = user.role === "student" && paper.paper.studentId === user.id && paper.paper.status === "released";
  if (!isStaff && !isOwner) return new Response("Not found", { status: 404 });
  const buf = await fs.readFile(storagePath(paper.paper.filePath));
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": paper.paper.mimeType ?? "application/octet-stream", "Cache-Control": "private, max-age=300" },
  });
}
