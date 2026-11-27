import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { staffCourses } from "@/lib/data";
import { importExamFile, saveUpload } from "@/lib/jobs";

/** Imports an exam's questions from the lecturer's own file (PDF or Word) and a typed key. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !["instructor", "ta", "admin"].includes(user.role)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const form = await req.formData();
  const examId = String(form.get("examId") ?? "");
  const exam = db.select().from(s.exams).where(eq(s.exams.id, examId)).get();
  if (!exam || !staffCourses(user).some((c) => c.id === exam.courseId)) return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  const file = form.get("files");
  if (!(file instanceof File) || !/\.(pdf|docx)$/i.test(file.name)) return NextResponse.json({ error: "Upload the exam as PDF or Word (.docx)." }, { status: 400 });
  const filePath = await saveUpload(file, `exams/${examId}`);
  const n = await importExamFile(examId, filePath, file.name, String(form.get("key") ?? ""), {
    mcq: Number(form.get("mcqMarks") ?? 1) || 1,
    written: Number(form.get("writtenMarks") ?? 2) || 2,
  });
  if (!n) return NextResponse.json({ error: "No questions found in this file." }, { status: 422 });
  return NextResponse.json({ ok: true, questions: n });
}
