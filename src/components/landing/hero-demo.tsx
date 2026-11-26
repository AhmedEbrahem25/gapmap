"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ArrowRight, Sparkles } from "lucide-react";

const ease = [0.22, 1, 0.36, 1] as const;

/** A looping, self-playing walkthrough of one answer moving through GapMap. */
export function HeroDemo() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(reduce ? 4 : 0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setStep((s) => (s + 1) % 6), 1900);
    return () => clearInterval(t);
  }, [reduce]);

  const show = (n: number) => step >= n;

  return (
    <div className="relative mx-auto w-full max-w-[520px]" aria-label="Animated example: one exam answer moving through GapMap" role="img">
      <div className="absolute -inset-6 -z-10 rounded-[36px] bg-gradient-to-br from-primary-100 via-white to-[#fff1e0] blur-2xl" aria-hidden />
      <div className="rounded-[22px] border border-line bg-white p-5 shadow-[0_40px_80px_-40px_rgb(17_24_39/0.35)]">
        <div className="mb-3 flex items-center justify-between text-xs text-ink-2">
          <span className="font-semibold text-ink">Q3 · Choose a primary key</span>
          <span>Midterm · scan p.2</span>
        </div>
        <div className="paper-lines font-hand rounded-xl border border-[#e7e3d6] px-4 py-3 text-[24px] leading-[34px] text-[#1f2a5a]">
          I will choose{" "}
          <motion.span animate={{ backgroundColor: show(1) ? "#e6f4f1" : "rgba(0,0,0,0)" }} transition={{ duration: 0.4 }} className="rounded px-0.5">
            StudentID
          </motion.span>{" "}
          as the primary key{" "}
          <motion.span animate={{ backgroundColor: show(1) ? "#fef3e2" : "rgba(0,0,0,0)" }} transition={{ duration: 0.4, delay: 0.15 }} className="rounded px-0.5">
            because it is the student number.
          </motion.span>
        </div>

        <div className="mt-4 flex min-h-[230px] flex-col gap-2.5">
          <AnimatePresence>
            {show(1) ? (
              <motion.div key="c1" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease }} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-[13px]">
                <span>C1 · Names a suitable key</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-met-soft px-2 py-0.5 text-xs font-semibold text-met">
                  <Check size={12} strokeWidth={3} /> Met
                </span>
              </motion.div>
            ) : null}
            {show(2) ? (
              <motion.div key="c2" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease }} className="flex flex-col gap-2 rounded-xl border border-quote-line bg-[#fffdf8] px-3 py-2.5 text-[13px]">
                <div className="flex items-center justify-between">
                  <span>C2 · Explains uniqueness</span>
                  <span className="rounded-full bg-partial-soft px-2 py-0.5 text-xs font-semibold text-partial">Partial</span>
                </div>
                <span className="flex items-center gap-2 text-xs text-ink-2">
                  <span className="rounded bg-primary-50 px-1.5 py-0.5 font-semibold text-primary-800">L4 · 12</span> Unique identification
                </span>
              </motion.div>
            ) : null}
            {show(3) ? (
              <motion.div key="q" initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease }} className="max-w-[88%] self-start rounded-2xl rounded-bl-sm border border-ai-line bg-ai-soft px-3 py-2 text-[13px] text-[#4c1d95]">
                <Sparkles size={12} className="mr-1 inline" aria-hidden />
                What would happen if two students had the same name?
              </motion.div>
            ) : null}
            {show(4) ? (
              <motion.div key="r" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease }} className="flex items-center gap-2 self-end rounded-xl bg-ink px-3 py-2 text-[13px] text-white">
                Fresh test
                <span className="rounded-full bg-partial-soft px-2 py-0.5 text-xs font-semibold text-partial">Partial</span>
                <ArrowRight size={14} aria-hidden />
                <span className="rounded-full bg-met-soft px-2 py-0.5 text-xs font-semibold text-met">Met</span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
      <div className="mt-4 flex justify-center gap-1.5" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.span key={i} className="h-1.5 rounded-full bg-primary-600" animate={{ width: step === i || (step === 5 && i === 4) ? 22 : 6, opacity: step >= i ? 1 : 0.25 }} transition={{ duration: 0.3 }} />
        ))}
      </div>
    </div>
  );
}
