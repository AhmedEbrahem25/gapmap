import type { Metadata } from "next";
import { TourButton } from "@/components/tour";
import { partnersEnabled } from "@/lib/features";
import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { LogOut, Briefcase, ChevronRight, Compass } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { masteryByConcept } from "@/lib/data";
import { profileFor, activeCourse } from "@/lib/student";
import { StudentHeader } from "@/components/shell/student-header";
import { Badge, StatusChip, statusFromRatio } from "@/components/ui/badge";
import { AnimatedBar, Stagger, StaggerItem } from "@/components/ui/motion";
import { SubmitButton } from "@/components/ui/submit-button";
import { toggleOptIn } from "@/lib/actions/student";
import { logout } from "@/lib/actions/auth";
import { initials, pct } from "@/lib/utils";

export const metadata: Metadata = { title: "Me" };

const barColor = { met: "#0F766E", partial: "#B45309", missing: "#B91C1C" } as const;

export default async function MePage() {
  const user = await requireRole("student");
  const enrolled = await activeCourse(user.id);
  const profile = profileFor(user.id);
  const concepts = enrolled ? db.select().from(s.concepts).where(eq(s.concepts.courseId, enrolled.course.id)).all() : [];
  const mastery = masteryByConcept(user.id);
  const vacancies = concepts.length
    ? db
        .select({ v: s.vacancies, company: s.companies.name })
        .from(s.vacancies)
        .innerJoin(s.companies, eq(s.companies.id, s.vacancies.companyId))
        .where(eq(s.vacancies.status, "open"))
        .all()
    : [];
  const noms = db
    .select()
    .from(s.nominations)
    .where(and(eq(s.nominations.studentId, user.id), inArray(s.nominations.vacancyId, vacancies.length ? vacancies.map((v) => v.v.id) : ["-"])))
    .all();

  return (
    <>
      <StudentHeader eyebrow={enrolled ? `${enrolled.course.title} · Section ${enrolled.section}` : undefined} title="Me" />
      <Stagger className="flex flex-col gap-3.5 px-5">
        <StaggerItem>
          <section className="flex items-center gap-3 rounded-sheet border border-line bg-white p-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-met-soft text-lg font-bold text-met">{initials(user.name)}</span>
            <span className="min-w-0 flex-1">
              <strong className="block">{user.name}</strong>
              <span className="block truncate text-[13px] text-ink-2">{user.email}</span>
            </span>
            <TourButton id="student" className="flex h-11 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-semibold text-primary-700 hover:bg-primary-50">
              <Compass size={16} aria-hidden /> Tour
            </TourButton>
            <form action={logout}>
              <button aria-label="Sign out" className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-2 hover:bg-ground">
                <LogOut size={18} />
              </button>
            </form>
          </section>
        </StaggerItem>

        <StaggerItem>
          <section className="flex flex-col gap-2 rounded-sheet border border-line bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">How you like to study</h2>
              <Link href="/student/profile?next=/student/me" className="text-[13px] font-medium">
                {profile ? "Edit" : "Set up"}
              </Link>
            </div>
            {profile ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {profile.traits.map((t) => (
                    <span key={t} className="inline-flex h-[26px] items-center rounded-full border border-line bg-ground px-2.5 text-xs font-medium">
                      {t}
                    </span>
                  ))}
                </div>
                <p className="text-[13px] leading-[19px] text-ink-2">{profile.summary}</p>
              </>
            ) : (
              <p className="text-[13px] text-ink-2">Answer 4 short questions so activities match how you learn.</p>
            )}
          </section>
        </StaggerItem>

        <StaggerItem>
          <section className="rounded-sheet border border-line bg-white px-4 pt-4 pb-2">
            <h2 className="text-sm font-semibold">Progress by concept</h2>
            {concepts.map((c, i) => {
              const m = mastery.get(c.id);
              if (!m) return null;
              const st = statusFromRatio(m.score, m.max);
              return (
                <div key={c.id} className="flex flex-col gap-1.5 border-t border-line-2 py-2.5 first-of-type:border-0">
                  <div className="flex items-center justify-between text-sm">
                    <span>{c.name}</span>
                    <StatusChip status={st} suffix={`${pct(m.score, m.max)}%`} className="h-[22px]" />
                  </div>
                  <AnimatedBar value={pct(m.score, m.max)} color={barColor[st]} height={6} delay={0.1 + i * 0.06} />
                </div>
              );
            })}
          </section>
        </StaggerItem>

        {partnersEnabled() ? (
          <StaggerItem>
            <section className="flex flex-col gap-3 rounded-sheet border border-line bg-white p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Briefcase size={16} aria-hidden /> Opportunities
              </h2>
              <form action={toggleOptIn} className="flex items-center justify-between gap-3 text-sm">
                <label htmlFor="optIn" className="leading-5">
                  Let my instructors consider me for internships, using my assessed work
                </label>
                <input id="optIn" type="checkbox" name="optIn" defaultChecked={user.recruitOptIn} className="h-5 w-5 shrink-0 accent-primary-600" />
                <SubmitButton size="sm" variant="secondary">
                  Save
                </SubmitButton>
              </form>
              {vacancies.map(({ v, company }) => {
                const n = noms.find((x) => x.vacancyId === v.id);
                return (
                  <div key={v.id} className="flex items-center justify-between gap-2 rounded-xl bg-ground px-3 py-2.5 text-sm">
                    <span>
                      <strong className="block">{v.title}</strong>
                      <span className="text-xs text-ink-2">{company}</span>
                    </span>
                    {n ? (
                      <Badge tone="met">{n.status === "interview" ? "Interview requested" : "Nominated"}</Badge>
                    ) : (
                      <ChevronRight size={16} className="text-ink-3" />
                    )}
                  </div>
                );
              })}
              <p className="text-xs text-ink-2">Companies only see students their instructors nominate.</p>
            </section>
          </StaggerItem>
        ) : null}
      </Stagger>
    </>
  );
}
