import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ChevronRight, FileImage } from "lucide-react";
import { db, schema as s } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { releasedAnswers, resultsFor } from "@/lib/student";
import { StudentHeader } from "@/components/shell/student-header";
import { StatusChip, statusFromRatio } from "@/components/ui/badge";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { fmtMarks } from "@/lib/utils";
import { McqAnswer } from "@/components/student/mcq-answer";

export const metadata: Metadata = { title: "My paper" };

/** The whole marked paper: the scan as uploaded, then every question with the answer, the instructor's mark and the gaps. */
export default async function PaperPage({ params }: PageProps<"/student/papers/[paperId]">) {
  const user = await requireRole("student");
  const { paperId } = await params;
  const answers = releasedAnswers(user.id).filter((a) => a.paper.id === paperId);
  if (!answers.length) notFound();
  const { paper, exam } = answers[0]!;
  const course = db.select().from(s.courses).where(eq(s.courses.id, exam.courseId)).get();
  const results = resultsFor(answers.map((a) => a.answer.id));
  const total = answers.reduce((t, a) => t + (a.answer.finalMarks ?? 0), 0);
  const max = answers.reduce((t, a) => t + a.question.maxMarks, 0);
  // The scan is served only once the whole paper is released (see /api/files).
  const scan = paper.filePath && paper.status === "released" ? `/api/files/${paper.id}` : null;

  return (
    <>
      <StudentHeader back="/student/papers" eyebrow={`${course?.title ?? ""} · ${exam.title} · ${exam.date}`} title="Your answer paper" />
      <Stagger className="flex flex-col gap-3.5 px-5">
        <StaggerItem>
          <section className="flex items-center justify-between rounded-sheet border border-line bg-white p-4">
            <span className="text-sm text-ink-2">Total mark from your instructor</span>
            <StatusChip status={statusFromRatio(total, max)} suffix={`${fmtMarks(total)}/${fmtMarks(max)}`} />
          </section>
        </StaggerItem>

        {scan ? (
          <StaggerItem>
            <section className="flex flex-col gap-2 rounded-sheet border border-line bg-white p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Scanned paper</h2>
                <a href={scan} target="_blank" rel="noreferrer" className="text-[13px] font-medium">
                  Open full size
                </a>
              </div>
              {paper.mimeType?.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={scan} alt={`Your marked paper for ${exam.title}`} className="w-full rounded-lg border border-line" />
              ) : (
                <a href={scan} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-line bg-ground p-4 text-sm">
                  <FileImage size={18} aria-hidden /> Open your scanned paper (PDF)
                </a>
              )}
            </section>
          </StaggerItem>
        ) : null}

        {answers.map(({ answer, question }) => {
          const own = results.filter((r) => r.result.answerId === answer.id);
          const gaps = own.filter((r) => r.result.status !== "met").length;
          return (
            <StaggerItem key={answer.id}>
              <section className="flex flex-col gap-2.5 rounded-sheet border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[15px] leading-[22px] font-semibold">
                    <span className="mr-1.5 text-primary-600">Q{question.number}.</span>
                    {question.prompt}
                  </p>
                  <StatusChip
                    status={statusFromRatio(answer.finalMarks ?? 0, question.maxMarks)}
                    suffix={`${fmtMarks(answer.finalMarks)}/${fmtMarks(question.maxMarks)}`}
                  />
                </div>
                {question.kind === "mcq" ? (
                  <McqAnswer answerId={answer.id} question={question} chosen={answer.chosenOption} />
                ) : answer.handwriting ? (
                  <div className="paper-lines font-hand relative rounded-lg border border-[#e7e3d6] px-4 py-3 pr-16 text-[22px] leading-[32px] whitespace-pre-line text-[#1f2a5a]">
                    {answer.handwriting}
                    <span
                      aria-hidden
                      className="absolute top-2 right-2.5 -rotate-6 rounded-full border-2 border-[#c0392b] px-2 text-[22px] leading-8 text-[#c0392b]"
                    >
                      {fmtMarks(answer.finalMarks)}/{fmtMarks(question.maxMarks)}
                    </span>
                  </div>
                ) : answer.transcription ? (
                  <p className="rounded-lg bg-ground px-3 py-2 text-[15px] leading-6">{answer.transcription}</p>
                ) : null}
                {question.kind === "mcq" ? null : (
                  <Link
                    href={`/student/answers/${answer.id}`}
                    className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-primary-600 hover:bg-ground"
                  >
                    {gaps ? `See what was missing (${gaps}) and the slide` : "See the feedback"}
                    <ChevronRight size={16} aria-hidden />
                  </Link>
                )}
              </section>
            </StaggerItem>
          );
        })}
      </Stagger>
    </>
  );
}
