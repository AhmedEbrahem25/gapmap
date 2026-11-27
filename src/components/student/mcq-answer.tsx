import { Sparkles } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { chainForAnswer } from "@/lib/chains";
import { LETTERS } from "@/lib/mcq";
import { cn } from "@/lib/utils";

/** A multiple-choice answer: the student's choice, the key, and the 2-tap fix when the lecturer has approved one. */
export function McqAnswer({
  answerId,
  question,
  chosen,
}: {
  answerId: string;
  question: { id: string; options: string[] | null; correctOption: string | null };
  chosen: string | null;
}) {
  const wrong = chosen !== question.correctOption;
  const chain = wrong ? chainForAnswer(question.id, chosen) : null;
  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-1.5">
        {(question.options ?? []).map((o, i) => {
          const letter = LETTERS[i]!;
          const isChosen = letter === chosen;
          const isKey = letter === question.correctOption;
          return (
            <li
              key={letter}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                isKey ? "border-met/40 bg-met-soft" : isChosen ? "border-missing/40 bg-missing-soft" : "border-line",
              )}
            >
              <strong className="w-5">{letter}</strong>
              <span className="flex-1">{o}</span>
              {isChosen ? <span className="text-xs font-semibold">{isKey ? "your answer ✓" : "your answer"}</span> : isKey ? <span className="text-xs font-semibold text-met">correct</span> : null}
            </li>
          );
        })}
      </ol>
      {wrong && chain ? (
        <ButtonLink href={`/student/fix/${answerId}`} size="lg">
          <Sparkles size={16} aria-hidden /> Fix it in 2 taps
        </ButtonLink>
      ) : wrong ? (
        <p className="rounded-lg bg-ground px-3 py-2 text-[13px] text-ink-2">Your instructor is checking a 2-tap fix for this answer.</p>
      ) : null}
    </div>
  );
}
