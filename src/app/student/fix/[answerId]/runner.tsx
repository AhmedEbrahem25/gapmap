"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, Lightbulb } from "lucide-react";
import type { ChainStep } from "@/lib/db/schema";
import { recordChainRun } from "@/lib/actions/student";
import { cn } from "@/lib/utils";

type Tap = { step: number; choice: number };

/** Taps only: each tap picks the next step, a wrong tap shows the slide hint first. */
export function ChainRunner({
  answerId,
  steps,
  explanation,
  slide,
  done,
}: {
  answerId: string;
  steps: ChainStep[];
  explanation: string;
  slide: { href: string; label: string } | null;
  done: React.ReactNode;
}) {
  const [step, setStep] = useState(0);
  const [taps, setTaps] = useState<Tap[]>([]);
  const [wrong, setWrong] = useState<number | null>(null);
  const [finished, setFinished] = useState<{ selfFound: boolean } | null>(null);
  const [pending, start] = useTransition();
  const current = steps[step];

  function tap(choice: number) {
    if (!current || pending) return;
    const next = [...taps, { step, choice }];
    setTaps(next);
    if (!current.choices[choice]!.correct) {
      setWrong(choice);
      return;
    }
    setWrong(null);
    if (step + 1 < steps.length) {
      setStep(step + 1);
      return;
    }
    start(async () => {
      const res = await recordChainRun(answerId, next);
      setFinished({ selfFound: !!res.selfFound });
    });
  }

  if (finished) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
        <div className="flex gap-2 rounded-xl bg-met-soft px-3.5 py-3 text-sm leading-[21px] text-[#0b5d56]">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>{finished.selfFound ? "You found it yourself, before any hint." : "Got there. The hint did its job."}</span>
        </div>
        <section data-tour="fix-done" className="flex flex-col gap-2 rounded-sheet border border-line bg-white p-4">
          <h2 className="text-sm font-semibold">Why</h2>
          <p className="text-base leading-[22px]">{explanation}</p>
          {slide ? (
            <Link href={slide.href} className="text-sm font-semibold">
              {slide.label} →
            </Link>
          ) : null}
        </section>
        {done}
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${steps.length}`}>
        {steps.map((_, i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-primary-600" : "bg-line")} />
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.section
          key={step}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          className="flex flex-col gap-3 rounded-sheet border-2 border-primary-600 bg-white p-4"
        >
          <p className="text-xs font-semibold text-ink-2">
            Step {step + 1} of {steps.length} · tap an answer
          </p>
          <h2 className="text-base leading-[23px] font-semibold">{current?.prompt}</h2>
          <div data-tour="taps" className="flex flex-col gap-2">
            {current?.choices.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => tap(i)}
                disabled={pending}
                className={cn(
                  "min-h-12 rounded-xl border px-3.5 py-2.5 text-left text-base transition",
                  wrong === i ? "border-missing/50 bg-missing-soft text-[#991b1b]" : "border-line bg-white hover:border-primary-200 hover:bg-primary-50",
                )}
              >
                {c.text}
              </button>
            ))}
          </div>
          {wrong !== null && current?.hint ? (
            <motion.p role="status" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2 rounded-xl bg-partial-soft px-3.5 py-3 text-sm leading-[21px] text-partial-ink">
              <Lightbulb size={18} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                <strong>Hint from the slide:</strong> {current.hint} Try again.
              </span>
            </motion.p>
          ) : null}
        </motion.section>
      </AnimatePresence>
    </div>
  );
}
