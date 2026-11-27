import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { FileText, Sparkles, Plus, Users } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { assertCourseAccess, courseExams, conceptsFor } from "@/lib/data";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge, StatusChip, statusFromRatio } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Stagger, StaggerItem, AnimatedBar } from "@/components/ui/motion";
import { UploadDropzone } from "@/components/instructor/upload-dropzone";
import { LiveRefresh } from "@/components/live-refresh";
import { confirmSlideTags, confirmAllLectureTags, toggleSlideConcept, addConcept, enrollStudents, retagLecture } from "@/lib/actions/instructor";
import { cn, pct } from "@/lib/utils";

export const metadata: Metadata = { title: "Course" };

const tabs = [
  { key: "lectures", label: "Lectures" },
  { key: "concepts", label: "Concepts" },
  { key: "students", label: "Students" },
] as const;

export default async function CoursePage({ params, searchParams }: PageProps<"/instructor/courses/[courseId]">) {
  const user = await requireRole("instructor", "ta", "admin");
  const { courseId } = await params;
  const sp = await searchParams;
  const course = assertCourseAccess(user, courseId);
  const tab = (typeof sp.tab === "string" ? sp.tab : "lectures") as (typeof tabs)[number]["key"];
  const lectures = db.select().from(s.lectures).where(eq(s.lectures.courseId, courseId)).orderBy(asc(s.lectures.number)).all();
  const concepts = conceptsFor(courseId);
  const exams = courseExams(courseId);
  const sections = db
    .select({ section: s.enrollments.section })
    .from(s.enrollments)
    .where(and(eq(s.enrollments.courseId, courseId), eq(s.enrollments.role, "student")))
    .all();
  const sectionCount = new Set(sections.map((x) => x.section)).size;
  const processing = lectures.some((l) => l.status === "processing");

  return (
    <>
      <LiveRefresh active={processing} />
      <PageHeader
        crumb={<>Courses / {course.code}</>}
        title={course.title}
        sub={`${course.term} · ${sectionCount} section${sectionCount === 1 ? "" : "s"} · ${sections.length} students · ${exams.length} exam${exams.length === 1 ? "" : "s"}`}
        actions={
          <>
            <ButtonLink variant="secondary" href={`/instructor/courses/${courseId}?tab=students`}>
              <Users size={16} aria-hidden /> Students
            </ButtonLink>
            <ButtonLink href={exams[0] ? `/instructor/exams/${exams[0].id}/upload` : "/instructor/exams"}>New exam analysis</ButtonLink>
          </>
        }
      />

      <div role="tablist" aria-label="Course sections" className="flex gap-6 border-b border-line text-sm font-semibold">
        {tabs.map((t) => (
          <Link
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            href={`/instructor/courses/${courseId}?tab=${t.key}`}
            className={cn(
              "-mb-px border-b-2 pb-3 transition-colors",
              tab === t.key ? "border-primary-600 text-primary-800" : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {t.label}
            {t.key === "concepts" ? ` (${concepts.length})` : ""}
          </Link>
        ))}
      </div>

      {tab === "lectures" ? (
        <Lectures courseId={courseId} lectures={lectures} concepts={concepts} selected={typeof sp.lecture === "string" ? sp.lecture : undefined} />
      ) : null}
      {tab === "concepts" ? <Concepts courseId={courseId} concepts={concepts} /> : null}
      {tab === "students" ? <Students courseId={courseId} concepts={concepts} /> : null}
    </>
  );
}

function Lectures({
  courseId,
  lectures,
  concepts,
  selected,
}: {
  courseId: string;
  lectures: (typeof s.lectures.$inferSelect)[];
  concepts: (typeof s.concepts.$inferSelect)[];
  selected?: string;
}) {
  const suggestedBySlide = new Map<string, number>();
  const allSlides = lectures.length
    ? db
        .select()
        .from(s.slides)
        .where(
          inArray(
            s.slides.lectureId,
            lectures.map((l) => l.id),
          ),
        )
        .orderBy(asc(s.slides.page))
        .all()
    : [];
  const tags = allSlides.length
    ? db
        .select()
        .from(s.slideConcepts)
        .where(
          inArray(
            s.slideConcepts.slideId,
            allSlides.map((x) => x.id),
          ),
        )
        .all()
    : [];
  for (const t of tags) if (t.status === "suggested") suggestedBySlide.set(t.slideId, (suggestedBySlide.get(t.slideId) ?? 0) + 1);
  const pendingByLecture = (id: string) => allSlides.filter((sl) => sl.lectureId === id && suggestedBySlide.has(sl.id)).length;
  const current = lectures.find((l) => l.id === selected) ?? lectures.find((l) => pendingByLecture(l.id) > 0) ?? lectures[lectures.length - 1];
  const slides = allSlides.filter((sl) => sl.lectureId === current?.id);
  const firstSuggested = slides.find((sl) => suggestedBySlide.has(sl.id));
  const conceptName = new Map(concepts.map((c) => [c.id, c.name]));

  return (
    <div className="flex flex-wrap items-start gap-6">
      <section aria-label="Lectures" className="flex w-full flex-col gap-3 lg:max-w-[340px]">
        <UploadDropzone
          endpoint="/api/lectures"
          fields={{ courseId }}
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          title="Drop lecture files"
          hint="PDF or Word · split into slides and tagged automatically"
        />
        <Stagger className="flex flex-col gap-2">
          {lectures.map((l) => {
            const pending = pendingByLecture(l.id);
            const count = allSlides.filter((sl) => sl.lectureId === l.id).length;
            const active = current?.id === l.id;
            return (
              <StaggerItem key={l.id}>
                <Link
                  href={`/instructor/courses/${courseId}?tab=lectures&lecture=${l.id}`}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex gap-3 rounded-card border bg-white p-3 transition hover:shadow-lift",
                    active ? "border-2 border-primary-600" : "border-line",
                  )}
                >
                  <span className={cn("w-7 text-[13px] font-semibold", active ? "text-primary-800" : "text-ink-2")}>L{l.number}</span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className={cn("block truncate", active && "font-semibold")}>{l.title}</span>
                    <span className="block text-xs text-ink-2">
                      {l.status === "processing" ? (
                        <span className="text-primary-600">Processing… {l.progress}%</span>
                      ) : l.status === "failed" ? (
                        <span className="text-missing">Could not read this file</span>
                      ) : (
                        <>
                          {count} slides{pending ? ` · ${pending} tag${pending > 1 ? "s" : ""} need review` : ""}
                        </>
                      )}
                    </span>
                    {l.status === "processing" ? <AnimatedBar value={l.progress} color="#B51834" height={4} className="mt-2" /> : null}
                  </span>
                </Link>
              </StaggerItem>
            );
          })}
        </Stagger>
      </section>

      {current ? (
        <Card className="flex min-w-0 flex-[999_1_480px] flex-col gap-5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                L{current.number} · {current.title}
              </h2>
              <p className="text-[13px] text-ink-2">Each slide is tagged with the concepts it teaches, so feedback can link straight to it.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <form action={retagLecture}>
                <input type="hidden" name="lectureId" value={current.id} />
                <SubmitButton size="sm" variant="ghost" pendingText="Tagging…">
                  <Sparkles size={14} aria-hidden /> Re-tag with AI
                </SubmitButton>
              </form>
              {pendingByLecture(current.id) ? (
                <form action={confirmAllLectureTags} className="flex items-center gap-2">
                  <input type="hidden" name="lectureId" value={current.id} />
                  <Badge tone="ai">
                    <Sparkles size={12} aria-hidden /> {pendingByLecture(current.id)} AI tag{pendingByLecture(current.id) > 1 ? "s" : ""} need review
                  </Badge>
                  <SubmitButton size="sm" variant="secondary">
                    Confirm all
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          </div>

          {firstSuggested ? (
            <div className="flex flex-wrap items-center gap-4 rounded-card border border-ai-line bg-ai-soft p-4">
              <p className="min-w-[260px] flex-1 text-sm leading-[21px]">
                <strong className="text-ai-ink">AI suggestion</strong> · Slide {firstSuggested.page} teaches{" "}
                {tags
                  .filter((t) => t.slideId === firstSuggested.id)
                  .map((t) => conceptName.get(t.conceptId))
                  .filter(Boolean)
                  .map((n, i, arr) => (
                    <span key={n}>
                      <strong>{n}</strong>
                      {i < arr.length - 1 ? " and " : ""}
                    </span>
                  ))}
                . Confirm so students can be sent here from their feedback.
              </p>
              <div className="flex gap-2">
                <ButtonLink variant="secondary" href={`/slides/${firstSuggested.id}`}>
                  Open slide
                </ButtonLink>
                <form action={confirmSlideTags}>
                  <input type="hidden" name="slideId" value={firstSuggested.id} />
                  <SubmitButton>Confirm</SubmitButton>
                </form>
              </div>
            </div>
          ) : null}

          {slides.length === 0 ? (
            <p className="text-sm text-ink-2">
              {current.status === "processing" ? "Reading the file and splitting it into slides…" : "No slides found in this file."}
            </p>
          ) : (
            <Stagger className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4" gap={0.03}>
              {slides.map((sl) => {
                const slideTags = tags.filter((t) => t.slideId === sl.id);
                const suggested = suggestedBySlide.has(sl.id);
                return (
                  <StaggerItem key={sl.id}>
                    <div className="group flex flex-col gap-2">
                      <Link
                        href={`/slides/${sl.id}`}
                        className={cn(
                          "flex h-28 flex-col justify-between overflow-hidden rounded-lg border bg-gradient-to-br from-white to-[#f1f3f9] p-2.5 transition group-hover:-translate-y-0.5 group-hover:shadow-lift",
                          suggested ? "border-2 border-[#7c3aed]" : "border-line",
                        )}
                      >
                        <span className="line-clamp-2 text-[12px] leading-4 font-semibold text-ink">{sl.title}</span>
                        <span className="line-clamp-3 text-[10px] leading-[13px] text-ink-2">{sl.body}</span>
                      </Link>
                      <span className="text-xs text-ink-2">Slide {sl.page}</span>
                      <details className="relative">
                        <summary className="flex cursor-pointer list-none flex-wrap gap-1">
                          {slideTags.length ? (
                            slideTags.map((t) => (
                              <Badge key={t.conceptId} tone={t.status === "suggested" ? "ai" : "primary"} className="h-[22px] px-2">
                                {conceptName.get(t.conceptId)}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-ink-3 hover:text-primary-600">+ Tag concept</span>
                          )}
                        </summary>
                        <div className="absolute z-10 mt-1 w-56 rounded-lg border border-line bg-white p-2 shadow-lift">
                          {concepts.map((c) => {
                            const on = slideTags.some((t) => t.conceptId === c.id);
                            return (
                              <form key={c.id} action={toggleSlideConcept}>
                                <input type="hidden" name="slideId" value={sl.id} />
                                <input type="hidden" name="conceptId" value={c.id} />
                                <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-ground">
                                  <span
                                    className={cn("h-3.5 w-3.5 rounded border", on ? "border-primary-600 bg-primary-600" : "border-[#9ca3af]")}
                                    aria-hidden
                                  />
                                  {c.name}
                                </button>
                              </form>
                            );
                          })}
                        </div>
                      </details>
                    </div>
                  </StaggerItem>
                );
              })}
            </Stagger>
          )}
        </Card>
      ) : (
        <Card className="flex flex-1 items-center justify-center p-10 text-sm text-ink-2">
          <FileText className="mr-2" size={18} /> Upload your first lecture to start.
        </Card>
      )}
    </div>
  );
}

function Concepts({ courseId, concepts }: { courseId: string; concepts: (typeof s.concepts.$inferSelect)[] }) {
  const slideCounts = new Map<string, number>();
  if (concepts.length) {
    for (const t of db
      .select()
      .from(s.slideConcepts)
      .where(
        inArray(
          s.slideConcepts.conceptId,
          concepts.map((c) => c.id),
        ),
      )
      .all()) {
      slideCounts.set(t.conceptId, (slideCounts.get(t.conceptId) ?? 0) + 1);
    }
  }
  const attempts = concepts.length
    ? db
        .select()
        .from(s.attempts)
        .where(
          inArray(
            s.attempts.conceptId,
            concepts.map((c) => c.id),
          ),
        )
        .all()
    : [];
  const name = new Map(concepts.map((c) => [c.id, c.name]));
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-xs font-semibold text-ink-2">
            <tr>
              <th className="px-5 py-3">Concept</th>
              <th className="px-3 py-3">Unit</th>
              <th className="px-3 py-3">Builds on</th>
              <th className="px-3 py-3">Slides</th>
              <th className="px-5 py-3">Class mastery</th>
            </tr>
          </thead>
          <tbody>
            {concepts.map((c) => {
              const a = attempts.filter((x) => x.conceptId === c.id);
              const m = pct(
                a.reduce((t, x) => t + x.score, 0),
                a.reduce((t, x) => t + x.maxScore, 0),
              );
              const st = statusFromRatio(m, 100);
              return (
                <tr key={c.id} className="border-b border-line-2 last:border-0">
                  <td className="px-5 py-3.5">
                    <strong className="block font-semibold">{c.name}</strong>
                    <span className="text-xs text-ink-2">{c.description}</span>
                  </td>
                  <td className="px-3">{c.unit}</td>
                  <td className="px-3 text-ink-2">{c.prerequisiteId ? name.get(c.prerequisiteId) : "—"}</td>
                  <td className="px-3">{slideCounts.get(c.id) ?? 0}</td>
                  <td className="w-56 px-5">
                    {a.length ? (
                      <div className="flex items-center gap-3">
                        <AnimatedBar value={m} color={st === "met" ? "#0F766E" : st === "partial" ? "#B45309" : "#B91C1C"} />
                        <span className="w-10 text-right font-semibold">{m}%</span>
                      </div>
                    ) : (
                      <span className="text-ink-3">No attempts yet</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <Card className="h-fit p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Plus size={16} aria-hidden /> Add a concept
        </h2>
        <form action={addConcept} className="mt-4 grid gap-3 text-sm">
          <input type="hidden" name="courseId" value={courseId} />
          <label className="grid gap-1">
            <span className="text-[13px] font-semibold">Name</span>
            <input name="name" required className="h-10 rounded-lg border border-[#9ca3af] px-3" />
          </label>
          <label className="grid gap-1">
            <span className="text-[13px] font-semibold">Short description</span>
            <input name="description" className="h-10 rounded-lg border border-[#9ca3af] px-3" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">
              <span className="text-[13px] font-semibold">Unit</span>
              <input name="unit" type="number" min={1} defaultValue={1} className="h-10 rounded-lg border border-[#9ca3af] px-3" />
            </label>
            <label className="grid gap-1">
              <span className="text-[13px] font-semibold">Builds on</span>
              <select name="prerequisiteId" className="h-10 rounded-lg border border-[#9ca3af] px-2">
                <option value="">None</option>
                {concepts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <SubmitButton>Add concept</SubmitButton>
        </form>
      </Card>
    </div>
  );
}

function Students({ courseId, concepts }: { courseId: string; concepts: (typeof s.concepts.$inferSelect)[] }) {
  const students = db
    .select({ id: s.users.id, name: s.users.name, email: s.users.email, section: s.enrollments.section })
    .from(s.enrollments)
    .innerJoin(s.users, eq(s.users.id, s.enrollments.userId))
    .where(and(eq(s.enrollments.courseId, courseId), eq(s.enrollments.role, "student")))
    .orderBy(asc(s.enrollments.section), asc(s.users.name))
    .all();
  const attempts = students.length
    ? db
        .select()
        .from(s.attempts)
        .where(
          inArray(
            s.attempts.studentId,
            students.map((x) => x.id),
          ),
        )
        .all()
    : [];
  const cName = new Map(concepts.map((c) => [c.id, c.name]));
  return (
    <>
      <Card className="p-5">
        <h2 className="font-semibold">Enrol students</h2>
        <form action={enrollStudents} className="mt-3 grid gap-3 text-sm sm:grid-cols-[1fr_120px_auto] sm:items-end">
          <input type="hidden" name="courseId" value={courseId} />
          <label className="grid gap-1">
            <span className="text-[13px] font-semibold">Student emails (one per line or comma-separated)</span>
            <textarea name="emails" rows={2} required className="rounded-lg border border-[#9ca3af] px-3 py-2" />
          </label>
          <label className="grid gap-1">
            <span className="text-[13px] font-semibold">Section</span>
            <input name="section" defaultValue="A" className="h-10 rounded-lg border border-[#9ca3af] px-3" />
          </label>
          <SubmitButton>Enrol</SubmitButton>
        </form>
      </Card>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line text-xs font-semibold text-ink-2">
            <tr>
              <th className="px-5 py-3">Student</th>
              <th className="px-3 py-3">Section</th>
              <th className="px-3 py-3">Overall</th>
              <th className="px-5 py-3">Weakest concept</th>
            </tr>
          </thead>
          <tbody>
            {students.map((st) => {
              const a = attempts.filter((x) => x.studentId === st.id);
              const overall = pct(
                a.reduce((t, x) => t + x.score, 0),
                a.reduce((t, x) => t + x.maxScore, 0),
              );
              const byConcept = new Map<string, { sc: number; mx: number }>();
              for (const x of a) {
                const v = byConcept.get(x.conceptId) ?? { sc: 0, mx: 0 };
                v.sc += x.score;
                v.mx += x.maxScore;
                byConcept.set(x.conceptId, v);
              }
              const weakest = Array.from(byConcept.entries()).sort((p, q) => p[1].sc / p[1].mx - q[1].sc / q[1].mx)[0];
              return (
                <tr key={st.id} className="border-b border-line-2 last:border-0">
                  <td className="px-5 py-3">
                    <strong className="block font-semibold">{st.name}</strong>
                    <span className="text-xs text-ink-2">{st.email}</span>
                  </td>
                  <td className="px-3">{st.section}</td>
                  <td className="px-3 font-semibold">{a.length ? `${overall}%` : "—"}</td>
                  <td className="px-5">
                    {weakest ? (
                      <StatusChip
                        status={statusFromRatio(weakest[1].sc, weakest[1].mx)}
                        suffix={`${cName.get(weakest[0])} ${pct(weakest[1].sc, weakest[1].mx)}%`}
                      />
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
