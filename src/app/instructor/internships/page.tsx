import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { Briefcase, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { partnersEnabled } from "@/lib/features";
import { db, schema as s } from "@/lib/db";
import { staffCourses } from "@/lib/data";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge, StatusChip, statusFromRatio } from "@/components/ui/badge";
import { EvidenceQuote } from "@/components/ui/quote";
import { SubmitButton } from "@/components/ui/submit-button";
import { AnimatedBar, Stagger, StaggerItem } from "@/components/ui/motion";
import { nominate } from "@/lib/actions/instructor";
import { cn, formatDate, fmtMarks, pct } from "@/lib/utils";

export const metadata: Metadata = { title: "Internships" };

export default async function InternshipsPage({ searchParams }: PageProps<"/instructor/internships">) {
  const user = await requireRole("instructor", "ta", "admin");
  if (!partnersEnabled()) notFound();
  const sp = await searchParams;
  const vacancies = db
    .select({ v: s.vacancies, company: s.companies.name })
    .from(s.vacancies)
    .innerJoin(s.companies, eq(s.companies.id, s.vacancies.companyId))
    .where(eq(s.vacancies.status, "open"))
    .all();
  if (!vacancies.length) return <EmptyState title="No open vacancies" body="Matching vacancies appear here." />;
  const current = vacancies.find((x) => x.v.id === sp.v) ?? vacancies[0]!;
  const courseIds = staffCourses(user).map((c) => c.id);
  const students = courseIds.length
    ? db
        .select({ id: s.users.id, name: s.users.name, section: s.enrollments.section })
        .from(s.enrollments)
        .innerJoin(s.users, eq(s.users.id, s.enrollments.userId))
        .where(and(inArray(s.enrollments.courseId, courseIds), eq(s.enrollments.role, "student"), eq(s.users.recruitOptIn, true)))
        .all()
    : [];
  const conceptIds = current.v.conceptIds;
  const attempts = students.length && conceptIds.length
    ? db.select().from(s.attempts).where(and(inArray(s.attempts.studentId, students.map((x) => x.id)), inArray(s.attempts.conceptId, conceptIds))).all()
    : [];
  const evidence = students.length && conceptIds.length
    ? db
        .select({ answer: s.answers, question: s.questions, studentId: s.papers.studentId })
        .from(s.answers)
        .innerJoin(s.papers, eq(s.papers.id, s.answers.paperId))
        .innerJoin(s.questions, eq(s.questions.id, s.answers.questionId))
        .where(and(inArray(s.papers.studentId, students.map((x) => x.id)), inArray(s.questions.conceptId, conceptIds), eq(s.answers.status, "released")))
        .all()
    : [];
  const nominations = db.select().from(s.nominations).where(eq(s.nominations.vacancyId, current.v.id)).all();
  const mine = nominations.filter((n) => n.nominatedBy === user.id).length;
  const quota = user.role === "ta" ? 1 : 2;
  const conceptNames = new Map(db.select().from(s.concepts).where(inArray(s.concepts.id, conceptIds.length ? conceptIds : ["-"])).all().map((c) => [c.id, c.name]));

  const ranked = students
    .map((st) => {
      const a = attempts.filter((x) => x.studentId === st.id);
      const score = pct(a.reduce((t, x) => t + x.score, 0), a.reduce((t, x) => t + x.maxScore, 0));
      return { ...st, score, hasEvidence: a.length > 0, nomination: nominations.find((n) => n.studentId === st.id) };
    })
    .filter((x) => x.hasEvidence)
    .sort((a, b) => b.score - a.score);

  return (
    <>
      <PageHeader title="Internships" sub="Opted-in students, ranked. You nominate." />
      <div className="flex flex-wrap gap-2">
        {vacancies.map((x) => (
          <Link
            key={x.v.id}
            href={`/instructor/internships?v=${x.v.id}`}
            className={cn("rounded-full border px-3.5 py-1.5 text-sm font-semibold transition", x.v.id === current.v.id ? "border-primary-600 bg-primary-600 text-white" : "border-line bg-white hover:border-primary-200")}
          >
            {x.v.title} · {x.company}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <Card className="flex w-full flex-col gap-3 p-5 lg:max-w-[340px]">
          <Briefcase className="text-primary-600" size={22} aria-hidden />
          <h2 className="text-lg font-semibold">{current.v.title}</h2>
          <p className="text-sm text-ink-2">
            {current.company} · closes {formatDate(current.v.closes)}
          </p>
          <p className="text-sm leading-[21px]">{current.v.description}</p>
          <div className="flex flex-wrap gap-1.5">
            {current.v.skills.map((sk) => (
              <Badge key={sk} tone="primary">
                {sk}
              </Badge>
            ))}
          </div>
          <div className="mt-2 rounded-[10px] bg-ground p-3 text-sm">
            Your nominations: <strong>{Math.max(0, quota - mine)} of {quota}</strong> left
          </div>
          <p className="flex gap-2 text-xs leading-[18px] text-ink-2">
            <ShieldCheck size={16} className="shrink-0 text-met" aria-hidden /> The company sees only students you nominate, with the evidence you reviewed.
          </p>
        </Card>

        <Stagger className="flex min-w-0 flex-[999_1_480px] flex-col gap-3">
          {ranked.length === 0 ? <EmptyState title="No candidates yet" body="Opted-in students with released work on these concepts appear here." /> : null}
          {ranked.map((c, i) => {
            const ev = evidence.filter((e) => e.studentId === c.id).sort((a, b) => a.question.number - b.question.number);
            return (
              <StaggerItem key={c.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-sm font-bold text-primary-800">{i + 1}</span>
                    <div className="min-w-[180px] flex-1">
                      <strong className="text-base">{c.name}</strong>
                      <div className="mt-1 flex items-center gap-2">
                        <AnimatedBar value={c.score} color={c.score >= 80 ? "#0F766E" : c.score >= 50 ? "#B45309" : "#B91C1C"} height={6} className="max-w-[160px]" />
                        <span className="text-xs text-ink-2">{c.score}% on required concepts</span>
                      </div>
                    </div>
                    {c.nomination ? (
                      <Badge tone="met">{c.nomination.status === "interview" ? "Interview requested" : "Nominated"}</Badge>
                    ) : (
                      <form action={nominate}>
                        <input type="hidden" name="vacancyId" value={current.v.id} />
                        <input type="hidden" name="studentId" value={c.id} />
                        <SubmitButton size="sm" className={mine >= quota ? "opacity-50" : ""}>
                          Nominate
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-semibold text-primary-600">View evidence ({ev.length} assessed answers)</summary>
                    <div className="mt-3 flex flex-col gap-3">
                      {ev.map((e) => (
                        <div key={e.answer.id} className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-ink-2">
                              Q{e.question.number} · {conceptNames.get(e.question.conceptId ?? "")}
                            </span>
                            <StatusChip status={statusFromRatio(e.answer.finalMarks ?? 0, e.question.maxMarks)} suffix={`${fmtMarks(e.answer.finalMarks)}/${fmtMarks(e.question.maxMarks)}`} />
                          </div>
                          <EvidenceQuote className={e.question.prompt.toLowerCase().includes("query") ? "font-mono text-sm" : ""}>{e.answer.transcription}</EvidenceQuote>
                        </div>
                      ))}
                    </div>
                  </details>
                </Card>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </>
  );
}
