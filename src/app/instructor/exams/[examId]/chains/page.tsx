import type { Metadata } from "next";
import { and, eq, inArray } from "drizzle-orm";
import { CheckCheck, Pencil, RefreshCw, Sparkles } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { examWithAccess, slideRef } from "@/lib/data";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { AiBadge, Badge } from "@/components/ui/badge";
import { SlideLink } from "@/components/ui/slide-link";
import { SubmitButton } from "@/components/ui/submit-button";
import { ExamSteps } from "../steps";
import { approveQuestionChains, redraftChain, updateChain, writeChains } from "@/lib/actions/instructor";
import { CHAINS_PER_QUIZ, LETTERS } from "@/lib/mcq";
import { cn, pct } from "@/lib/utils";

export const metadata: Metadata = { title: "MCQ fix chains" };

export default async function ChainsPage({ params }: PageProps<"/instructor/exams/[examId]/chains">) {
  const user = await requireRole("instructor", "ta", "admin");
  const { examId } = await params;
  const { exam, course } = examWithAccess(user, examId);
  const questions = db.select().from(s.questions).where(and(eq(s.questions.examId, examId), eq(s.questions.kind, "mcq"))).all().sort((a, b) => a.number - b.number);
  const qIds = questions.map((q) => q.id);
  const answers = qIds.length ? db.select({ questionId: s.answers.questionId, chosenOption: s.answers.chosenOption }).from(s.answers).where(inArray(s.answers.questionId, qIds)).all() : [];
  const chains = qIds.length ? db.select().from(s.chains).where(inArray(s.chains.questionId, qIds)).all() : [];
  const runs = chains.length ? db.select({ chainId: s.chainRuns.chainId, selfFound: s.chainRuns.selfFound }).from(s.chainRuns).where(inArray(s.chainRuns.chainId, chains.map((c) => c.id))).all() : [];

  const header = (
    <>
      <PageHeader crumb={<>Exams / {course.title}</>} title={`${exam.title} · Socratic-style fix`} />
      <ExamSteps examId={examId} current="chains" done={["rubric", "upload", "review"]} />
    </>
  );
  if (!questions.length) {
    return (
      <>
        {header}
        <EmptyState title="No multiple-choice questions" body="Add MCQ questions with a key on the first step, then import the letters students chose." />
      </>
    );
  }

  const missing = questions.reduce((n, q) => {
    const wrong = new Set(answers.filter((a) => a.questionId === q.id && a.chosenOption && a.chosenOption !== q.correctOption).map((a) => a.chosenOption));
    return n + [...wrong].filter((o) => !chains.some((c) => c.questionId === q.id && c.option === o)).length;
  }, 0);
  const selfFound = runs.length ? pct(runs.filter((r) => r.selfFound).length, runs.length) : null;

  return (
    <>
      {header}
      <Card className="flex flex-wrap items-center gap-4 p-4 text-sm">
        <p className="min-w-0 flex-[1_1_360px] leading-[21px] text-ink-2">
          Rules pick the wrong options students actually chose; for each one the AI writes 2 tap-to-answer questions and a slide hint, from the
          question, its options and your slides only. <strong className="text-ink">No student data reaches the AI.</strong> Up to {CHAINS_PER_QUIZ} per quiz.
          {selfFound !== null ? ` ${selfFound}% of students who tapped through found the gap before the explanation.` : ""}
        </p>
        {missing ? (
          <form action={writeChains}>
            <input type="hidden" name="examId" value={examId} />
            <SubmitButton variant="ai" pendingText="Writing chains…">
              <Sparkles size={15} aria-hidden /> Write {missing} missing chain{missing === 1 ? "" : "s"}
            </SubmitButton>
          </form>
        ) : null}
      </Card>

      {questions.map((q) => {
        const own = answers.filter((a) => a.questionId === q.id && a.chosenOption);
        const qChains = chains.filter((c) => c.questionId === q.id).sort((a, b) => a.option.localeCompare(b.option));
        const drafts = qChains.filter((c) => c.status === "draft");
        const ready = drafts.filter((c) => c.citedSlideId).length;
        const wrongCounts = (q.options ?? []).map((_, i) => own.filter((a) => a.chosenOption === LETTERS[i]).length);
        const tricky = wrongCounts.reduce((best, n, i) => (LETTERS[i] !== q.correctOption && n > (best?.n ?? 0) ? { i, n } : best), null as { i: number; n: number } | null);
        return (
          <Card key={q.id} className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-[1_1_360px]">
                <h2 className="text-[17px] leading-6 font-semibold">
                  Q{q.number} · {q.prompt}
                </h2>
                <p className="mt-0.5 text-[13px] text-ink-2">
                  {own.length} answers{tricky ? ` · most common wrong answer: ${LETTERS[tricky.i]} (${pct(tricky.n, own.length)}%)` : " · no wrong answers"}
                </p>
              </div>
              {drafts.length && !ready ? (
                <Badge tone="missing">
                  {drafts.length} uncited draft{drafts.length === 1 ? "" : "s"}: edit below
                </Badge>
              ) : drafts.length ? (
                <form action={approveQuestionChains}>
                  <input type="hidden" name="questionId" value={q.id} />
                  <SubmitButton pendingText="Approving…">
                    <CheckCheck size={16} aria-hidden /> Approve {ready} for Q{q.number}
                  </SubmitButton>
                </form>
              ) : qChains.length ? (
                <Badge tone="met">All chains approved</Badge>
              ) : null}
            </div>

            <ul className="flex flex-col gap-1.5" aria-label="Options">
              {(q.options ?? []).map((o, i) => {
                const letter = LETTERS[i]!;
                const share = pct(wrongCounts[i] ?? 0, own.length);
                return (
                  <li key={letter} className="grid grid-cols-[22px_1fr_120px_40px] items-center gap-2 text-sm">
                    <strong className={letter === q.correctOption ? "text-met" : ""}>{letter}</strong>
                    <span className="truncate">
                      {o}
                      {letter === q.correctOption ? <span className="ml-1.5 text-xs font-semibold text-met">key</span> : null}
                    </span>
                    <span className="h-2 overflow-hidden rounded-full bg-line-2">
                      <span className={cn("block h-full rounded-full", letter === q.correctOption ? "bg-met" : "bg-partial")} style={{ width: `${share}%` }} />
                    </span>
                    <span className="text-right text-[13px] text-ink-2">{share}%</span>
                  </li>
                );
              })}
            </ul>

            {qChains.map((c) => {
              const slide = slideRef(c.citedSlideId);
              const cRuns = runs.filter((r) => r.chainId === c.id);
              return (
                <section key={c.id} className={cn("flex flex-col gap-3 rounded-xl border p-4", c.citedSlideId ? "border-line" : "border-missing/40 bg-missing-soft/40")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-sm">
                      Fix for option {c.option}: <span className="font-normal">{c.misconception}</span>
                    </strong>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {c.status === "approved" ? <Badge tone="met">Approved{c.edited ? " · edited" : ""}</Badge> : <AiBadge>AI draft · needs approval</AiBadge>}
                      {!c.citedSlideId ? <Badge tone="missing">Uncited: edit before approving</Badge> : null}
                      {cRuns.length ? <Badge>{cRuns.length} tapped through</Badge> : null}
                    </div>
                  </div>
                  <ol className="grid gap-3 md:grid-cols-2">
                    {c.steps.map((st, i) => (
                      <li key={i} className="flex flex-col gap-1.5 rounded-lg bg-ground p-3 text-sm">
                        <span className="text-xs font-semibold text-ink-2">Step {i + 1}</span>
                        <span className="font-medium">{st.prompt}</span>
                        <ul className="flex flex-col gap-1">
                          {st.choices.map((ch, j) => (
                            <li key={j} className={cn("rounded-md border px-2 py-1 text-[13px]", ch.correct ? "border-met/40 bg-white text-met" : "border-line bg-white")}>
                              {ch.correct ? "✓ " : ""}
                              {ch.text}
                            </li>
                          ))}
                        </ul>
                        {st.hint ? <span className="text-[13px] text-ink-2">Hint after a wrong tap: {st.hint}</span> : null}
                      </li>
                    ))}
                  </ol>
                  <p className="text-sm leading-[21px]">
                    <strong>Explanation at the end:</strong> {c.explanation}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {slide ? <SlideLink href={`/slides/${slide.id}`} lecture={slide.lectureNumber} page={slide.page} title={slide.title} className="py-1.5" /> : null}
                    <form action={redraftChain}>
                      <input type="hidden" name="chainId" value={c.id} />
                      <SubmitButton size="sm" variant="ghost" pendingText="Rewriting…" className="h-8 px-2">
                        <RefreshCw size={13} aria-hidden /> Rewrite
                      </SubmitButton>
                    </form>
                  </div>
                  <details>
                    <summary className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-ink-2 hover:text-primary-600">
                      <Pencil size={12} aria-hidden /> Edit and approve
                    </summary>
                    <form action={updateChain} className="mt-2 grid gap-2 rounded-lg bg-ground p-3 text-xs font-semibold">
                      <input type="hidden" name="chainId" value={c.id} />
                      <label className="grid gap-1">
                        Misconception
                        <input name="misconception" defaultValue={c.misconception} className="h-9 rounded-lg border border-[#9ca3af] bg-white px-2 text-sm font-normal" />
                      </label>
                      {c.steps.map((st, i) => (
                        <div key={i} className="grid gap-2 sm:grid-cols-2">
                          <label className="grid gap-1">
                            Step {i + 1} question
                            <input name={`prompt${i}`} defaultValue={st.prompt} className="h-9 rounded-lg border border-[#9ca3af] bg-white px-2 text-sm font-normal" />
                          </label>
                          <label className="grid gap-1">
                            Step {i + 1} hint (from the slide)
                            <input name={`hint${i}`} defaultValue={st.hint} className="h-9 rounded-lg border border-[#9ca3af] bg-white px-2 text-sm font-normal" />
                          </label>
                        </div>
                      ))}
                      <label className="grid gap-1">
                        Explanation (from the slide)
                        <input name="explanation" defaultValue={c.explanation} className="h-9 rounded-lg border border-[#9ca3af] bg-white px-2 text-sm font-normal" />
                      </label>
                      <SubmitButton size="sm" className="justify-self-start">
                        Save and approve
                      </SubmitButton>
                    </form>
                  </details>
                </section>
              );
            })}
          </Card>
        );
      })}
    </>
  );
}
