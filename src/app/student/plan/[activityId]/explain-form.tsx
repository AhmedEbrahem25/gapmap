"use client";

import { useActionState } from "react";
import { motion } from "motion/react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { submitActivity, type SubmitState } from "@/lib/actions/student";
import { SubmitButton } from "@/components/ui/submit-button";

export function ExplainForm({
  activityId,
  label,
  initialFeedback,
  initialOk,
  initialText,
}: {
  activityId: string;
  label: string;
  initialFeedback: string | null;
  initialOk: boolean;
  initialText: string;
}) {
  const [state, action] = useActionState<SubmitState, FormData>(submitActivity, initialFeedback ? { ok: initialOk, feedback: initialFeedback } : {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="activityId" value={activityId} />
      <label htmlFor="submission" className="text-sm font-semibold">
        {label}
      </label>
      <textarea
        id="submission"
        name="submission"
        rows={3}
        defaultValue={initialText}
        placeholder="Because the ID…"
        className="resize-none rounded-[10px] border border-[#9ca3af] bg-white px-3 py-2.5 text-[15px] outline-none focus:border-primary-600 focus:shadow-glow"
      />
      {state.error ? (
        <p role="alert" className="text-sm text-missing">
          {state.error}
        </p>
      ) : null}
      {state.feedback ? (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex gap-2 rounded-xl px-3.5 py-3 text-sm leading-[21px] ${state.ok ? "bg-met-soft text-[#0b5d56]" : "bg-partial-soft text-partial-ink"}`}
        >
          {state.ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden /> : <RotateCcw size={18} className="mt-0.5 shrink-0" aria-hidden />}
          <span>{state.feedback}</span>
        </motion.div>
      ) : null}
      {!state.ok ? (
        <SubmitButton size="lg" pendingText="Checking…">
          {state.feedback ? "Check again" : "Check my explanation"}
        </SubmitButton>
      ) : null}
    </form>
  );
}
