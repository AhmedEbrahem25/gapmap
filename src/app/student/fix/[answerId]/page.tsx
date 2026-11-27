import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { ownAnswer } from "@/lib/student";
import { slideRef } from "@/lib/data";
import { chainForAnswer } from "@/lib/chains";
import { StudentHeader } from "@/components/shell/student-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { startRetest } from "@/lib/actions/student";
import { LETTERS } from "@/lib/mcq";
import { ChainRunner } from "./runner";

export const metadata: Metadata = { title: "Fix it in 2 taps" };

export default async function FixPage({ params }: PageProps<"/student/fix/[answerId]">) {
  const user = await requireRole("student");
  const { answerId } = await params;
  const { answer, question, paper } = ownAnswer(user.id, answerId);
  const chain = chainForAnswer(question.id, answer.chosenOption);
  if (!chain || !chain.citedSlideId) notFound();
  const slide = slideRef(chain.citedSlideId);
  const chosenText = question.options?.[LETTERS.indexOf(answer.chosenOption as (typeof LETTERS)[number])] ?? answer.chosenOption;

  return (
    <>
      <StudentHeader back={`/student/papers/${paper.id}`} eyebrow={`Q${question.number} · you chose ${answer.chosenOption}`} title="Fix it in 2 taps" />
      <div className="flex flex-col gap-3.5 px-5">
        <section className="rounded-sheet border border-line bg-white p-4 text-sm leading-[21px]">
          <p className="font-semibold">{question.prompt}</p>
          <p className="mt-1 text-ink-2">
            You chose “{chosenText}”. Two quick questions will show why it doesn&apos;t fit, before any explanation.
          </p>
        </section>
        <ChainRunner
          answerId={answerId}
          steps={chain.steps}
          explanation={chain.explanation}
          slide={slide ? { href: `/slides/${slide.id}?from=/student/fix/${answerId}`, label: `Open Lecture ${slide.lectureNumber}, page ${slide.page}` } : null}
          done={
            <div className="flex flex-col gap-2">
              {question.conceptId ? (
                <form action={startRetest}>
                  <input type="hidden" name="conceptId" value={question.conceptId} />
                  <SubmitButton size="lg" className="w-full" pendingText="Writing a fresh question…">
                    <Sparkles size={16} aria-hidden /> Take a fresh test
                  </SubmitButton>
                </form>
              ) : null}
              <Link href={`/student/papers/${paper.id}`} className="py-3 text-center text-sm font-semibold text-primary-600">
                Back to my paper
              </Link>
            </div>
          }
        />
      </div>
    </>
  );
}
