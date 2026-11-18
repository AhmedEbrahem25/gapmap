import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../features/auth/AuthContext";
import { ConceptExplanation } from "../features/recovery/ConceptExplanation";
import { api } from "../services/api";
import type { PlanConcept, RecoveryPlan, RecoveryTask } from "../types/api";

export function RecoveryPlanPage() {
  const { planId = "" } = useParams();
  const { user } = useAuth();
  const plan = useQuery({ queryKey: ["plan", planId], queryFn: () => api.plan(planId) });

  if (plan.isPending) return <p className="text-slate-500">Loading plan…</p>;
  if (plan.isError) return <p className="rounded-lg bg-red-50 p-4 text-red-700">{plan.error.message}</p>;

  const p = plan.data;
  const isOwner = user?.role === "student";
  const tasks = p.concepts.flatMap((c) => c.tasks);
  const done = tasks.filter((t) => t.status === "completed").length;

  return (
    <div>
      <Link
        to={isOwner ? `/exams/${p.exam_id}/report` : `/courses/${p.course_id}`}
        className="text-sm text-slate-500 hover:text-slate-800"
      >
        ← {isOwner ? "Back to report" : "Back to course"}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Recovery plan</h1>
      <p className="text-slate-600">{p.exam_title} · start with the weakest concept</p>

      <div className="mt-4 max-w-md">
        <div className="flex justify-between text-xs text-slate-500">
          <span>Progress</span>
          <span>
            {done} of {tasks.length} steps
          </span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-brand-600" style={{ width: `${tasks.length ? (100 * done) / tasks.length : 0}%` }} />
        </div>
      </div>

      <ol className="mt-8 space-y-6">
        {p.concepts.map((c, i) => (
          <ConceptStep key={c.concept_id} index={i + 1} planId={p.id} concept={c} isOwner={isOwner} />
        ))}
      </ol>

      <RetestCard plan={p} isOwner={isOwner} />
    </div>
  );
}

function ConceptStep({
  index,
  planId,
  concept: c,
  isOwner,
}: {
  index: number;
  planId: string;
  concept: PlanConcept;
  isOwner: boolean;
}) {
  const slides = c.tasks.filter((t) => t.task_type === "review_slide");
  const practice = c.tasks.find((t) => t.task_type === "practice");

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          <span className="text-slate-400">{index}.</span> {c.name}
        </h2>
        <span className="text-sm text-red-700">Exam score {c.percent_before}%</span>
      </div>

      <ConceptExplanation conceptId={c.concept_id} />

      <h3 className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">Review these slides</h3>
      {slides.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">No suitable source was found in the course materials.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {slides.map((t) => (
            <SlideTask key={t.id} planId={planId} task={t} isOwner={isOwner} />
          ))}
        </ul>
      )}

      {practice && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
          <p className="text-sm">
            <StatusDot done={practice.status === "completed"} /> Practice: {c.practice_count} questions
          </p>
          <Link
            to={`/plans/${planId}/practice/${c.concept_id}`}
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            {practice.status === "completed" ? "Practice again" : "Start practice"}
          </Link>
        </div>
      )}
    </li>
  );
}

function SlideTask({ planId, task, isOwner }: { planId: string; task: RecoveryTask; isOwner: boolean }) {
  const queryClient = useQueryClient();
  const complete = useMutation({
    mutationFn: () => api.completeTask(task.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["plan", planId] }),
  });
  const s = task.slide!;
  const done = task.status === "completed";

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 p-2">
      <Link to={`/materials/${s.material_id}/pages/${s.page_number}`} className="min-w-0 hover:underline">
        <p className="text-sm font-medium text-brand-700">
          <StatusDot done={done} /> {s.title ?? `Page ${s.page_number}`}
        </p>
        <p className="text-xs text-slate-500">
          {s.filename} · page {s.page_number}
        </p>
      </Link>
      {isOwner && !done && (
        <button
          onClick={() => complete.mutate()}
          disabled={complete.isPending}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:border-brand-600"
        >
          Mark as reviewed
        </button>
      )}
    </li>
  );
}

function RetestCard({ plan, isOwner }: { plan: RecoveryPlan; isOwner: boolean }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const start = useMutation({
    mutationFn: () => api.startRetest(plan.id),
    onSuccess: (r) => navigate(`/retests/${r.id}`),
    onError: (err) => setError(err.message),
  });
  const submitted = plan.retests.filter((r) => r.status === "submitted");

  return (
    <section className="mt-8 rounded-xl border-2 border-dashed border-brand-100 bg-white p-5">
      <h2 className="text-lg font-semibold">Check your progress</h2>
      <p className="mt-1 text-sm text-slate-600">
        A short retest with {plan.retest_question_count} new questions on these concepts. Take it when you feel ready.
      </p>
      {isOwner && (
        <button
          onClick={() => start.mutate()}
          disabled={start.isPending || plan.retest_question_count === 0}
          className="mt-4 rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
        >
          {plan.retests.some((r) => r.status === "in_progress") ? "Continue retest" : "Take the retest"}
        </button>
      )}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {submitted.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm">
          {submitted.map((r) => (
            <li key={r.id}>
              <Link to={`/retests/${r.id}/results`} className="text-brand-700 hover:underline">
                Retest {r.submitted_at && new Date(r.submitted_at).toLocaleString()}: {r.total_score} / {r.max_score}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusDot({ done }: { done: boolean }) {
  return (
    <span aria-label={done ? "done" : "to do"} className={done ? "text-emerald-600" : "text-slate-300"}>
      {done ? "✓" : "○"}
    </span>
  );
}
