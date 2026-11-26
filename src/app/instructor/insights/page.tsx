import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { Sparkles, CheckCircle2, TriangleAlert } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { primaryCourse, courseExams, conceptsFor } from "@/lib/data";
import { examQuestions } from "@/lib/jobs";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { AnimatedBar, CountUp, Stagger, StaggerItem, FadeIn } from "@/components/ui/motion";
import { decideFlag, reclusterQuestion, addClassDecision } from "@/lib/actions/instructor";
import { cn, pct } from "@/lib/utils";

export const metadata: Metadata = { title: "Class insights" };

const decisionLabel: Record<string, string> = {
  clarify: "Clarify the wording",
  revisit_criteria: "Revisit the marking criteria",
  reteach: "Reteach in the next lecture",
};

export default async function InsightsPage({ searchParams }: PageProps<"/instructor/insights">) {
  const user = await requireRole("instructor", "ta", "admin");
  const sp = await searchParams;
  const course = primaryCourse(user);
  if (!course) return <EmptyState title="No course" body="Insights appear once a course has an analysed exam." />;
  const exams = courseExams(course.id);
  const exam = exams.find((e) => e.id === sp.exam) ?? exams[0];
  if (!exam) return <EmptyState title="No exams yet" body="Analyse an exam to see class patterns." />;
  const section = typeof sp.section === "string" ? sp.section : "all";
  const questions = examQuestions(exam.id);
  const concepts = conceptsFor(course.id);

  const papers = db
    .select()
    .from(s.papers)
    .where(section === "all" ? eq(s.papers.examId, exam.id) : and(eq(s.papers.examId, exam.id), eq(s.papers.section, section)))
    .all();
  const allSections = Array.from(new Set(db.select({ sec: s.papers.section }).from(s.papers).where(eq(s.papers.examId, exam.id)).all().map((p) => p.sec))).sort();
  const answers = papers.length
    ? db.select().from(s.answers).where(inArray(s.answers.paperId, papers.map((p) => p.id))).all().filter((a) => a.status !== "pending")
    : [];
  const studentOf = new Map(papers.map((p) => [p.id, p.studentId]));

  // Per-concept share of answers that are not fully met
  const qById = new Map(questions.map((q) => [q.id, q]));
  const conceptStats = concepts
    .map((c) => {
      const as = answers.filter((a) => qById.get(a.questionId)?.conceptId === c.id);
      const gaps = as.filter((a) => (a.finalMarks ?? a.suggestedMarks ?? 0) < (qById.get(a.questionId)?.maxMarks ?? 0));
      return { concept: c, total: as.length, share: as.length ? Math.round((gaps.length / as.length) * 100) : 0 };
    })
    .filter((x) => x.total > 0)
    .sort((a, b) => b.share - a.share);
  const weakest = conceptStats[0];

  const qStats = questions.map((q) => {
    const as = answers.filter((a) => a.questionId === q.id);
    const wrong = as.filter((a) => (a.finalMarks ?? a.suggestedMarks ?? 0) < q.maxMarks);
    return { q, rate: as.length ? Math.round((wrong.length / as.length) * 100) : 0 };
  });
  const worstQ = [...qStats].sort((a, b) => b.rate - a.rate)[0]?.q;
  const focusQ = questions.find((q) => q.number === Number(sp.q)) ?? worstQ ?? questions[0];

  // Students needing review: under 60% on the weakest concept
  const needing = new Set<string>();
  if (weakest) {
    for (const a of answers) {
      const q = qById.get(a.questionId);
      if (q?.conceptId === weakest.concept.id && (a.finalMarks ?? a.suggestedMarks ?? 0) / q.maxMarks < 0.6) {
        const sid = studentOf.get(a.paperId);
        if (sid) needing.add(sid);
      }
    }
  }
  const retests = needing.size
    ? db
        .select()
        .from(s.attempts)
        .where(and(inArray(s.attempts.studentId, Array.from(needing)), eq(s.attempts.source, "retest"), gte(s.attempts.date, exam.date)))
        .all()
    : [];
  const improved = new Set(retests.filter((r) => r.score / r.maxScore >= 0.8).map((r) => r.studentId));

  const misconceptions = focusQ ? db.select().from(s.misconceptions).where(eq(s.misconceptions.questionId, focusQ.id)).orderBy(desc(s.misconceptions.studentCount)).all() : [];
  const flags = questions.length ? db.select().from(s.questionFlags).where(inArray(s.questionFlags.questionId, questions.map((q) => q.id))).all() : [];
  const decisions = db
    .select({ d: s.classDecisions, concept: s.concepts.name })
    .from(s.classDecisions)
    .leftJoin(s.concepts, eq(s.concepts.id, s.classDecisions.conceptId))
    .where(eq(s.classDecisions.examId, exam.id))
    .orderBy(desc(s.classDecisions.createdAt))
    .all();
  const base = `/instructor/insights?exam=${exam.id}${section !== "all" ? `&section=${section}` : ""}`;

  return (
    <>
      <PageHeader
        crumb={
          <>
            Class insights / {course.title} · {exam.title}
          </>
        }
        title={weakest ? `${weakest.concept.name} need${weakest.concept.name.endsWith("s") ? "" : "s"} another pass before the next unit` : "Class insights"}
        actions={
          <form className="flex items-center gap-2 text-[13px] text-ink-2">
            <input type="hidden" name="exam" value={exam.id} />
            <label htmlFor="section">Section</label>
            <select id="section" name="section" defaultValue={section} className="h-9 rounded-lg border border-[#9ca3af] bg-white px-2 text-sm text-ink">
              <option value="all">All sections</option>
              {allSections.map((x) => (
                <option key={x} value={x}>
                  Section {x}
                </option>
              ))}
            </select>
            <button className="h-9 rounded-lg border border-[#d1d5db] bg-white px-3 text-sm font-semibold text-ink hover:bg-ground">Apply</button>
          </form>
        }
      />

      <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Papers analysed", value: <CountUp to={papers.length} /> },
          { label: "Students needing review", value: <CountUp to={needing.size} /> },
          { label: "Weakest concept", value: <span className="text-xl">{weakest?.concept.name ?? "—"}</span> },
          {
            label: "Improved on fresh test",
            value: (
              <span className="text-met">
                {improved.size} <span className="text-base font-semibold text-ink-2">of {needing.size}</span>
              </span>
            ),
          },
        ].map((k) => (
          <StaggerItem key={k.label}>
            <Card className="flex h-full flex-col gap-1 p-5">
              <span className="text-[13px] text-ink-2">{k.label}</span>
              <strong className="text-[26px] leading-8">{k.value}</strong>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>

      <div className="flex flex-wrap items-start gap-5">
        <Card className="flex min-w-0 flex-[1_1_400px] flex-col gap-3.5 p-5">
          <h2 className="font-semibold">Share of answers with a gap, by concept</h2>
          {conceptStats.map((c, i) => (
            <div key={c.concept.id} className="grid grid-cols-[150px_1fr_48px] items-center gap-3 text-sm">
              <span className="truncate">{c.concept.name}</span>
              <AnimatedBar value={c.share} height={12} color={i === 0 ? "#B45309" : c.share >= 35 ? "#D9A066" : "#9CA3AF"} delay={0.1 + i * 0.08} />
              <strong className="text-right">{c.share}%</strong>
            </div>
          ))}
          <div className="mt-1 border-t border-line-2 pt-3">
            <h3 className="text-sm font-semibold">By question</h3>
            <div className="mt-2 grid grid-cols-5 gap-2 text-center text-[13px]">
              {qStats.map(({ q, rate }) => (
                <Link
                  key={q.id}
                  href={`${base}&q=${q.number}`}
                  className={cn(
                    "rounded-lg py-2 transition hover:ring-2 hover:ring-primary-200",
                    rate >= 40 ? "bg-partial-soft text-partial-ink" : "bg-ground",
                    focusQ?.id === q.id && "ring-2 ring-primary-600",
                  )}
                >
                  Q{q.number}
                  <br />
                  <strong>{rate}%</strong>
                </Link>
              ))}
            </div>
          </div>
        </Card>

        <Card className="flex min-w-0 flex-[1_1_460px] flex-col gap-3.5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Common misconceptions in Q{focusQ?.number}</h2>
            <form action={reclusterQuestion} className="flex items-center gap-2">
              <input type="hidden" name="questionId" value={focusQ?.id ?? ""} />
              <Badge tone="ai">
                <Sparkles size={12} aria-hidden /> Grouped by AI
              </Badge>
              <SubmitButton size="sm" variant="ghost" pendingText="Grouping…" className="h-7 px-2">
                Re-group
              </SubmitButton>
            </form>
          </div>
          {misconceptions.length ? (
            misconceptions.map((m, i) => (
              <FadeIn key={m.id} delay={i * 0.06} className={cn("flex flex-col gap-2", i < misconceptions.length - 1 && "border-b border-line-2 pb-3.5")}>
                <div className="flex justify-between gap-2">
                  <strong className="text-[15px]">{m.title}</strong>
                  <span className="text-[13px] whitespace-nowrap text-ink-2">{m.studentCount} students</span>
                </div>
                {m.examples.map((ex) => (
                  <p key={ex} className="rounded-lg bg-ground px-3 py-2 text-sm leading-[21px] text-[#374151]">
                    “{ex}”
                  </p>
                ))}
              </FadeIn>
            ))
          ) : (
            <p className="text-sm text-ink-2">No grouped misconceptions for this question yet. Click Re-group to analyse the answers.</p>
          )}
          <p className="text-xs text-ink-2">Examples are anonymous.</p>
        </Card>
      </div>

      {flags.map((f) => {
        const q = questions.find((x) => x.id === f.questionId)!;
        return (
          <FadeIn key={f.id}>
            <Card className={cn("flex flex-wrap items-center gap-5 p-5", f.decision ? "border-met/30 bg-[#f6fbfa]" : "border-quote-line bg-[#fffcf6]")}>
              <div className="flex min-w-[280px] flex-1 flex-col gap-1.5">
                <Badge tone={f.decision ? "met" : "partial"} className="self-start">
                  {f.decision ? <CheckCircle2 size={12} aria-hidden /> : <TriangleAlert size={12} aria-hidden />}
                  {f.decision ? `Decided · Q${q.number}` : `Question may be ambiguous · Q${q.number}`}
                </Badge>
                <p className="text-[15px] leading-[23px]">{f.reason}</p>
                {f.decision ? <p className="text-sm font-semibold text-met">Decision: {decisionLabel[f.decision]}</p> : null}
              </div>
              {!f.decision ? (
                <div className="flex flex-wrap gap-2">
                  {(["clarify", "revisit_criteria", "reteach"] as const).map((d) => (
                    <form key={d} action={decideFlag}>
                      <input type="hidden" name="flagId" value={f.id} />
                      <input type="hidden" name="decision" value={d} />
                      <SubmitButton variant={d === "reteach" ? "primary" : "secondary"}>
                        {d === "clarify" ? "Clarify wording" : d === "revisit_criteria" ? "Revisit criteria" : "Reteach next lecture"}
                      </SubmitButton>
                    </form>
                  ))}
                </div>
              ) : null}
            </Card>
          </FadeIn>
        );
      })}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card className="p-5">
          <h2 className="font-semibold">Decisions for this exam</h2>
          {decisions.length ? (
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {decisions.map(({ d, concept }) => (
                <li key={d.id} className="flex items-start gap-2 border-t border-line-2 pt-2 first:border-0 first:pt-0">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-met" aria-hidden />
                  <span>
                    <strong>{decisionLabel[d.decision] ?? d.decision}</strong>
                    {concept ? ` · ${concept}` : ""}
                    {d.note ? <span className="block text-ink-2">{d.note}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-2">No decisions yet. Decide what to revisit from the patterns above.</p>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Plan a class action</h2>
          <form action={addClassDecision} className="mt-3 grid gap-3 text-sm">
            <input type="hidden" name="examId" value={exam.id} />
            <label className="grid gap-1">
              <span className="text-[13px] font-semibold">Concept</span>
              <select name="conceptId" defaultValue={weakest?.concept.id} className="h-10 rounded-lg border border-[#9ca3af] px-2">
                {concepts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-[13px] font-semibold">Action</span>
              <select name="decision" className="h-10 rounded-lg border border-[#9ca3af] px-2">
                <option value="reteach">Reteach in the next lecture</option>
                <option value="clarify">Clarify the wording</option>
                <option value="revisit_criteria">Revisit the marking criteria</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-[13px] font-semibold">Note</span>
              <input name="note" placeholder="10 minutes on why keys must be unique" className="h-10 rounded-lg border border-[#9ca3af] px-3" />
            </label>
            <SubmitButton>Add to plan</SubmitButton>
          </form>
        </Card>
      </div>
      <p className="text-xs text-ink-2">
        Based on {answers.length} analysed answers{pct(answers.filter((a) => a.status === "released").length, answers.length) < 100 ? ", including AI results not yet reviewed" : ""}.
      </p>
    </>
  );
}
