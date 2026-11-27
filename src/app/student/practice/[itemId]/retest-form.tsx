"use client";

import { useActionState } from "react";
import { submitRetest, type SubmitState } from "@/lib/actions/student";
import { SubmitButton } from "@/components/ui/submit-button";

export function RetestForm({ itemId, options }: { itemId: string; options?: string[] | null }) {
  const [state, action] = useActionState<SubmitState, FormData>(submitRetest, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="itemId" value={itemId} />
      {options?.length ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Choose one answer</legend>
          {options.map((o, i) => (
            <label key={i} className="cursor-pointer">
              <input type="radio" name="choice" value={"ABCDE"[i]} required className="peer sr-only" />
              <span className="flex min-h-12 items-center gap-2 rounded-xl border border-line bg-white px-3.5 py-2.5 text-base transition peer-checked:border-primary-600 peer-checked:bg-primary-50 peer-focus-visible:shadow-glow">
                <strong className="w-5">{"ABCDE"[i]}</strong> {o}
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <>
          <label htmlFor="answer" className="sr-only">
            Your answer
          </label>
          <textarea
            id="answer"
            name="answer"
            rows={4}
            placeholder="Write your answer in a sentence or two…"
            className="resize-none rounded-[10px] border border-[#9ca3af] px-3 py-2.5 text-base outline-none focus:border-primary-600 focus:shadow-glow"
          />
        </>
      )}
      {state.error ? (
        <p role="alert" className="text-sm text-missing">
          {state.error}
        </p>
      ) : null}
      <SubmitButton size="lg" pendingText="Marking…">
        Submit answer
      </SubmitButton>
    </form>
  );
}
