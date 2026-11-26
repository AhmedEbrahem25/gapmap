import { NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { staffCourses } from "@/lib/data";
import { processPaper, saveUpload } from "@/lib/jobs";

const MAX_BYTES = 25 * 1024 * 1024;
const TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !["instructor", "ta", "admin"].includes(user.role)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const form = await req.formData();
  const examId = String(form.get("examId") ?? "");
  const exam = db.select().from(s.exams).where(eq(s.exams.id, examId)).get();
  if (!exam || !staffCourses(user).some((c) => c.id === exam.courseId)) return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  const section = String(form.get("section") ?? "A").slice(0, 8) || "A";
  const studentId = (form.get("studentId") as string) || null;

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return NextResponse.json({ error: "Choose at least one scanned paper." }, { status: 400 });
  const ids: string[] = [];
  for (const file of files) {
    if (!TYPES.includes(file.type)) return NextResponse.json({ error: `${file.name}: upload PDF, PNG, JPG or WebP scans.` }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: `${file.name} is larger than 25 MB.` }, { status: 400 });
    const filePath = await saveUpload(file, `papers/${examId}`);
    const id = crypto.randomUUID();
    db.insert(s.papers)
      .values({ id, examId, studentId: files.length === 1 ? studentId : null, fileName: file.name, filePath, mimeType: file.type, section, status: "uploaded" })
      .run();
    ids.push(id);
  }
  db.update(s.exams).set({ status: "processing" }).where(eq(s.exams.id, examId)).run();
  after(async () => {
    for (const id of ids) await processPaper(id);
    db.update(s.exams).set({ status: "review" }).where(eq(s.exams.id, examId)).run();
  });
  return NextResponse.json({ ok: true, paperIds: ids });
}
