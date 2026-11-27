import { and, eq, inArray } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { staffCourses } from "@/lib/data";
import { StaffNav } from "@/components/shell/staff-nav";
import { partnersEnabled } from "@/lib/features";
import { UserMenu } from "@/components/shell/user-menu";

export default async function InstructorLayout({ children }: LayoutProps<"/instructor">) {
  const user = await requireRole("instructor", "ta", "admin");
  const courseIds = staffCourses(user).map((c) => c.id);
  const threads = courseIds.length
    ? db.select({ id: s.threads.id }).from(s.threads).where(and(inArray(s.threads.courseId, courseIds), eq(s.threads.status, "open"))).all().length
    : 0;
  const alerts = courseIds.length
    ? db.select({ id: s.alerts.id }).from(s.alerts).where(and(inArray(s.alerts.courseId, courseIds), eq(s.alerts.status, "open"))).all().length
    : 0;
  return (
    <div className="min-h-screen lg:flex">
      <StaffNav counts={{ threads, alerts }} footer={<UserMenu user={user} />} partners={partnersEnabled()} />
      <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}
