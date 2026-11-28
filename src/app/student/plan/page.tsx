import type { Metadata } from "next";
import { CourseSwitch } from "@/components/student/course-switch";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ChevronRight, FlaskConical, Map, BookOpenCheck, PenLine, Lightbulb } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { masteryByConcept } from "@/lib/data";
import { profileFor, activeCourse } from "@/lib/student";
import { StudentHeader } from "@/components/shell/student-header";
import { Badge, StatusChip, statusFromRatio } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/page-header";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { pct } from "@/lib/utils";
import { SubmitButton } from "@/components/ui/submit-button";
import { switchApproach } from "@/lib/actions/student";
import { ACTIVITY_LABEL, NOT_HELPING_IN_A_ROW, shouldSuggestSwitch } from "@/lib/profile-rules";
import type { ActivityType } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Study plan" };

const activityIcon = { experiment: FlaskConical, mind_map: Map, worked_example: BookOpenCheck, own_words: PenLine, try_first: Lightbulb } as const;

export default async function PlanPage() {
  const user = await requireRole("student");
  const activities = db.select({ a: s.activities, concept: s.concepts.name }).from(s.activities).innerJoin(s.concepts, eq(s.concepts.id, s.activities.conceptId)).where(eq(s.activities.studentId, user.id)).orderBy(asc(s.activities.priority)).all();
  const enrolled = await activeCourse(user.id);
  const concepts = enrolled ? db.select().from(s.concepts).where(eq(s.concepts.courseId, enrolled.course.id)).all() : [];
  const mastery = masteryByConcept(user.id);
  const weak = concepts
    .map((c) => ({ c, m: mastery.get(c.id) }))
    .filter((x) => x.m && x.m.score / x.m.max < 0.8);
  const profile = profileFor(user.id);
  // The check-in orders the plan: "master it" puts concepts that later units build on first, otherwise weakest first.
  const buildsOn = (id: string) => concepts.filter((c) => c.prerequisiteId === id).length;
  const ratio = (x: (typeof weak)[number]) => x.m!.score / x.m!.max;
  weak.sort((a, b) => (profile?.answers.goal === "master" ? buildsOn(b.c.id) - buildsOn(a.c.id) : 0) || ratio(a) - ratio(b));
  // About 15 minutes per step, so the daily time from the check-in decides how many steps are for today.
  const todaySteps = profile ? Math.max(1, Math.floor(profile.minutesPerDay / 15)) : 0;
  const todo = activities.filter((x) => x.a.status !== "done");
  // The student's own ratings: two "not really" in a row for their preferred type brings a suggestion, never an automatic change.
  const rated = [...activities].sort((x, y) => x.a.createdAt.getTime() - y.a.createdAt.getTime()).map((x) => x.a);
  const suggestSwitch = profile && todo.length ? shouldSuggestSwitch(rated, profile.preferredActivity) : false;
  const others = (Object.keys(ACTIVITY_LABEL) as ActivityType[]).filter((t) => t !== profile?.preferredActivity);
  const done = activities.filter((x) => x.a.status === "done");

  return (
    <>
      <StudentHeader eyebrow={enrolled?.course.title} title="Study plan" />
      <Stagger className="flex flex-col gap-3.5 px-5">
        <CourseSwitch userId={user.id} activeId={enrolled?.course.id} next="/student/plan" />
        {!profile ? (
          <StaggerItem>
            <Link href="/student/profile?next=/student/plan" className="flex items-center gap-3 rounded-2xl border border-primary-200 bg-primary-50 p-4 text-sm">
              <span className="flex-1">
                <strong className="block">5-question check-in</strong>
                <span className="text-ink-2">Personalises your plan. 1 minute.</span>
              </span>
              <ChevronRight size={18} className="text-primary-600" aria-hidden />
            </Link>
          </StaggerItem>
        ) : null}
        {suggestSwitch && profile ? (
          <StaggerItem>
            <section aria-label="Try another approach" className="flex flex-col gap-2.5 rounded-sheet border border-primary-200 bg-primary-50 p-4">
              <h2 className="text-sm font-semibold">{ACTIVITY_LABEL[profile.preferredActivity]} haven&apos;t helped much lately</h2>
              <p className="text-sm leading-[21px] text-ink-2">You rated the last {NOT_HELPING_IN_A_ROW} &ldquo;not really&rdquo;. Want to try another approach for your next activities?</p>
              <div className="flex flex-wrap gap-2">
                {others.map((t) => (
                  <form key={t} action={switchApproach}>
                    <input type="hidden" name="type" value={t} />
                    <SubmitButton variant="secondary" size="sm">
                      {ACTIVITY_LABEL[t]}
                    </SubmitButton>
                  </form>
                ))}
              </div>
            </section>
          </StaggerItem>
        ) : null}
        <StaggerItem>
          <h2 className="mb-2 text-sm font-semibold text-ink-2">
            Up next{profile ? ` · ${profile.minutesPerDay} min a day` : ""}
          </h2>
          {todo.length ? (
            <ul className="flex flex-col gap-2">
              {todo.map(({ a, concept }, i) => {
                const Icon = activityIcon[a.type];
                return (
                  <li key={a.id}>
                    <Link href={`/student/plan/${a.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 transition hover:-translate-y-px hover:shadow-lift">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                        <Icon size={20} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 text-sm">
                        <strong className="block">{a.title}</strong>
                        <span className="text-ink-2">{concept}</span>
                      </span>
                      {i < todaySteps ? <Badge tone="met">Today</Badge> : null}
                      {a.status === "submitted" ? <Badge tone="partial">Revise</Badge> : <ChevronRight size={18} className="text-ink-3" aria-hidden />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="Nothing queued" body="Finish a fix from Home to get an activity." />
          )}
        </StaggerItem>
        {weak.length ? (
          <StaggerItem>
            <section className="rounded-sheet border border-line bg-white p-4">
              <h2 className="text-sm font-semibold">All exams, weakest first</h2>
              <ol className="mt-2 flex flex-col">
                {weak.map(({ c, m }, i) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 border-t border-line-2 py-2.5 text-sm first:border-0">
                    <span>
                      <span className="mr-2 font-semibold text-ink-3">{i + 1}</span>
                      {c.name}
                    </span>
                    <StatusChip status={statusFromRatio(m!.score, m!.max)} suffix={`${pct(m!.score, m!.max)}%`} />
                  </li>
                ))}
              </ol>
            </section>
          </StaggerItem>
        ) : null}
        {done.length ? (
          <StaggerItem>
            <h2 className="mb-2 text-sm font-semibold text-ink-2">Done</h2>
            <ul className="flex flex-col gap-2">
              {done.map(({ a, concept }) => (
                <li key={a.id}>
                  <Link href={`/student/plan/${a.id}`} className="flex items-center justify-between rounded-2xl border border-line bg-white px-4 py-3 text-sm">
                    <span>
                      {a.title} <span className="text-ink-2">· {concept}</span>
                    </span>
                    <StatusChip status="met" />
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
