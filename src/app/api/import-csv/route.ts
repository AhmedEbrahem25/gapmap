import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { staffCourses } from "@/lib/data";
import { examQuestions } from "@/lib/jobs";

/**
 * Imports reviewed marks from a CSV export: one row per student,
 * columns `email, Q1, Q2, …`. Imported marks are already reviewed, so they
 * are released straight away and feed concept mastery and alerts.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !["instructor", "ta", "admin"].includes(user.role)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const form = await req.formData();
  const examId = String(form.get("examId") ?? "");
  const exam = db.select().from(s.exams).where(eq(s.exams.id, examId)).get();
  if (!exam || !staffCourses(user).some((c) => c.id === exam.courseId)) return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  const file = form.get("files");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a CSV file." }, { status: 400 });

  const rows = (await file.text())
    .split(/\r?\n/)
    .map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")))
    .filter((r) => r.some(Boolean));
  const header = rows.shift()?.map((h) => h.toLowerCase());
  if (!header || !header.includes("email")) return NextResponse.json({ error: "The first row must include an 'email' column." }, { status: 400 });
  const questions = examQuestions(examId);
  const emailCol = header.indexOf("email");
  let imported = 0;
  const skipped: string[] = [];
  for (const r of rows) {
    const email = r[emailCol]?.toLowerCase();
    const student = email ? db.select().from(s.users).where(eq(s.users.email, email)).get() : undefined;
    const enrolled =
      student &&
      db.select().from(s.enrollments).where(and(eq(s.enrollments.courseId, exam.courseId), eq(s.enrollments.userId, student.id))).get();
    if (!student || !enrolled) {
      skipped.push(email ?? "(blank)");
      continue;
    }
    const paperId = crypto.randomUUID();
    db.insert(s.papers).values({ id: paperId, examId, studentId: student.id, fileName: file.name, section: enrolled.section, status: "released" }).run();
    for (const q of questions) {
      const col = header.indexOf(`q${q.number}`);
      if (col < 0 || r[col] === undefined || r[col] === "") continue;
      const marks = Math.max(0, Math.min(q.maxMarks, Number(r[col])));
      if (Number.isNaN(marks)) continue;
      db.insert(s.answers)
        .values({ id: crypto.randomUUID(), paperId, questionId: q.id, transcription: "", status: "released", paperMarks: marks, suggestedMarks: marks, finalMarks: marks, model: "csv-import", reviewedBy: user.id, reviewedAt: new Date() })
        .run();
      if (q.conceptId) {
        db.insert(s.attempts)
          .values({ id: crypto.randomUUID(), studentId: student.id, conceptId: q.conceptId, label: `${exam.title} · Q${q.number}`, date: exam.date, score: marks, maxScore: q.maxMarks, source: "exam" })
          .run();
      }
    }
    imported++;
  }
  return NextResponse.json({ ok: true, imported, skipped });
}
