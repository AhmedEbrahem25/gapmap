import { NextResponse, after } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { staffCourses } from "@/lib/data";
import { processLecture, saveUpload } from "@/lib/jobs";
import { eq } from "drizzle-orm";

const MAX_BYTES = 40 * 1024 * 1024;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !["instructor", "ta", "admin"].includes(user.role)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const form = await req.formData();
  const courseId = String(form.get("courseId") ?? "");
  if (!staffCourses(user).some((c) => c.id === courseId)) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return NextResponse.json({ error: "Choose at least one PDF or Word file." }, { status: 400 });

  const existing = db.select({ n: s.lectures.number }).from(s.lectures).where(eq(s.lectures.courseId, courseId)).all();
  let next = Math.max(0, ...existing.map((e) => e.n)) + 1;
  const created: string[] = [];
  for (const file of files) {
    if (!/\.(pdf|docx)$/i.test(file.name)) return NextResponse.json({ error: `${file.name}: only PDF or Word (.docx) files.` }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: `${file.name} is larger than 40 MB.` }, { status: 400 });
    const filePath = await saveUpload(file, `lectures/${courseId}`);
    const id = crypto.randomUUID();
    const title = file.name.replace(/\.(pdf|docx)$/i, "").replace(/^lecture\s*\d+\s*[-–:]\s*/i, "").trim() || `Lecture ${next}`;
    db.insert(s.lectures).values({ id, courseId, number: next++, title, fileName: file.name, filePath, status: "processing", progress: 10 }).run();
    created.push(id);
  }
  after(async () => {
    for (const id of created) await processLecture(id);
  });
  return NextResponse.json({ ok: true, lectureIds: created });
}
