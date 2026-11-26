import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { primaryCourse } from "@/lib/data";
import { EmptyState } from "@/components/ui/page-header";

export default async function InstructorHome() {
  const user = await requireRole("instructor", "ta", "admin");
  const course = primaryCourse(user);
  if (course) redirect(`/instructor/courses/${course.id}`);
  return <EmptyState title="No courses yet" body="Ask your platform admin to add a course and invite you as its instructor." />;
}
