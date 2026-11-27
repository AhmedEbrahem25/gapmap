import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { ChevronRight, Hourglass, ShieldCheck, Sparkles } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { studentCourse, slideRef } from "@/lib/data";
import { nextStep, releasedAnswers, resultsFor, profileFor, closedConcepts } from "@/lib/student";
import { StudentHeader } from "@/components/shell/student-header";
import { StatusChip, statusFromRatio } from "@/components/ui/badge";
import { Mark } from "@/components/ui/quote";
import { SlideLink } from "@/components/ui/slide-link";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { AnimatedBar, FadeIn, Stagger, StaggerItem } from "@/components/ui/motion";
import { startRetest } from "@/lib/actions/student";
import { fmtMarks, initials } from "@/lib/utils";

export const metadata: Metadata = { title: "My report" };

const barColor = { met: "#0F766E", partial: "#B45309", missing: "#B91C1C" } as const;

export default async function StudentHome() {
  const user = await requireRole("student");
  const enrolled = studentCourse(user.id);
  const answers = releasedAnswers(user.id);
  const profile = profileFor(user.id);
  const avatar = (
    <Link href="/student/me" aria-label="My profile" className="flex h-10 w-10 items-center justify-center rounded-full bg-met-soft text-[15px] font-bold text-met">
      {initials(user.name).slice(0, 1)}
    </Link>
  );

  if (!answers.length) {
    return (
      <>
        <StudentHeader eyebrow={enrolled?.course.title} title={`Hi ${user.name.split(" ")[0]}`} right={avatar} />
        <div className="flex flex-col gap-4 px-5">
          <FadeIn className="flex flex-col items-center gap-3 rounded-sheet border border-line bg-white px-6 py-10 text-center">
            <span className="animate-pulse-ring flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-primary-600">
              <Hourglass size={28} aria-hidden />
            </span>
            <h2 className="text-lg font-semibold">Your midterm is being reviewed</h2>
            <p className="text-sm leading-[21px] text-ink-2">
              Your instructor checks every piece of feedback before you see it. You&apos;ll find your report here as soon as it&apos;s released.
            </p>
          </FadeIn>
          {!profile ? (
            <FadeIn delay={0.1}>
              <Link href="/student/profile" className="flex items-center gap-3 rounded-2xl border border-primary-200 bg-primary-50 p-4 transition hover:shadow-lift">
                <Sparkles className="text-primary-600" size={20} aria-hidden />
                <span className="flex-1 text-sm">
                  <strong className="block">While you wait: take the study check-in</strong>
                  <span className="text-ink-2">5 taps (habits, time, goals) so your next steps fit you.</span>
                </span>
                <ChevronRight size={18} className="text-primary-600" aria-hidden />
              </Link>
            </FadeIn>
          ) : null}
        </div>
      </>
    );
  }

  const exam = answers[0]!.exam;
  const current = answers.filter((a) => a.exam.id === exam.id);
  const results = resultsFor(current.map((a) => a.answer.id));
  const step = nextStep(user.id);
  const stepResults = step ? results.filter((r) => r.result.answerId === step.answer.id) : [];
  const gap = stepResults.find((r) => r.result.status !== "met");
  const quoted = stepResults.find((r) => r.result.status === "partial" && r.result.evidence) ?? gap;
  const stepSlide = slideRef(gap?.criterion.slideId);
  const followup = step ? db.select().from(s.followups).where(and(eq(s.followups.answerId, step.answer.id), eq(s.followups.studentId, user.id))).get() : undefined;
  const activity = step ? db.select().from(s.activities).where(and(eq(s.activities.answerId, step.answer.id), eq(s.activities.studentId, user.id))).get() : undefined;
  const concepts = new Map(db.select().from(s.concepts).all().map((c) => [c.id, c.name]));
  const closedIds = closedConcepts(user.id, exam.date);
  const closed = Array.from(closedIds).map((id) => concepts.get(id)).filter((x): x is string => !!x);
  const stepStatus = step ? statusFromRatio(step.answer.finalMarks ?? 0, step.question.maxMarks) : "met";

  const byConcept = new Map<string, { name: string; score: number; max: number }>();
  for (const a of current) {
    const key = a.question.conceptId ?? a.question.id;
    const v = byConcept.get(key) ?? { name: concepts.get(a.question.conceptId ?? "") ?? `Q${a.question.number}`, score: 0, max: 0 };
    v.score += a.answer.finalMarks ?? 0;
    v.max += a.question.maxMarks;
    byConcept.set(key, v);
  }
  const conceptRows = Array.from(byConcept.values()).sort((x, y) => x.score / x.max - y.score / y.max);
  const total = current.reduce((t, a) => t + (a.answer.finalMarks ?? 0), 0);
  const max = current.reduce((t, a) => t + a.question.maxMarks, 0);

  let cta: React.ReactNode = null;
  if (step) {
    if (step.answer.followupQuestion && step.answer.followupEnabled && !followup?.resolved) {
      cta = <ButtonLink size="lg" href={`/student/followup/${step.answer.id}`} className="w-full">Answer one quick question</ButtonLink>;
    } else if (activity && activity.status !== "done") {
      cta = <ButtonLink size="lg" href={`/student/plan/${activity.id}`} className="w-full">Start: {activity.title}</ButtonLink>;
    } else if (step.question.conceptId) {
      cta = (
        <form action={startRetest}>
          <input type="hidden" name="conceptId" value={step.question.conceptId} />
          <SubmitButton size="lg" className="w-full" pendingText="Writing a fresh question…">
            Take a fresh test
          </SubmitButton>
        </form>
      );
    }
  }

  return (
    <>
      <StudentHeader eyebrow={enrolled?.course.title} title={`${exam.title.replace(/ exam$/i, "")} report`} right={avatar} />
      <Stagger className="flex flex-col gap-3.5 px-5">
        {step ? (
          <StaggerItem>
            <section aria-label="Your next step" className="flex flex-col gap-3 rounded-sheet border-2 border-primary-600 bg-white p-[18px] shadow-[0_18px_40px_-24px_rgb(36_69_216/0.55)]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-[0.06em] text-primary-800 uppercase">Your next step</span>
                <StatusChip status={stepStatus} />
              </div>
              <h2 className="text-lg leading-6 font-semibold">
                {concepts.get(step.question.conceptId ?? "") ?? "Question"} · Q{step.question.number}
              </h2>
              <p className="text-[15px] leading-[22px]">
                {quoted?.result.evidence ? (
                  <>
                    Your answer said “<Mark tone={quoted.result.status === "met" ? "met" : "partial"}>{quoted.result.evidence}</Mark>”.{" "}
                  </>
                ) : null}
                {gap?.result.gap ?? "Review the marking comments for this question."}
              </p>
              {stepSlide ? (
                <SlideLink href={`/slides/${stepSlide.id}?from=/student`} lecture={stepSlide.lectureNumber} page={stepSlide.page} title={stepSlide.title} />
              ) : null}
              {cta}
            </section>
          </StaggerItem>
        ) : (
          <StaggerItem>
            <section className="flex flex-col gap-2 rounded-sheet border border-met/30 bg-met-soft p-5 text-[#0b5d56]">
              <span className="text-xs font-semibold tracking-[0.06em] uppercase">Gap closed</span>
              <p className="text-[15px] leading-[22px]">
                {closed.length ? (
                  <>
                    Your fresh test on <strong>{closed.join(", ")}</strong> met every criterion. Nice work.
                  </>
                ) : (
                  <>Every answer on this exam met its criteria.</>
                )}
              </p>
              <ButtonLink href="/student/practice" variant="secondary" className="mt-1 self-start">
                Practise another concept
              </ButtonLink>
            </section>
          </StaggerItem>
        )}

        <StaggerItem>
          <section aria-label="By concept" className="rounded-sheet border border-line bg-white px-[18px] pt-4 pb-1.5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold">By concept</h2>
              <span className="text-[13px] text-ink-2">
                Score {fmtMarks(total)} / {fmtMarks(max)}
              </span>
            </div>
            {conceptRows.map((c, i) => {
              const st = statusFromRatio(c.score, c.max);
              return (
                <div key={c.name} className="flex flex-col gap-1.5 border-t border-line-2 py-3 first-of-type:border-0">
                  <div className="flex items-center justify-between text-sm">
                    <span>{c.name}</span>
                    <StatusChip status={st} suffix={`${fmtMarks(c.score)}/${fmtMarks(c.max)}`} className="h-[22px]" />
                  </div>
                  <AnimatedBar value={(c.score / c.max) * 100} color={barColor[st]} height={6} delay={0.15 + i * 0.07} />
                </div>
              );
            })}
          </section>
        </StaggerItem>

        <StaggerItem>
          <section aria-label="Your answers" className="rounded-sheet border border-line bg-white">
            <h2 className="px-4 pt-4 pb-2 text-base font-semibold">Your answers</h2>
            <ul>
              {current.map((a) => (
                <li key={a.answer.id}>
                  <Link href={`/student/answers/${a.answer.id}`} className="flex items-center gap-3 border-t border-line-2 px-4 py-3 text-sm transition hover:bg-ground">
                    <span className="w-7 font-semibold text-ink-2">Q{a.question.number}</span>
                    <span className="min-w-0 flex-1 truncate">{a.question.prompt}</span>
                    <StatusChip status={statusFromRatio(a.answer.finalMarks ?? 0, a.question.maxMarks)} suffix={`${fmtMarks(a.answer.finalMarks)}/${fmtMarks(a.question.maxMarks)}`} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </StaggerItem>

        <StaggerItem>
          <Link href="/student/ask" className="flex items-center justify-between rounded-2xl border border-line bg-white px-4 py-3.5 text-sm transition hover:shadow-lift">
            <span>
              <strong className="block">Ask about a marking comment</strong>
              <span className="flex items-center gap-1 text-xs text-ink-2">
                <ShieldCheck size={12} aria-hidden /> Your name stays hidden from the instructor
              </span>
            </span>
            <ChevronRight size={18} className="text-ink-2" aria-hidden />
          </Link>
        </StaggerItem>
      </Stagger>
    </>
  );
}
