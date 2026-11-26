import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { Sparkles, Trash2, Plus } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { examWithAccess, conceptsFor } from "@/lib/data";
import { examQuestions } from "@/lib/jobs";
import { aiEnabled, aiLabel } from "@/lib/ai/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { FadeIn } from "@/components/ui/motion";
import { ExamSteps } from "./steps";
import { aiDraftRubric, updateCriterion, addCriterion, deleteCriterion, addQuestion } from "@/lib/actions/instructor";
import { cn, fmtMarks } from "@/lib/utils";

export const metadata: Metadata = { title: "Rubric" };

export default async function RubricPage({ params, searchParams }: PageProps<"/instructor/exams/[examId]">) {
  const user = await requireRole("instructor", "ta", "admin");
  const { examId } = await params;
  const sp = await searchParams;
  const { exam, course } = examWithAccess(user, examId);
  const questions = examQuestions(examId);
  const concepts = conceptsFor(course.id);
  const qNum = Number(sp.q ?? questions.find((q) => q.criteria.some((c) => c.aiDrafted))?.number ?? 1);
  const q = questions.find((x) => x.number === qNum) ?? questions[0];
  const lectureIds = db.select({ id: s.lectures.id }).from(s.lectures).where(eq(s.lectures.courseId, course.id)).all().map((l) => l.id);
  const slides = lectureIds.length
    ? db
        .select({ id: s.slides.id, page: s.slides.page, title: s.slides.title, lecture: s.lectures.number })
        .from(s.slides)
        .innerJoin(s.lectures, eq(s.lectures.id, s.slides.lectureId))
        .where(inArray(s.slides.lectureId, lectureIds))
        .orderBy(asc(s.lectures.number), asc(s.slides.page))
        .all()
    : [];
  const slideMap = new Map(slides.map((x) => [x.id, x]));
  const conceptName = new Map(concepts.map((c) => [c.id, c.name]));
  const total = q ? q.criteria.reduce((a, c) => a + c.marks, 0) : 0;
  const hasAiDraft = q?.criteria.some((c) => c.aiDrafted);

  return (
    <>
      <PageHeader crumb={<>Exams / {course.title}</>} title={`${exam.title} · written answers`} />
      <ExamSteps examId={examId} current="rubric" done={questions.length ? ["rubric"] : []} />

      <div className="flex flex-wrap items-start gap-6">
        <Card className="flex min-w-0 flex-[999_1_520px] flex-col gap-4 p-6">
          <nav aria-label="Questions" className="flex flex-wrap gap-2">
            {questions.map((x) => (
              <Link
                key={x.id}
                href={`/instructor/exams/${examId}?q=${x.number}`}
                aria-current={x.number === q?.number ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center rounded-full px-3 text-[13px] font-semibold transition",
                  x.number === q?.number ? "bg-primary-600 text-white" : "bg-ground text-[#374151] hover:bg-primary-50",
                )}
              >
                Q{x.number}
              </Link>
            ))}
          </nav>

          {q ? (
            <FadeIn key={q.id} className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg leading-[26px] font-semibold">
                  Q{q.number} · {q.prompt}
                </h2>
                <p className="mt-1 text-[13px] text-ink-2">
                  {fmtMarks(q.maxMarks)} marks{q.conceptId ? ` · ${conceptName.get(q.conceptId)}` : ""} · Model answer: “{q.modelAnswer}”
                </p>
              </div>
              {hasAiDraft ? (
                <div className="rounded-[10px] border border-ai-line bg-ai-soft px-3.5 py-2.5 text-[13px] text-[#4c1d95]">
                  AI drafted these criteria from your model answer. Edit the wording or marks, then link each one to the slide that teaches it.
                </div>
              ) : null}
              {total !== q.maxMarks && q.criteria.length ? (
                <p role="status" className="rounded-lg bg-partial-soft px-3 py-2 text-[13px] text-partial-ink">
                  Criteria add up to {fmtMarks(total)} but the question is worth {fmtMarks(q.maxMarks)} marks.
                </p>
              ) : null}

              <ul className="flex flex-col">
                {q.criteria.map((c) => (
                  <li key={c.id} className="border-t border-line-2 py-4">
                    <form action={updateCriterion} className="grid grid-cols-[34px_1fr_auto] items-start gap-3">
                      <input type="hidden" name="criterionId" value={c.id} />
                      <strong className="pt-2 text-sm text-ink-2">{c.code}</strong>
                      <div className="flex min-w-0 flex-col gap-2">
                        <label className="sr-only" htmlFor={`d-${c.id}`}>
                          Criterion {c.code}
                        </label>
                        <input id={`d-${c.id}`} name="description" defaultValue={c.description} className="h-10 rounded-lg border border-transparent px-2 text-[15px] transition hover:border-line focus:border-primary-600 focus:shadow-glow focus:outline-none" />
                        <div className="flex flex-wrap items-center gap-2 px-2">
                          {c.conceptId ? <Badge tone="primary">{conceptName.get(c.conceptId)}</Badge> : null}
                          <label className="sr-only" htmlFor={`s-${c.id}`}>
                            Supporting slide
                          </label>
                          <select id={`s-${c.id}`} name="slideId" defaultValue={c.slideId ?? ""} className="h-7 max-w-[260px] rounded-full border border-line bg-ground px-2 text-xs">
                            <option value="">Link a slide…</option>
                            {slides.map((sl) => (
                              <option key={sl.id} value={sl.id}>
                                L{sl.lecture} · {sl.page} — {sl.title}
                              </option>
                            ))}
                          </select>
                          {c.slideId && slideMap.get(c.slideId) ? (
                            <Link href={`/slides/${c.slideId}`} className="text-xs font-medium text-primary-600 hover:underline">
                              Open
                            </Link>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-end gap-2">
                        <label className="flex flex-col text-[11px] text-ink-2">
                          Marks
                          <input name="marks" type="number" step="0.5" min="0" defaultValue={c.marks} className="h-9 w-16 rounded-lg border border-[#9ca3af] text-center text-[15px] font-semibold" />
                        </label>
                        <SubmitButton size="sm" variant="secondary">
                          Save
                        </SubmitButton>
                      </div>
                    </form>
                    <form action={deleteCriterion} className="mt-1 pl-[46px]">
                      <input type="hidden" name="criterionId" value={c.id} />
                      <button className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-missing">
                        <Trash2 size={12} aria-hidden /> Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <form action={addCriterion}>
                  <input type="hidden" name="questionId" value={q.id} />
                  <SubmitButton variant="ghost" className="px-2">
                    <Plus size={16} aria-hidden /> Add criterion
                  </SubmitButton>
                </form>
                <form action={aiDraftRubric}>
                  <input type="hidden" name="questionId" value={q.id} />
                  <SubmitButton variant="ai" pendingText="Drafting…">
                    <Sparkles size={15} aria-hidden /> {q.criteria.length ? "Redraft with AI" : "Draft criteria with AI"}
                  </SubmitButton>
                </form>
              </div>
            </FadeIn>
          ) : (
            <p className="text-sm text-ink-2">Add the first question on the right.</p>
          )}
        </Card>

        <div className="flex w-full flex-col gap-4 lg:max-w-[380px]">
          <Card className="p-5">
            <h2 className="font-semibold">Add a question</h2>
            <form action={addQuestion} className="mt-4 grid gap-3 text-sm">
              <input type="hidden" name="examId" value={examId} />
              <label className="grid gap-1">
                <span className="text-[13px] font-semibold">Question</span>
                <textarea name="prompt" rows={2} required className="rounded-lg border border-[#9ca3af] px-3 py-2" />
              </label>
              <label className="grid gap-1">
                <span className="text-[13px] font-semibold">Model answer</span>
                <textarea name="modelAnswer" rows={3} className="rounded-lg border border-[#9ca3af] px-3 py-2" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span className="text-[13px] font-semibold">Marks</span>
                  <input name="maxMarks" type="number" min="1" step="0.5" defaultValue={4} className="h-10 rounded-lg border border-[#9ca3af] px-3" />
                </label>
                <label className="grid gap-1">
                  <span className="text-[13px] font-semibold">Concept</span>
                  <select name="conceptId" className="h-10 rounded-lg border border-[#9ca3af] px-2">
                    {concepts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <SubmitButton>Add question</SubmitButton>
            </form>
          </Card>
          <Card className="flex flex-col gap-3 p-5">
            <p className="text-sm text-ink-2">
              {aiEnabled() ? `${aiLabel()} is connected: drafting, reading handwriting and matching run live.` : "Demo mode: no AI key is set, so drafting and matching use the offline demo logic. Add a free GEMINI_API_KEY to read real handwriting."}
            </p>
            <ButtonLink href={`/instructor/exams/${examId}/upload`}>Next: student papers →</ButtonLink>
          </Card>
        </div>
      </div>
    </>
  );
}
