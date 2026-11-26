import { requireRole } from "@/lib/auth";
import { StudentTabs } from "@/components/shell/student-tabs";

export default async function StudentLayout({ children }: LayoutProps<"/student">) {
  await requireRole("student");
  return (
    <div className="min-h-screen bg-[#eceef3] sm:py-0">
      <div className="mx-auto min-h-screen max-w-[480px] bg-ground pb-24 sm:shadow-[0_0_0_1px_#e5e7eb,0_20px_60px_-30px_rgb(17_24_39/0.35)]">{children}</div>
      <StudentTabs />
    </div>
  );
}
