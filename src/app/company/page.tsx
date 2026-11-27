import type { Metadata } from "next";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { partnersEnabled } from "@/lib/features";
import { db, schema as s } from "@/lib/db";
import { PortalHeader } from "@/components/shell/portal-header";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge, StatusChip, statusFromRatio } from "@/components/ui/badge";
import { EvidenceQuote } from "@/components/ui/quote";
import { SubmitButton } from "@/components/ui/submit-button";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { requestInterview, createVacancy, closeVacancy } from "@/lib/actions/company";
import { formatDate, fmtMarks } from "@/lib/utils";

export const metadata: Metadata = { title: "Partner portal" };

export default async function CompanyPage() {
  const user = await requireRole("company");
  if (!partnersEnabled()) notFound();
  const company = user.companyId ? db.select().from(s.companies).where(eq(s.companies.id, user.companyId)).get() : undefined;
  const vacancies = user.companyId ? db.select().from(s.vacancies).where(eq(s.vacancies.companyId, user.companyId)).orderBy(desc(s.vacancies.createdAt)).all() : [];
  const noms = vacancies.length
    ? db
        .select({ n: s.nominations, student: s.users.name, by: s.users.id })
        .from(s.nominations)
        .innerJoin(s.users, eq(s.users.id, s.nominations.studentId))
        .where(inArray(s.nominations.vacancyId, vacancies.map((v) => v.id)))
        .all()
    : [];
  const nominators = new Map(db.select({ id: s.users.id, name: s.users.name }).from(s.users).where(inArray(s.users.id, noms.length ? noms.map((x) => x.n.nominatedBy) : ["-"])).all().map((u) => [u.id, u.name]));

  return (
    <div className="min-h-screen">
      <PortalHeader user={user} label={company?.name ?? "Partner"} />
      <main className="mx-auto flex max-w-[1200px] flex-col gap-6 px-5 py-8">
        <PageHeader title="Vacancies & nominations" sub="Students nominated by faculty." />
        <div className="flex flex-wrap items-start gap-6">
          <Stagger className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
            {vacancies.length === 0 ? <EmptyState title="No vacancies yet" body="Post a vacancy and map it to the skills you need." /> : null}
            {vacancies.map((v) => {
              const list = noms.filter((x) => x.n.vacancyId === v.id);
              return (
                <StaggerItem key={v.id}>
                  <Card className="flex flex-col gap-4 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold">{v.title}</h2>
                        <p className="text-sm text-ink-2">Closes {formatDate(v.closes)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={v.status === "open" ? "met" : "neutral"}>{v.status === "open" ? "Open" : "Closed"}</Badge>
                        {v.status === "open" ? (
                          <form action={closeVacancy}>
                            <input type="hidden" name="vacancyId" value={v.id} />
                            <SubmitButton size="sm" variant="ghost">
                              Close
                            </SubmitButton>
                          </form>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {v.skills.map((sk) => (
                        <Badge key={sk} tone="primary">
                          {sk}
                        </Badge>
                      ))}
                    </div>
                    <h3 className="text-sm font-semibold">Faculty nominations ({list.length})</h3>
                    {list.length === 0 ? <p className="text-sm text-ink-2">No nominations yet.</p> : null}
                    {list.map(({ n, student }) => {
                      const evidence = db
                        .select({ answer: s.answers, question: s.questions })
                        .from(s.answers)
                        .innerJoin(s.papers, eq(s.papers.id, s.answers.paperId))
                        .innerJoin(s.questions, eq(s.questions.id, s.answers.questionId))
                        .where(and(eq(s.papers.studentId, n.studentId), eq(s.answers.status, "released"), inArray(s.questions.conceptId, v.conceptIds.length ? v.conceptIds : ["-"])))
                        .all();
                      return (
                        <div key={n.id} className="rounded-card border border-line p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <strong>{student}</strong>
                              <p className="text-xs text-ink-2">
                                Nominated by {nominators.get(n.nominatedBy)}
                                {n.note ? ` · “${n.note}”` : ""}
                              </p>
                            </div>
                            {n.status === "nominated" ? (
                              <div className="flex gap-2">
                                <form action={requestInterview}>
                                  <input type="hidden" name="nominationId" value={n.id} />
                                  <input type="hidden" name="decision" value="decline" />
                                  <SubmitButton size="sm" variant="secondary">
                                    Decline
                                  </SubmitButton>
                                </form>
                                <form action={requestInterview}>
                                  <input type="hidden" name="nominationId" value={n.id} />
                                  <SubmitButton size="sm">Request interview</SubmitButton>
                                </form>
                              </div>
                            ) : (
                              <Badge tone={n.status === "interview" ? "met" : "neutral"}>{n.status === "interview" ? "Interview requested" : "Declined"}</Badge>
                            )}
                          </div>
                          <details className="mt-3">
                            <summary className="cursor-pointer text-sm font-semibold text-primary-600">Assessed evidence ({evidence.length})</summary>
                            <div className="mt-3 flex flex-col gap-3">
                              {evidence.map((e) => (
                                <div key={e.answer.id} className="flex flex-col gap-1.5">
                                  <div className="flex items-center justify-between text-sm text-ink-2">
                                    <span>{e.question.prompt}</span>
                                    <StatusChip status={statusFromRatio(e.answer.finalMarks ?? 0, e.question.maxMarks)} suffix={`${fmtMarks(e.answer.finalMarks)}/${fmtMarks(e.question.maxMarks)}`} />
                                  </div>
                                  <EvidenceQuote>{e.answer.transcription}</EvidenceQuote>
                                </div>
                              ))}
                            </div>
                          </details>
                        </div>
                      );
                    })}
                  </Card>
                </StaggerItem>
              );
            })}
          </Stagger>
          <div className="flex w-full flex-col gap-4 lg:max-w-[360px]">
            <Card className="p-5">
              <h2 className="font-semibold">Post a vacancy</h2>
              <form action={createVacancy} className="mt-4 grid gap-3 text-sm">
                <label className="grid gap-1">
                  <span className="text-sm font-semibold">Title</span>
                  <input name="title" required placeholder="Junior data engineer" className="h-10 rounded-lg border border-[#9ca3af] px-3" />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-semibold">Description</span>
                  <textarea name="description" rows={3} className="rounded-lg border border-[#9ca3af] px-3 py-2" />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-semibold">Required skills (comma separated)</span>
                  <input name="skills" required placeholder="SQL joins, Foreign keys" className="h-10 rounded-lg border border-[#9ca3af] px-3" />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-semibold">Closes</span>
                  <input name="closes" type="date" className="h-10 rounded-lg border border-[#9ca3af] px-3" />
                </label>
                <SubmitButton>Post vacancy</SubmitButton>
              </form>
            </Card>
            <p className="flex gap-2 text-xs leading-[18px] text-ink-2">
              <ShieldCheck size={16} className="shrink-0 text-met" aria-hidden /> Students opt in before they can be nominated. You never see students who weren&apos;t nominated.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
