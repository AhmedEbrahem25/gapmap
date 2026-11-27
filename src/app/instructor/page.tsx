import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { BookOpen, ChevronRight } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { staffCourses } from "@/lib/data";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { createCourse } from "@/lib/actions/instructor";

export const metadata: Metadata = { title: "Courses" };

export default async function InstructorHome() {
  const user = await requireRole("instructor", "ta", "admin");
  const courses = staffCourses(user);
  const students = (courseId: string) =>
    db.select({ id: s.enrollments.id }).from(s.enrollments).where(and(eq(s.enrollments.courseId, courseId), eq(s.enrollments.role, "student"))).all().length;
  const lectures = (courseId: string) => db.select({ id: s.lectures.id }).from(s.lectures).where(eq(s.lectures.courseId, courseId)).all().length;

  return (
    <>
      <PageHeader crumb="Courses" title="Your courses" />
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-3">
          {courses.length ? (
            courses.map((c) => (
              <Link key={c.id} href={`/instructor/courses/${c.id}`}>
                <Card className="flex items-center gap-4 p-5 transition hover:shadow-lift">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                    <BookOpen size={20} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold">{c.title}</h2>
                    <span className="text-[13px] text-ink-2">
                      {c.code} · {c.term} · {lectures(c.id)} lectures · {students(c.id)} students
                    </span>
                  </span>
                  <ChevronRight size={18} className="text-ink-3" aria-hidden />
                </Card>
              </Link>
            ))
          ) : (
            <Card className="p-6 text-sm text-ink-2">No courses yet. Create your first one.</Card>
          )}
        </div>
        {user.role !== "ta" ? (
          <Card className="w-full p-5 lg:max-w-[360px]">
            <h2 className="font-semibold">New course</h2>
            <form action={createCourse} className="mt-4 grid gap-3 text-sm">
              <label className="grid gap-1">
                <span className="text-[13px] font-semibold">Code</span>
                <input name="code" required placeholder="CSE241" className="h-10 rounded-lg border border-[#9ca3af] px-3" />
              </label>
              <label className="grid gap-1">
                <span className="text-[13px] font-semibold">Title</span>
                <input name="title" required placeholder="Information Security" className="h-10 rounded-lg border border-[#9ca3af] px-3" />
              </label>
              <label className="grid gap-1">
                <span className="text-[13px] font-semibold">Term</span>
                <input name="term" required placeholder="Spring 2026" className="h-10 rounded-lg border border-[#9ca3af] px-3" />
              </label>
              <SubmitButton>Create course</SubmitButton>
            </form>
          </Card>
        ) : null}
      </div>
    </>
  );
}
