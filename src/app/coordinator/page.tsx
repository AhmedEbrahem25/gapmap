import type { Metadata } from "next";
import { and, eq, inArray } from "drizzle-orm";
import { Download } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { PortalHeader } from "@/components/shell/portal-header";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedBar, CountUp, Stagger, StaggerItem } from "@/components/ui/motion";
import { pct } from "@/lib/utils";

export const metadata: Metadata = { title: "Programme overview" };

export default async function CoordinatorPage() {
  const user = await requireRole("coordinator", "admin");
  const courses = db.select({ c: s.courses, instructor: s.users.name }).from(s.courses).innerJoin(s.users, eq(s.users.id, s.courses.instructorId)).all();

  return (
    <div className="min-h-screen">
      <PortalHeader user={user} label="Coordinator" />
      <main className="mx-auto flex max-w-[1200px] flex-col gap-6 px-5 py-8">
        <PageHeader title="Programme overview" sub="Class-level trends across courses. Individual papers stay with each course's instructors." />
        {courses.map(({ c, instructor }) => {
          const concepts = db.select().from(s.concepts).where(eq(s.concepts.courseId, c.id)).all();
          const enrol = db.select().from(s.enrollments).where(and(eq(s.enrollments.courseId, c.id), eq(s.enrollments.role, "student"))).all();
          const sections = Array.from(new Set(enrol.map((e) => e.section))).sort();
          const attempts = enrol.length ? db.select().from(s.attempts).where(inArray(s.attempts.studentId, enrol.map((e) => e.userId))).all() : [];
          const exams = db.select().from(s.exams).where(eq(s.exams.courseId, c.id)).all();
          const papers = exams.length ? db.select().from(s.papers).where(inArray(s.papers.examId, exams.map((e) => e.id))).all() : [];
          const answers = papers.length ? db.select({ status: s.answers.status }).from(s.answers).where(inArray(s.answers.paperId, papers.map((p) => p.id))).all() : [];
          const alerts = db.select().from(s.alerts).where(eq(s.alerts.courseId, c.id)).all();
          const decisions = exams.length ? db.select().from(s.classDecisions).where(inArray(s.classDecisions.examId, exams.map((e) => e.id))).all() : [];
          const reviewed = answers.filter((a) => a.status === "approved" || a.status === "released").length;
          const sectionOf = new Map(enrol.map((e) => [e.userId, e.section]));
          return (
            <section key={c.id} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-bold">
                  {c.code} · {c.title} <span className="text-base font-normal text-ink-2">· {instructor} · {c.term}</span>
                </h2>
                <a href={`/api/export?course=${c.id}`} className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#d1d5db] bg-white px-4 text-sm font-semibold hover:bg-ground">
                  <Download size={16} aria-hidden /> Export class report (CSV)
                </a>
              </div>
              <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {[
                  ["Students", <CountUp key="a" to={enrol.length} />],
                  ["Answers reviewed", <span key="b">{pct(reviewed, answers.length)}%</span>],
                  ["Open support alerts", <CountUp key="c" to={alerts.filter((x) => x.status === "open").length} />],
                  ["Class decisions logged", <CountUp key="d" to={decisions.length} />],
                ].map(([label, value]) => (
                  <StaggerItem key={label as string}>
                    <Card className="flex flex-col gap-1 p-5">
                      <span className="text-[13px] text-ink-2">{label}</span>
                      <strong className="text-[26px] leading-8">{value}</strong>
                    </Card>
                  </StaggerItem>
                ))}
              </Stagger>
              <div className="grid gap-5 lg:grid-cols-2">
                <Card className="flex flex-col gap-3 p-5">
                  <h3 className="font-semibold">Mastery by concept and section</h3>
                  <div className="flex gap-4 text-xs text-ink-2">
                    {sections.map((sec, i) => (
                      <span key={sec} className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: i === 0 ? "#B51834" : "#9CA3AF" }} /> Section {sec}
                      </span>
                    ))}
                  </div>
                  {concepts.map((con) => {
                    const rows = attempts.filter((a) => a.conceptId === con.id);
                    if (!rows.length) return null;
                    return (
                      <div key={con.id} className="flex flex-col gap-1.5">
                        <span className="text-sm">{con.name}</span>
                        {sections.map((sec, i) => {
                          const r = rows.filter((a) => sectionOf.get(a.studentId) === sec);
                          const v = pct(r.reduce((t, x) => t + x.score, 0), r.reduce((t, x) => t + x.maxScore, 0));
                          return (
                            <div key={sec} className="grid grid-cols-[1fr_44px] items-center gap-2">
                              <AnimatedBar value={v} color={i === 0 ? "#B51834" : "#9CA3AF"} height={7} />
                              <span className="text-right text-xs font-semibold">{v}%</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </Card>
                <Card className="flex flex-col gap-3 p-5">
                  <h3 className="font-semibold">What instructors decided</h3>
                  {decisions.length ? (
                    <ul className="flex flex-col gap-2 text-sm">
                      {decisions.map((d) => (
                        <li key={d.id} className="rounded-lg bg-ground px-3 py-2">
                          <Badge tone="primary">{d.decision.replace("_", " ")}</Badge> <span className="ml-1">{concepts.find((x) => x.id === d.conceptId)?.name}</span>
                          {d.note ? <span className="mt-1 block text-xs text-ink-2">{d.note}</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink-2">No class decisions logged yet.</p>
                  )}
                </Card>
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
