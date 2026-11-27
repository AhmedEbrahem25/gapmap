import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { TriangleAlert, Sparkles } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { profileFor } from "@/lib/student";
import { slideRef } from "@/lib/data";
import { SlideLink } from "@/components/ui/slide-link";
import type { ExperimentPayload } from "@/lib/ai/pipelines";
import { StudentHeader } from "@/components/shell/student-header";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { SubmitButton } from "@/components/ui/submit-button";
import { ExplainForm } from "./explain-form";
import { setPreferredActivity, startRetest, rateActivity } from "@/lib/actions/student";
import type { ActivityType } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Activity" };

const approaches: { type: ActivityType; label: string }[] = [
  { type: "experiment", label: "Experiment" },
  { type: "mind_map", label: "Mind map" },
  { type: "worked_example", label: "Worked example" },
  { type: "try_first", label: "Try it first" },
  { type: "own_words", label: "Explain it" },
];

export default async function ActivityPage({ params }: PageProps<"/student/plan/[activityId]">) {
  const user = await requireRole("student");
  const { activityId } = await params;
  const row = db
    .select({ a: s.activities, concept: s.concepts })
    .from(s.activities)
    .innerJoin(s.concepts, eq(s.concepts.id, s.activities.conceptId))
    .where(and(eq(s.activities.id, activityId), eq(s.activities.studentId, user.id)))
    .get();
  if (!row) notFound();
  const { a, concept } = row;
  const profile = profileFor(user.id);
  const isExperiment = a.type === "experiment" && "table" in a.payload;
  const p = a.payload as unknown as ExperimentPayload & { prompt?: string };
  const slide = slideRef(typeof a.payload.slideId === "string" ? a.payload.slideId : null);

  return (
    <>
      <StudentHeader back="/student/plan" eyebrow={`Study plan · ${concept.name}`} title={a.title} />
      <Stagger className="flex flex-col gap-3 px-5">
        <StaggerItem>
          <section aria-label="Study profile" className="flex flex-col gap-2 rounded-2xl border border-line bg-white px-4 py-3.5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">How you like to study</h2>
              <Link href={`/student/profile?next=/student/plan/${a.id}`} className="text-sm font-medium">
                {profile ? "Edit" : "Set up"}
              </Link>
            </div>
            {profile ? (
              <div className="flex flex-wrap gap-1.5">
                {profile.traits.map((t) => (
                  <span key={t} className="inline-flex h-[26px] items-center rounded-full border border-line bg-ground px-2.5 text-xs font-medium text-[#374151]">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            <p className="text-sm leading-[19px] text-ink-2">{a.reason}</p>
          </section>
        </StaggerItem>

        {isExperiment ? (
          <StaggerItem>
            <section aria-label="Experiment" className="flex flex-col gap-2.5 rounded-sheet border-2 border-primary-600 bg-white p-4">
              <p className="text-base leading-[22px]">{p.intro}</p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse font-mono text-sm">
                  <thead>
                    <tr className="text-left text-ink-2">
                      {p.table.columns.map((c) => (
                        <th key={c} className="border-b border-line px-2 py-1.5 font-medium">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {p.table.rows.map((r, i) => (
                      <tr key={i} className="bg-partial-soft">
                        {r.map((v, j) => (
                          <td key={j} className="border-b border-line px-2 py-1.5">
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm leading-[21px]">
                <strong>Your task:</strong> {p.task}
              </p>
              <pre className="overflow-x-auto rounded-[10px] bg-ink px-3 py-2.5 font-mono text-xs leading-[19px] text-[#e5e7eb]">{p.sql}</pre>
              <RunResult result={p.result} />
            </section>
          </StaggerItem>
        ) : (
          <StaggerItem>
            <section className="rounded-sheet border-2 border-primary-600 bg-white p-4 text-base leading-[22px]">{String(p.prompt ?? a.title)}</section>
          </StaggerItem>
        )}

        {slide ? (
          <StaggerItem>
            <SlideLink href={`/slides/${slide.id}?from=/student/plan/${a.id}`} lecture={slide.lectureNumber} page={slide.page} title={slide.title} />
          </StaggerItem>
        ) : null}

        <StaggerItem>
          <ExplainForm activityId={a.id} label={isExperiment ? p.prompt : "Your answer"} initialFeedback={a.feedback} initialOk={a.status === "done"} initialText={a.submission ?? ""} />
        </StaggerItem>

        {a.status === "done" ? (
          <StaggerItem className="flex flex-col gap-3">
            <form action={startRetest}>
              <input type="hidden" name="conceptId" value={concept.id} />
              <SubmitButton size="lg" className="w-full" pendingText="Writing a fresh question…">
                <Sparkles size={16} aria-hidden /> Take a fresh test
              </SubmitButton>
            </form>
            {!a.usefulness ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold">Did this activity help you understand?</p>
                <div className="flex gap-2">
                  {[
                    ["a_lot", "Yes, a lot"],
                    ["a_little", "A little"],
                    ["not_really", "Not really"],
                  ].map(([v, l]) => (
                    <form key={v} action={rateActivity} className="flex-1">
                      <input type="hidden" name="activityId" value={a.id} />
                      <input type="hidden" name="usefulness" value={v} />
                      <SubmitButton variant="secondary" className="w-full">
                        {l}
                      </SubmitButton>
                    </form>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-center text-sm text-ink-2">Thanks — GapMap uses this to pick better activities for you.</p>
            )}
          </StaggerItem>
        ) : null}

        {profile ? (
          <StaggerItem>
            <details className="rounded-2xl border border-line bg-white px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-primary-600">Try a different approach</summary>
              <div className="mt-3 flex flex-wrap gap-2">
                {approaches
                  .filter((x) => x.type !== a.type)
                  .map((x) => (
                    <form key={x.type} action={setPreferredActivity}>
                      <input type="hidden" name="type" value={x.type} />
                      <input type="hidden" name="activityId" value={a.id} />
                      <SubmitButton variant="secondary" size="sm">
                        {x.label}
                      </SubmitButton>
                    </form>
                  ))}
              </div>
            </details>
          </StaggerItem>
        ) : null}
      </Stagger>
    </>
  );
}

function RunResult({ result }: { result: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] bg-missing-soft px-3 py-2 text-sm font-semibold text-[#991b1b]">
      <TriangleAlert size={16} aria-hidden /> {result}
    </div>
  );
}
