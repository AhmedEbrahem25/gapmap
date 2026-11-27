import { NextResponse, after } from "next/server";
import { PDFDocument } from "pdf-lib";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { staffCourses } from "@/lib/data";
import { processPaper, saveUpload } from "@/lib/jobs";
import { draftChainsForExam } from "@/lib/chains";

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

  const skipCover = form.get("skipCover") === "on";
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return NextResponse.json({ error: "Choose at least one scanned paper." }, { status: 400 });
  const ids: string[] = [];
  for (const file of files) {
    if (!TYPES.includes(file.type)) return NextResponse.json({ error: `${file.name}: upload PDF, PNG, JPG or WebP scans.` }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: `${file.name} is larger than 25 MB.` }, { status: 400 });
    // The cover page carries the name and ID: drop it before the scan is stored or read by the AI.
    const stored = skipCover && file.type === "application/pdf" ? await withoutFirstPage(file) : file;
    const filePath = await saveUpload(stored, `papers/${examId}`);
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
    // Multiple choice read from the scans: write the 2-step fixes for the wrong options students chose.
    await draftChainsForExam(examId);
  });
  return NextResponse.json({ ok: true, paperIds: ids });
}

async function withoutFirstPage(file: File) {
  try {
    const pdf = await PDFDocument.load(await file.arrayBuffer());
    if (pdf.getPageCount() < 2) return file;
    pdf.removePage(0);
    return new File([new Uint8Array(await pdf.save())], file.name, { type: "application/pdf" });
  } catch {
    return file; // an unusual PDF: keep it as uploaded
  }
}
