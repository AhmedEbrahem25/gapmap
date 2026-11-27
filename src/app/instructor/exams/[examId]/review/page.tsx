import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { ChevronLeft, ChevronRight, Pencil, RefreshCw, Keyboard, FileImage, CheckCheck } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { examWithAccess, slideRef } from "@/lib/data";
import { examQuestions } from "@/lib/jobs";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { AiBadge, Badge, StatusChip } from "@/components/ui/badge";
import { EvidenceQuote, HighlightedText } from "@/components/ui/quote";
import { SlideLink } from "@/components/ui/slide-link";
import { SubmitButton } from "@/components/ui/submit-button";
import { FadeIn } from "@/components/ui/motion";
import { ReviewHotkeys } from "@/components/instructor/review-hotkeys";
import { ExamSteps } from "../steps";
import { approveAnswer, approveQuestion, assignPaperStudent, releaseApproved, setPaperMark, updateResult, updateTranscription, setAnswerMeta, reanalyse } from "@/lib/actions/instructor";
import { answerFlags } from "@/lib/review";
import { cn, fmtMarks } from "@/lib/utils";

export const metadata: Metadata = { title: "Review" };

const ERROR_TYPES = ["Describes, doesn't justify", "Misconception", "Missing step", "Off-topic"];

export default async function ReviewPage({ params, searchParams }: PageProps<"/instructor/exams/[examId]/review">) {
  const user = await requireRole("instructor", "ta", "admin");
  const { examId } = await params;
  const sp = await searchParams;
  const { exam, course } = examWithAccess(user, examId);
  const questions = examQuestions(examId);

  const all = db
    .select({ answer: s.answers, paper: s.papers, student: s.users.name, rowid: sql<number>`${s.papers}.rowid` })
    .from(s.answers)
    .innerJoin(s.papers, eq(s.papers.id, s.answers.paperId))
    .leftJoin(s.users, eq(s.users.id, s.papers.studentId))
    .where(eq(s.papers.examId, examId))
    .orderBy(asc(sql`${s.papers}.rowid`))
    .all()
    .filter((r) => r.answer.model !== "csv-import");

  if (!questions.length || !all.length) {
    return (
      <>
        <PageHeader crumb={<>Exams / {course.title}</>} title={`${exam.title} · review`} />
        <ExamSteps examId={examId} current="review" done={["rubric"]} />
        <EmptyState title="Nothing to review yet" body="Upload scanned papers first. Each answer appears here once the AI has read and matched it." />
      </>
    );
  }

  const pendingCount = (qid: string) => all.filter((r) => r.answer.questionId === qid && ["pending", "analysed"].includes(r.answer.status)).length;
  const followupPending = (qid: string) =>
    all.filter((r) => r.answer.questionId === qid && r.answer.status === "analysed" && r.answer.followupQuestion).length;
  // Only questions that already have answers (others may still be processing).
  const answered = questions.filter((x) => all.some((r) => r.answer.questionId === x.id));
  const defaultQ =
    answered.find((q) => q.number === Number(sp.q)) ??
    [...answered].sort((a, b) => followupPending(b.id) - followupPending(a.id) || pendingCount(b.id) - pendingCount(a.id))[0]!;
  const q = defaultQ;
  const rank = { pending: 0, analysed: 0, approved: 1, released: 2 } as const;
  const queue = all.filter((r) => r.answer.questionId === q.id).sort((a, b) => rank[a.answer.status] - rank[b.answer.status] || a.rowid - b.rowid);
  const current = queue.find((r) => r.answer.id === sp.answer) ?? queue[0]!;
  const idx = queue.indexOf(current);
  const href = (a?: (typeof queue)[number]) => (a ? `/instructor/exams/${examId}/review?q=${q.number}&answer=${a.answer.id}` : undefined);
  const prevHref = href(queue[idx - 1]);
  const nextPending = queue.slice(idx + 1).find((r) => ["pending", "analysed"].includes(r.answer.status)) ?? queue[idx + 1];
  const nextHref = href(queue[idx + 1]);

  const results = db
    .select({ result: s.criterionResults, criterion: s.criteria })
    .from(s.criterionResults)
    .innerJoin(s.criteria, eq(s.criteria.id, s.criterionResults.criterionId))
    .where(eq(s.criterionResults.answerId, current.answer.id))
    .orderBy(asc(s.criteria.code))
    .all();
  // Per-question approval: every analysed answer that no rule flags can be approved in one step.
  const queueResults = db.select().from(s.criterionResults).where(inArray(s.criterionResults.answerId, queue.map((r) => r.answer.id))).all();
  const toCheck = queue
    .filter((r) => r.answer.status === "analysed")
    .map((r) => ({ row: r, flags: answerFlags(r.answer, queueResults.filter((x) => x.answerId === r.answer.id), q.maxMarks) }));
  const readyCount = toCheck.filter((x) => !x.flags.length).length;
  const flagged = toCheck.filter((x) => x.flags.length);
  const approvedCount = all.filter((r) => r.answer.status === "approved").length;
  const needsLook = all.filter((r) => r.answer.status === "analysed").length;
  const a = current.answer;
  const isImage = current.paper.mimeType?.startsWith("image/");
  const isPdf = current.paper.mimeType === "application/pdf";
  const reviewed = a.status === "approved" || a.status === "released";
  const markRead = a.paperMarks !== null;
  const students = current.paper.studentId
    ? []
    : db
        .select({ id: s.users.id, name: s.users.name })
        .from(s.enrollments)
        .innerJoin(s.users, eq(s.users.id, s.enrollments.userId))
        .where(and(eq(s.enrollments.courseId, course.id), eq(s.enrollments.role, "student")))
        .orderBy(asc(s.users.name))
        .all();
  const approveId = "approve-form";

  return (
    <>
      <ReviewHotkeys prev={prevHref} next={nextHref} approveFormId={approveId} />
      <PageHeader
        crumb={
          <>
            {exam.title} / Review queue · Q{q.number}
          </>
        }
        title={
          <>
            {current.student ?? "Unmatched paper"} <span className="font-normal text-ink-2">· paper {idx + 1} of {queue.length}</span>
          </>
        }
        actions={
          <>
            <span className="text-[13px] text-ink-2">
              {approvedCount} approved · {needsLook} need a look
            </span>
            {prevHref ? (
              <Link aria-label="Previous paper (K)" href={prevHref} className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#d1d5db] bg-white hover:bg-ground">
                <ChevronLeft size={18} />
              </Link>
            ) : null}
            {nextHref ? (
              <Link aria-label="Next paper (J)" href={nextHref} className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#d1d5db] bg-white hover:bg-ground">
                <ChevronRight size={18} />
              </Link>
            ) : null}
            <form action={releaseApproved}>
              <input type="hidden" name="examId" value={examId} />
              <SubmitButton variant="dark" pendingText="Releasing…" className={approvedCount ? "" : "opacity-60"}>
                Release {approvedCount} to students
              </SubmitButton>
            </form>
          </>
        }
      />

      <nav aria-label="Questions" className="flex flex-wrap items-center gap-2">
        {questions.map((x) => {
          const n = pendingCount(x.id);
          return (
            <Link
              key={x.id}
              href={`/instructor/exams/${examId}/review?q=${x.number}`}
              aria-current={x.id === q.id ? "page" : undefined}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition",
                x.id === q.id ? "bg-primary-600 text-white" : "border border-line bg-white text-[#374151] hover:border-primary-200",
              )}
            >
              Q{x.number}
              {n ? <span className={cn("rounded-full px-1.5 text-[11px]", x.id === q.id ? "bg-white/20" : "bg-partial-soft text-partial")}>{n}</span> : null}
            </Link>
          );
        })}
        <span className="ml-auto hidden items-center gap-1.5 text-xs text-ink-3 md:flex">
          <Keyboard size={14} aria-hidden /> J / K to move · A to approve
        </span>
      </nav>

      <Card className="flex flex-wrap items-center gap-x-5 gap-y-3 p-4">
        <div className="min-w-0 flex-[1_1_320px]">
          <h2 className="text-sm font-semibold">Approve Q{q.number} by question</h2>
          <p className="text-[13px] leading-5 text-ink-2">
            {readyCount} answer{readyCount === 1 ? "" : "s"} pass every check (your mark read clearly, answer readable, diagnosis matches the mark, explanations cited).
            {flagged.length ? ` ${flagged.length} flagged for a one-by-one look.` : " Nothing flagged."}
          </p>
          {flagged.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {flagged.map(({ row, flags }) => (
                <li key={row.answer.id}>
                  <Link href={href(row)!} className="inline-flex h-7 items-center gap-1 rounded-full bg-partial-soft px-2.5 text-xs font-medium text-partial-ink hover:bg-[#fde7c7]">
                    {row.student ?? "Unmatched"} · {flags.join(", ")}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <form action={approveQuestion}>
          <input type="hidden" name="examId" value={examId} />
          <input type="hidden" name="questionId" value={q.id} />
          <SubmitButton variant={readyCount ? "primary" : "secondary"} pendingText="Approving…" className={readyCount ? "" : "opacity-60"}>
            <CheckCheck size={16} aria-hidden /> Approve {readyCount} for Q{q.number}
          </SubmitButton>
        </form>
      </Card>

      {!current.paper.studentId ? (
        <Card className="flex flex-wrap items-center gap-3 border-quote-line bg-[#fffcf6] p-4 text-sm">
          <span className="flex-1">
            <strong>Whose paper is this?</strong> GapMap never sends names or IDs to the AI, so pick the student here (or name scan files like <code className="font-mono">mariam-adel.pdf</code>).
          </span>
          <form action={assignPaperStudent} className="flex items-center gap-2">
            <input type="hidden" name="paperId" value={current.paper.id} />
            <label className="sr-only" htmlFor="assign-student">
              Student
            </label>
            <select id="assign-student" name="studentId" required className="h-9 max-w-[220px] rounded-lg border border-[#9ca3af] bg-white px-2">
              {students.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <SubmitButton size="sm">Assign</SubmitButton>
          </form>
        </Card>
      ) : null}

      <FadeIn key={a.id} className="flex flex-wrap items-start gap-5">
        <section aria-label="Student answer" className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
          <Card className="flex flex-col gap-2.5 p-4">
            <div className="flex justify-between text-[13px] text-ink-2">
              <span>
                Scan · Q{q.number} answer region{current.paper.fileName ? ` · ${current.paper.fileName}` : ""}
              </span>
              {current.paper.filePath ? (
                <a href={`/api/files/${current.paper.id}`} target="_blank" rel="noreferrer" className="font-medium">
                  Open full page
                </a>
              ) : null}
            </div>
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${current.paper.id}`} alt={`Scanned answer of ${current.student ?? "student"}`} className="max-h-[420px] w-full rounded-lg border border-line object-contain" />
            ) : isPdf ? (
              <a href={`/api/files/${current.paper.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-line bg-ground p-4 text-sm">
                <FileImage size={18} aria-hidden /> Scanned PDF — open to compare with the transcription
              </a>
            ) : a.handwriting ? (
              <div className="paper-lines font-hand relative rounded-lg border border-[#e7e3d6] px-5 py-4 text-[27px] leading-[34px] whitespace-pre-line text-[#1f2a5a]">
                {a.handwriting}
                {markRead ? (
                  <span aria-hidden className="absolute top-2 right-3 -rotate-6 rounded-full border-2 border-[#c0392b] px-2.5 text-[26px] leading-9 text-[#c0392b]">
                    {fmtMarks(a.paperMarks)}/{fmtMarks(q.maxMarks)}
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-ink-2">No scan stored for this answer.</p>
            )}
          </Card>

          <Card className="flex flex-col gap-2.5 p-4">
            <div className="flex items-center justify-between text-[13px]">
              <strong>Transcription</strong>
              <Badge tone={a.confidence >= 0.9 ? "met" : a.confidence >= 0.7 ? "partial" : "missing"}>{Math.round(a.confidence * 100)}% readable</Badge>
            </div>
            {a.transcription ? (
              <p className="text-[15px] leading-6">
                <HighlightedText
                  text={a.transcription}
                  marks={[
                    ...results.filter((r) => r.result.evidence).map((r) => ({ quote: r.result.evidence, tone: r.result.status })),
                    ...a.lowConfidence.map((w) => ({ quote: w, tone: "low" as const })),
                  ]}
                />
              </p>
            ) : (
              <p className="rounded-lg bg-partial-soft px-3 py-2 text-sm text-partial-ink">No text yet. Type what the student wrote below, then GapMap will match it to the criteria.</p>
            )}
            <details className="group" open={!a.transcription}>
              <summary className="cursor-pointer text-xs text-ink-2 hover:text-primary-600">
                Wavy underline = low confidence. <span className="font-semibold text-primary-600">Correct the transcription</span>
              </summary>
              <form action={updateTranscription} className="mt-2 flex flex-col gap-2">
                <input type="hidden" name="answerId" value={a.id} />
                <label className="sr-only" htmlFor="tx">
                  Transcription
                </label>
                <textarea id="tx" name="transcription" defaultValue={a.transcription} rows={4} className="rounded-lg border border-[#9ca3af] p-2.5 text-[15px]" />
                <SubmitButton size="sm" variant="secondary" pendingText="Re-analysing…" className="self-start">
                  <RefreshCw size={14} aria-hidden /> Save &amp; re-analyse
                </SubmitButton>
              </form>
            </details>
          </Card>

          {a.followupQuestion ? (
            <Card className="flex flex-col gap-2 border-ai-line bg-[#fbf9ff] p-4">
              <form action={setAnswerMeta} className="flex items-center justify-between gap-2">
                <input type="hidden" name="answerId" value={a.id} />
                <input type="hidden" name="followupToggle" value="1" />
                <strong className="text-sm">Follow-up GapMap will ask {current.student?.split(" ")[0] ?? "the student"}</strong>
                <label className="flex items-center gap-1.5 text-[13px]">
                  <input type="checkbox" name="followupEnabled" defaultChecked={a.followupEnabled} className="h-[18px] w-[18px] accent-primary-600" />
                  Send
                </label>
                <SubmitButton size="sm" variant="ghost" className="h-7 px-2">
                  Save
                </SubmitButton>
              </form>
              <p className="text-[15px] leading-[22px] text-[#4c1d95]">“{a.followupQuestion}”</p>
              {a.followupReason ? <p className="text-xs text-ink-2">Why: {a.followupReason}</p> : null}
            </Card>
          ) : null}
        </section>

        <section aria-label="AI feedback by criterion" className="flex min-w-0 flex-[1_1_460px] flex-col overflow-hidden rounded-card border border-line bg-white shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <h2 className="text-[17px] font-semibold">Diagnosis by criterion</h2>
              <p className="text-[13px] text-ink-2">
                Your mark on the paper{" "}
                <strong className="text-ink">
                  {markRead ? fmtMarks(a.paperMarks) : "not found"} / {fmtMarks(q.maxMarks)}
                </strong>
                {markRead && a.paperMarkConfidence < 1 ? ` · read with ${Math.round(a.paperMarkConfidence * 100)}% confidence` : ""}
              </p>
              <form action={setPaperMark} className="mt-1.5 flex items-center gap-1.5 text-[13px]">
                <input type="hidden" name="answerId" value={a.id} />
                <label htmlFor="paper-mark" className="text-ink-2">
                  {markRead ? "Read wrong? Correct it:" : "Type the mark you gave:"}
                </label>
                <input
                  id="paper-mark"
                  name="mark"
                  type="number"
                  step="0.5"
                  min={0}
                  max={q.maxMarks}
                  defaultValue={a.paperMarks ?? undefined}
                  required
                  className="h-8 w-16 rounded-lg border border-[#9ca3af] bg-white px-2 text-sm"
                />
                <SubmitButton size="sm" variant="ghost" className="h-8 px-2">
                  Save
                </SubmitButton>
              </form>
            </div>
            {reviewed ? <Badge tone="met">{a.status === "released" ? "Released to student" : "Approved"}</Badge> : <AiBadge>AI diagnosis · needs review</AiBadge>}
          </div>

          {results.length === 0 ? (
            <div className="border-t border-line-2 px-5 py-6 text-sm text-ink-2">
              Not matched yet.
              {a.transcription ? (
                <form action={reanalyse} className="mt-2">
                  <input type="hidden" name="answerId" value={a.id} />
                  <SubmitButton size="sm" pendingText="Analysing…">
                    Analyse now
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          ) : null}

          {results.map(({ result: r, criterion: c }) => {
            const slide = slideRef(c.slideId);
            const cited = r.citedSlideId === c.slideId ? slide : slideRef(r.citedSlideId);
            return (
              <div key={r.id} className={cn("flex flex-col gap-2.5 border-t border-line-2 px-5 py-4", r.status === "partial" && "bg-[#fffdf8]")}>
                <div className="flex items-start justify-between gap-3">
                  <strong className="text-sm">
                    {c.code} · {c.description}
                  </strong>
                  <StatusChip status={r.status} suffix={`${fmtMarks(r.marks)}/${fmtMarks(c.marks)}`} />
                </div>
                {r.evidence ? (
                  <EvidenceQuote>
                    “<strong>{r.evidence}</strong>”
                  </EvidenceQuote>
                ) : null}
                {r.gap ? (
                  <p className="text-sm leading-[21px]">
                    <strong>Still needs to explain:</strong> {r.gap}
                  </p>
                ) : null}
                {r.explanation ? (
                  <p className={cn("rounded-lg px-3 py-2 text-sm leading-[21px]", r.citedSlideId ? "bg-ground" : "bg-missing-soft text-[#991b1b]")}>
                    <strong>{r.citedSlideId ? `From the slide (${cited ? `L${cited.lectureNumber} p.${cited.page}` : "cited"}):` : "Uncited, hidden from the student until you fix it:"}</strong> {r.explanation}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  {slide ? <SlideLink href={`/slides/${slide.id}`} lecture={slide.lectureNumber} page={slide.page} title={slide.title} className="py-1.5" /> : null}
                  {r.edited ? <Badge>Edited by reviewer</Badge> : r.aiConfidence < 0.6 ? <Badge tone="partial">Low AI confidence</Badge> : null}
                  {r.explanation && !r.citedSlideId ? <Badge tone="missing">Uncited</Badge> : null}
                </div>
                <details>
                  <summary className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-ink-2 hover:text-primary-600">
                    <Pencil size={12} aria-hidden /> Edit this criterion
                  </summary>
                  <form action={updateResult} className="mt-2 grid gap-2 rounded-lg bg-ground p-3 sm:grid-cols-[140px_90px_1fr_auto] sm:items-end">
                    <input type="hidden" name="resultId" value={r.id} />
                    <label className="grid gap-1 text-xs font-semibold">
                      Status
                      <select name="status" defaultValue={r.status} className="h-9 rounded-lg border border-[#9ca3af] bg-white px-2 text-sm font-normal">
                        <option value="met">Met</option>
                        <option value="partial">Partial</option>
                        <option value="missing">Missing</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs font-semibold">
                      Marks
                      <input name="marks" type="number" step="0.5" min={0} max={c.marks} defaultValue={r.marks} className="h-9 rounded-lg border border-[#9ca3af] bg-white px-2 text-sm font-normal" />
                    </label>
                    <label className="grid gap-1 text-xs font-semibold">
                      What&apos;s missing
                      <input name="gap" defaultValue={r.gap} className="h-9 rounded-lg border border-[#9ca3af] bg-white px-2 text-sm font-normal" />
                    </label>
                    <label className="grid gap-1 text-xs font-semibold sm:col-span-3">
                      Explanation (from the slide)
                      <input name="explanation" defaultValue={r.explanation} className="h-9 rounded-lg border border-[#9ca3af] bg-white px-2 text-sm font-normal" />
                    </label>
                    <SubmitButton size="sm">Save</SubmitButton>
                  </form>
                </details>
              </div>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-[#fafafb] px-5 py-4">
            <form action={setAnswerMeta} className="flex items-center gap-2 text-[13px] text-ink-2">
              <input type="hidden" name="answerId" value={a.id} />
              <label htmlFor="et">Error type</label>
              <select id="et" name="errorType" defaultValue={a.errorType ?? ""} className="h-9 rounded-lg border border-[#9ca3af] bg-white px-2 text-[13px] text-ink">
                <option value="">None</option>
                {ERROR_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <SubmitButton size="sm" variant="ghost" className="px-2">
                Save
              </SubmitButton>
            </form>
            <form id={approveId} action={approveAnswer} title={markRead ? undefined : "Add your mark first"}>
              <input type="hidden" name="answerId" value={a.id} />
              <input type="hidden" name="next" value={href(nextPending) ?? `/instructor/exams/${examId}/review?q=${q.number}`} />
              <SubmitButton pendingText="Approving…" variant={reviewed ? "secondary" : "primary"} className={markRead ? "" : "pointer-events-none opacity-50"}>
                {reviewed ? "Re-approve" : "Approve & next"}
              </SubmitButton>
            </form>
          </div>
        </section>
      </FadeIn>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">
          Q{q.number} queue · {queue.length} papers
        </h2>
        <ul className="flex flex-wrap gap-1.5">
          {queue.map((r, i) => (
            <li key={r.answer.id}>
              <Link
                href={href(r)!}
                title={`${r.student ?? "Unmatched"} — ${r.answer.status}`}
                className={cn(
                  "flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold transition",
                  r.answer.id === a.id
                    ? "bg-primary-600 text-white"
                    : r.answer.status === "released"
                      ? "bg-met-soft text-met"
                      : r.answer.status === "approved"
                        ? "bg-primary-50 text-primary-800"
                        : "bg-partial-soft text-partial hover:bg-[#fde7c7]",
                )}
              >
                {i + 1}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex flex-wrap gap-4 text-xs text-ink-2">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-partial-soft" /> Needs review
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-primary-50" /> Approved
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-met-soft" /> Released
          </span>
        </p>
      </Card>
    </>
  );
}
