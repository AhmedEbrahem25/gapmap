import type { Metadata } from "next";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { BellRing, RefreshCw } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { primaryCourse } from "@/lib/data";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { actOnAlert, recomputeAlerts } from "@/lib/actions/instructor";
import { formatDate, fmtMarks } from "@/lib/utils";

export const metadata: Metadata = { title: "Early support alerts" };

export default async function AlertsPage() {
  const user = await requireRole("instructor", "ta", "admin");
  const course = primaryCourse(user);
  if (!course) return <EmptyState title="No course" body="Alerts appear once students have several assessments." />;
  const alerts = db
    .select({ alert: s.alerts, student: s.users.name, concept: s.concepts.name })
    .from(s.alerts)
    .innerJoin(s.users, eq(s.users.id, s.alerts.studentId))
    .innerJoin(s.concepts, eq(s.concepts.id, s.alerts.conceptId))
    .where(eq(s.alerts.courseId, course.id))
    .orderBy(asc(s.alerts.status), desc(s.alerts.createdAt))
    .all();
  const attempts = alerts.length
    ? db
        .select()
        .from(s.attempts)
        .where(and(inArray(s.attempts.studentId, alerts.map((a) => a.alert.studentId)), inArray(s.attempts.conceptId, alerts.map((a) => a.alert.conceptId))))
        .orderBy(asc(s.attempts.date))
        .all()
    : [];
  const rated = alerts.filter((a) => a.alert.useful !== null);
  const precision = rated.length ? Math.round((rated.filter((a) => a.alert.useful).length / rated.length) * 100) : null;

  return (
    <>
      <PageHeader
        title="Early support alerts"
        sub="Students who are passing overall but keep missing a concept the next unit builds on."
        actions={
          <>
            {precision !== null ? <Badge tone="primary">{precision}% rated useful</Badge> : null}
            <form action={recomputeAlerts}>
              <input type="hidden" name="courseId" value={course.id} />
              <SubmitButton variant="secondary" pendingText="Checking…">
                <RefreshCw size={15} aria-hidden /> Check for new alerts
              </SubmitButton>
            </form>
          </>
        }
      />
      {alerts.length === 0 ? (
        <EmptyState title="No alerts" body="Nobody is currently passing while repeatedly missing a prerequisite." />
      ) : (
        <Stagger className="grid gap-5 xl:grid-cols-2">
          {alerts.map(({ alert: a, student, concept }) => {
            const rows = attempts.filter((x) => x.studentId === a.studentId && x.conceptId === a.conceptId);
            return (
              <StaggerItem key={a.id}>
                <Card className="flex h-full flex-col gap-4 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-[17px] font-semibold">
                      <BellRing size={18} className="text-partial" aria-hidden /> {student}
                    </h2>
                    <Badge tone={a.status === "open" ? "partial" : a.status === "actioned" ? "met" : "neutral"}>
                      {a.status === "open" ? "Prerequisite at risk" : a.status === "actioned" ? "Action taken" : "Dismissed"}
                    </Badge>
                  </div>
                  <p className="text-[15px] leading-[23px]">{a.summary}</p>
                  <table className="text-sm">
                    <thead className="text-left text-xs font-semibold text-ink-2">
                      <tr>
                        <th className="pb-2">Date</th>
                        <th className="pb-2">Assessment · {concept}</th>
                        <th className="pb-2 text-right">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const ratio = r.score / r.maxScore;
                        return (
                          <tr key={r.id} className="border-t border-line-2">
                            <td className="py-2">{formatDate(r.date)}</td>
                            <td>{r.label}</td>
                            <td className={`text-right font-semibold ${ratio < 0.4 ? "text-missing" : ratio < 0.8 ? "text-partial" : "text-met"}`}>
                              {fmtMarks(r.score)}/{fmtMarks(r.maxScore)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="rounded-[10px] bg-ground px-3.5 py-3 text-sm leading-[21px]">
                    <strong>Suggested:</strong> {a.suggestion}
                  </p>
                  {a.status === "open" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        ["assign_practice", "Assign practice", "primary"],
                        ["check_in", "Schedule check-in", "secondary"],
                        ["dismiss", "Dismiss", "ghost"],
                      ].map(([action, label, variant]) => (
                        <form key={action} action={actOnAlert}>
                          <input type="hidden" name="alertId" value={a.id} />
                          <input type="hidden" name="action" value={action} />
                          <SubmitButton variant={variant as "primary" | "secondary" | "ghost"}>{label}</SubmitButton>
                        </form>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-met">{a.action === "assign_practice" ? "Practice set added to the student's study plan." : a.action === "check_in" ? "Check-in scheduled." : "Dismissed."}</p>
                  )}
                  <div className="mt-auto flex items-center gap-2 border-t border-line-2 pt-3 text-[13px] text-ink-2">
                    Was this alert useful?
                    {a.useful === null ? (
                      ["useful", "not_useful"].map((v) => (
                        <form key={v} action={actOnAlert}>
                          <input type="hidden" name="alertId" value={a.id} />
                          <input type="hidden" name="action" value={v} />
                          <SubmitButton size="sm" variant="secondary" className="h-8">
                            {v === "useful" ? "Yes" : "No"}
                          </SubmitButton>
                        </form>
                      ))
                    ) : (
                      <strong className="text-ink">{a.useful ? "Yes, thanks" : "Noted"}</strong>
                    )}
                  </div>
                </Card>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
    </>
  );
}
