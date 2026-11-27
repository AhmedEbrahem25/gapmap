import type { Metadata } from "next";
import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { staffCourses, courseExams } from "@/lib/data";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { createExam } from "@/lib/actions/instructor";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Exams" };

const statusTone = { setup: "neutral", processing: "primary", review: "partial", released: "met" } as const;
const statusLabel = { setup: "Setting up", processing: "Processing", review: "In review", released: "Released" } as const;

export default async function ExamsPage() {
  const user = await requireRole("instructor", "ta", "admin");
  const courses = staffCourses(user);
  const exams = courses.flatMap((c) => courseExams(c.id).map((e) => ({ ...e, course: c })));
  const papers = exams.length ? db.select({ examId: s.papers.examId, status: s.papers.status }).from(s.papers).where(inArray(s.papers.examId, exams.map((e) => e.id))).all() : [];
  const qCount = (id: string) => db.select({ id: s.questions.id }).from(s.questions).where(eq(s.questions.examId, id)).all().length;
  const hasMcq = (id: string) => db.select({ kind: s.questions.kind }).from(s.questions).where(eq(s.questions.examId, id)).all().some((q) => q.kind === "mcq");

  return (
    <>
      <PageHeader title="Exams" sub="Upload → review → release." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Stagger className="flex flex-col gap-3">
          {exams.map((e) => {
            const ps = papers.filter((p) => p.examId === e.id);
            const done = ps.filter((p) => ["reviewed", "released"].includes(p.status)).length;
            return (
              <StaggerItem key={e.id}>
                <Card className="flex flex-wrap items-center gap-4 p-5 transition hover:shadow-lift">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold">{e.title}</h2>
                      <Badge tone={statusTone[e.status]}>{statusLabel[e.status]}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-ink-2">
                      {e.course.title} · {formatDate(e.date)} · {qCount(e.id)} questions · {ps.length} papers · {done} reviewed
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm font-semibold">
                    <Link aria-label={`Questions · ${e.title}`} className="rounded-lg px-3 py-2 text-primary-600 hover:bg-primary-50" href={`/instructor/exams/${e.id}`}>
                      Questions
                    </Link>
                    <Link aria-label={`Papers · ${e.title}`} className="rounded-lg px-3 py-2 text-primary-600 hover:bg-primary-50" href={`/instructor/exams/${e.id}/upload`}>
                      Papers
                    </Link>
                    {hasMcq(e.id) ? (
                      <Link aria-label={`Fix chains · ${e.title}`} className="rounded-lg px-3 py-2 text-primary-600 hover:bg-primary-50" href={`/instructor/exams/${e.id}/chains`}>
                        Fix chains
                      </Link>
                    ) : null}
                    <Link aria-label={`Review · ${e.title}`} className="rounded-lg bg-primary-600 px-3 py-2 text-white hover:bg-primary-700" href={`/instructor/exams/${e.id}/review`}>
                      Review
                    </Link>
                  </div>
                </Card>
              </StaggerItem>
            );
          })}
        </Stagger>
        <Card className="h-fit p-5">
          <h2 className="font-semibold">New exam or quiz</h2>
          <form action={createExam} className="mt-4 grid gap-3 text-sm">
            <label className="grid gap-1">
              <span className="text-sm font-semibold">Course</span>
              <select name="courseId" className="h-10 rounded-lg border border-[#9ca3af] px-2">
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-semibold">Title</span>
              <input name="title" required placeholder="Quiz 3" className="h-10 rounded-lg border border-[#9ca3af] px-3" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1">
                <span className="text-sm font-semibold">Type</span>
                <select name="kind" className="h-10 rounded-lg border border-[#9ca3af] px-2">
                  <option value="quiz">Quiz</option>
                  <option value="midterm">Midterm</option>
                  <option value="final">Final</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-semibold">Date</span>
                <input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="h-10 rounded-lg border border-[#9ca3af] px-2" />
              </label>
            </div>
            <SubmitButton>Create and add questions</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
