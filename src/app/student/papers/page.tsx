import type { Metadata } from "next";
import Link from "next/link";
import { asc, inArray } from "drizzle-orm";
import { ChevronRight, FileText } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { releasedAnswers } from "@/lib/student";
import { StudentHeader } from "@/components/shell/student-header";
import { EmptyState } from "@/components/ui/page-header";
import { StatusChip, statusFromRatio } from "@/components/ui/badge";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { cn, fmtMarks } from "@/lib/utils";

export const metadata: Metadata = { title: "My papers" };

export default async function PapersPage({ searchParams }: PageProps<"/student/papers">) {
  const user = await requireRole("student");
  const sp = await searchParams;
  const answers = releasedAnswers(user.id);
  const courseIds = [...new Set(answers.map((a) => a.exam.courseId))];
  const courses = courseIds.length ? db.select().from(s.courses).where(inArray(s.courses.id, courseIds)).orderBy(asc(s.courses.title)).all() : [];
  // A student may take several courses: they pick the subject, or see all of them.
  const picked = courses.find((c) => c.id === sp.course) ?? null;

  // One card per paper, newest exam first (releasedAnswers is already ordered that way).
  const papers = new Map<string, { paperId: string; courseId: string; title: string; date: string; marks: number; max: number; count: number }>();
  for (const a of answers) {
    if (picked && a.exam.courseId !== picked.id) continue;
    const p = papers.get(a.paper.id) ?? { paperId: a.paper.id, courseId: a.exam.courseId, title: a.exam.title, date: a.exam.date, marks: 0, max: 0, count: 0 };
    p.marks += a.answer.finalMarks ?? 0;
    p.max += a.question.maxMarks;
    p.count++;
    papers.set(a.paper.id, p);
  }
  const groups = courses
    .filter((c) => !picked || c.id === picked.id)
    .map((c) => ({ course: c, papers: [...papers.values()].filter((p) => p.courseId === c.id) }))
    .filter((g) => g.papers.length);

  const chip = (href: string, label: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold transition",
        active ? "bg-primary-600 text-white" : "border border-line bg-white text-ink-2 hover:border-primary-200",
      )}
    >
      {label}
    </Link>
  );

  return (
    <>
      <StudentHeader eyebrow="Marked by your instructors" title="My papers" />
      <Stagger className="flex flex-col gap-3 px-5">
        {courses.length > 1 ? (
          <StaggerItem>
            <nav aria-label="Course" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
              {chip("/student/papers", "All courses", !picked)}
              {courses.map((c) => chip(`/student/papers?course=${c.id}`, c.title, picked?.id === c.id))}
            </nav>
          </StaggerItem>
        ) : null}
        {groups.length ? (
          groups.map((g) => (
            <StaggerItem key={g.course.id} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-ink-2">
                {g.course.code} · {g.course.title}
              </h2>
              {g.papers.map((p) => (
                <Link key={p.paperId} href={`/student/papers/${p.paperId}`} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 transition hover:-translate-y-px hover:shadow-lift">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                    <FileText size={20} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <strong className="block">{p.title}</strong>
                    <span className="text-ink-2">
                      {p.date} · {p.count} question{p.count === 1 ? "" : "s"}
                    </span>
                  </span>
                  <StatusChip status={statusFromRatio(p.marks, p.max)} suffix={`${fmtMarks(p.marks)}/${fmtMarks(p.max)}`} />
                  <ChevronRight size={18} className="text-ink-3" aria-hidden />
                </Link>
              ))}
            </StaggerItem>
          ))
        ) : (
          <EmptyState title="No papers yet" body="Your marked paper appears here as soon as your instructor releases it." />
        )}
      </Stagger>
    </>
  );
}
