import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ChevronRight, Sparkles } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { activeCourse } from "@/lib/student";
import { CourseSwitch } from "@/components/student/course-switch";
import { db, schema as s } from "@/lib/db";
import { masteryByConcept } from "@/lib/data";
import { StudentHeader } from "@/components/shell/student-header";
import { StatusChip, statusFromRatio } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { startRetest } from "@/lib/actions/student";
import { fmtMarks, pct } from "@/lib/utils";

export const metadata: Metadata = { title: "Practice" };

export default async function PracticePage() {
  const user = await requireRole("student");
  const enrolled = await activeCourse(user.id);
  const concepts = enrolled ? db.select().from(s.concepts).where(eq(s.concepts.courseId, enrolled.course.id)).all() : [];
  const mastery = masteryByConcept(user.id);
  const items = db.select({ i: s.practiceItems, concept: s.concepts.name }).from(s.practiceItems).innerJoin(s.concepts, eq(s.concepts.id, s.practiceItems.conceptId)).where(eq(s.practiceItems.studentId, user.id)).orderBy(desc(s.practiceItems.createdAt)).all();
  const ranked = concepts
    .map((c) => ({ c, m: mastery.get(c.id) }))
    .sort((a, b) => (a.m ? a.m.score / a.m.max : 2) - (b.m ? b.m.score / b.m.max : 2));

  return (
    <>
      <StudentHeader eyebrow={enrolled?.course.title} title="Practice & fresh tests" />
      <Stagger className="flex flex-col gap-3.5 px-5">
        <CourseSwitch userId={user.id} activeId={enrolled?.course.id} next="/student/practice" />
        <StaggerItem>
          <p className="text-sm leading-[21px] text-ink-2">A new question for each gap, to check you&apos;ve got it.</p>
        </StaggerItem>
        {ranked.map(({ c, m }) => (
          <StaggerItem key={c.id}>
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4">
              <span className="min-w-0 flex-1">
                <strong className="block text-sm">{c.name}</strong>
                {m ? <StatusChip status={statusFromRatio(m.score, m.max)} suffix={`${pct(m.score, m.max)}%`} className="mt-1" /> : <span className="text-xs text-ink-2">Not assessed yet</span>}
              </span>
              <form action={startRetest}>
                <input type="hidden" name="conceptId" value={c.id} />
                <SubmitButton size="sm" variant={m && m.score / m.max < 0.8 ? "primary" : "secondary"} pendingText="Writing…">
                  <Sparkles size={14} aria-hidden /> Fresh test
                </SubmitButton>
              </form>
            </div>
          </StaggerItem>
        ))}
        {items.length ? (
          <StaggerItem>
            <h2 className="mt-2 mb-2 text-sm font-semibold text-ink-2">Your attempts</h2>
            <ul className="flex flex-col gap-2">
              {items.map(({ i, concept }) => (
                <li key={i.id}>
                  <Link href={`/student/practice/${i.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      <strong>{concept}</strong> <span className="text-ink-2">· {i.prompt}</span>
                    </span>
                    {i.score !== null ? <StatusChip status={statusFromRatio(i.score, i.maxScore)} suffix={`${fmtMarks(i.score)}/${fmtMarks(i.maxScore)}`} /> : <ChevronRight size={18} className="text-ink-3" />}
                  </Link>
                </li>
              ))}
            </ul>
          </StaggerItem>
        ) : null}
      </Stagger>
    </>
  );
}
