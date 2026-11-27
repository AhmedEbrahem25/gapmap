import Link from "next/link";
import { studentCourses } from "@/lib/data";
import { cn } from "@/lib/utils";

/** Course chips for students who take more than one course. */
export function CourseSwitch({ userId, activeId, next }: { userId: string; activeId?: string; next: string }) {
  const courses = studentCourses(userId);
  if (courses.length < 2) return null;
  return (
    <nav aria-label="Course" className="-mx-5 mb-1 flex gap-2 overflow-x-auto px-5 pb-1">
      {courses.map(({ course }) => (
        <Link
          key={course.id}
          href={`/student/course/${course.id}?next=${encodeURIComponent(next)}`}
          aria-current={course.id === activeId ? "page" : undefined}
          className={cn(
            "inline-flex h-8 shrink-0 items-center rounded-full px-3 text-sm font-semibold transition",
            course.id === activeId ? "bg-primary-600 text-white" : "border border-line bg-white text-ink-2 hover:border-primary-200",
          )}
        >
          {course.title}
        </Link>
      ))}
    </nav>
  );
}
