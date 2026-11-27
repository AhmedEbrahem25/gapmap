import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { slideRef } from "@/lib/data";
import { ownAnswer, resultsFor } from "@/lib/student";
import { StudentHeader } from "@/components/shell/student-header";
import { StatusChip, statusFromRatio } from "@/components/ui/badge";
import { EvidenceQuote, HighlightedText } from "@/components/ui/quote";
import { SlideLink } from "@/components/ui/slide-link";
import { ButtonLink } from "@/components/ui/button";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { fmtMarks } from "@/lib/utils";
import { McqAnswer } from "@/components/student/mcq-answer";

export const metadata: Metadata = { title: "Answer feedback" };

export default async function AnswerPage({ params }: PageProps<"/student/answers/[answerId]">) {
  const user = await requireRole("student");
  const { answerId } = await params;
  const { answer, question, exam, paper } = ownAnswer(user.id, answerId);
  const results = resultsFor([answerId]);
  return (
    <>
      <StudentHeader back="/student" eyebrow={`${exam.title} · Q${question.number}`} title="Feedback on your answer" />
      <Stagger className="flex flex-col gap-3.5 px-5">
        <StaggerItem>
          <section className="flex flex-col gap-2 rounded-sheet border border-line bg-white p-4">
            <p className="text-[15px] leading-[22px] font-semibold">{question.prompt}</p>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-ink-2">Your mark</span>
              <StatusChip status={statusFromRatio(answer.finalMarks ?? 0, question.maxMarks)} suffix={`${fmtMarks(answer.finalMarks)}/${fmtMarks(question.maxMarks)}`} />
            </div>
          </section>
        </StaggerItem>
        <StaggerItem>
          <section className="flex flex-col gap-2 rounded-sheet border border-line bg-white p-4">
            <h2 className="text-sm font-semibold">{question.kind === "mcq" ? "Your answer" : "What you wrote"}</h2>
            {question.kind === "mcq" ? <McqAnswer answerId={answerId} question={question} chosen={answer.chosenOption} /> : null}
            {answer.handwriting ? (
              <div className="paper-lines font-hand rounded-lg border border-[#e7e3d6] px-4 py-3 text-[24px] leading-[34px] whitespace-pre-line text-[#1f2a5a]">{answer.handwriting}</div>
            ) : paper.filePath && paper.mimeType?.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${paper.id}`} alt="Your scanned answer" className="rounded-lg border border-line" />
            ) : null}
            <p className="text-[15px] leading-6">
              <HighlightedText text={answer.transcription} marks={results.filter((r) => r.result.evidence).map((r) => ({ quote: r.result.evidence, tone: r.result.status }))} />
            </p>
          </section>
        </StaggerItem>
        {results.map(({ result: r, criterion: c }) => {
          // Students only see explanations that cite a slide; uncited text stays with the instructor.
          const cited = r.explanation && r.citedSlideId ? slideRef(r.citedSlideId) : null;
          const slide = cited ?? slideRef(c.slideId);
          return (
            <StaggerItem key={r.id}>
              <section className="flex flex-col gap-2.5 rounded-sheet border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <strong className="text-sm">{c.description}</strong>
                  <StatusChip status={r.status} />
                </div>
                {r.evidence ? <EvidenceQuote>“{r.evidence}”</EvidenceQuote> : null}
                {r.gap ? (
                  <p className="text-sm leading-[21px]">
                    <strong>Still to explain:</strong> {r.gap}
                  </p>
                ) : null}
                {cited ? (
                  <p className="rounded-lg bg-ground px-3 py-2 text-sm leading-[21px]">
                    <strong>
                      From Lecture {cited.lectureNumber}, page {cited.page}:
                    </strong>{" "}
                    {r.explanation}
                  </p>
                ) : null}
                {slide && r.status !== "met" ? <SlideLink href={`/slides/${slide.id}?from=/student/answers/${answerId}`} lecture={slide.lectureNumber} page={slide.page} title={slide.title} /> : null}
              </section>
            </StaggerItem>
          );
        })}
        <StaggerItem className="flex flex-col gap-2">
          {answer.followupQuestion && answer.followupEnabled ? (
            <ButtonLink size="lg" href={`/student/followup/${answerId}`}>
              Answer one quick question
            </ButtonLink>
          ) : null}
          <Link href={`/student/ask?answer=${answerId}`} className="py-3 text-center text-sm font-semibold text-primary-600">
            Ask your instructor about this, anonymously
          </Link>
        </StaggerItem>
      </Stagger>
    </>
  );
}
