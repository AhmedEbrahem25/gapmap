"use client";

import { useActionState } from "react";
import { submitRetest, type SubmitState } from "@/lib/actions/student";
import { SubmitButton } from "@/components/ui/submit-button";

export function RetestForm({ itemId }: { itemId: string }) {
  const [state, action] = useActionState<SubmitState, FormData>(submitRetest, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="itemId" value={itemId} />
      <label htmlFor="answer" className="sr-only">
        Your answer
      </label>
      <textarea
        id="answer"
        name="answer"
        rows={4}
        placeholder="Write your answer in a sentence or two…"
        className="resize-none rounded-[10px] border border-[#9ca3af] px-3 py-2.5 text-[15px] outline-none focus:border-primary-600 focus:shadow-glow"
      />
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
