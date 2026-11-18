import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { OptionList } from "../components/OptionList";
import { api } from "../services/api";

export function RetestPage() {
  const { retestId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const retest = useQuery({ queryKey: ["retest", retestId], queryFn: () => api.retest(retestId) });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () => api.submitRetest(retestId, answers),
    onSuccess: (results) => {
      queryClient.setQueryData(["retest-results", retestId], results);
      queryClient.invalidateQueries({ queryKey: ["plan", results.plan_id] });
      navigate(`/retests/${retestId}/results`, { replace: true });
    },
    onError: (err) => setError(err.message),
  });

  if (retest.isPending) return <p className="text-slate-500">Loading retest…</p>;
  if (retest.isError) return <p className="rounded-lg bg-red-50 p-4 text-red-700">{retest.error.message}</p>;
  if (retest.data.status === "submitted") return <Navigate to={`/retests/${retestId}/results`} replace />;

  const questions = retest.data.questions;
  const unanswered = questions.length - Object.keys(answers).length;

  return (
    <div className="max-w-3xl">
      <Link to={`/plans/${retest.data.plan_id}`} className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to plan
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Retest</h1>
      <p className="text-slate-600">{questions.length} new questions. You can submit once.</p>

      <ol className="mt-6 space-y-4">
        {questions.map((q, i) => (
          <li key={q.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="font-medium">
              <span className="text-slate-400">{i + 1}.</span> {q.prompt}
            </p>
            <OptionList
              name={q.id}
              options={q.options}
              value={answers[q.id]}
              onChange={(k) => setAnswers((a) => ({ ...a, [q.id]: k }))}
            />
          </li>
        ))}
      </ol>

      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={() => {
            if (unanswered > 0 && !window.confirm(`${unanswered} question(s) unanswered. Submit anyway?`)) return;
            submit.mutate();
          }}
          disabled={submit.isPending}
          className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
        >
          {submit.isPending ? "Submitting…" : "Submit retest"}
        </button>
        {unanswered > 0 && <span className="text-sm text-slate-500">{unanswered} unanswered</span>}
      </div>
    </div>
  );
}

export function RetestResultsPage() {
  const { retestId = "" } = useParams();
  const results = useQuery({ queryKey: ["retest-results", retestId], queryFn: () => api.retestResults(retestId) });

  if (results.isPending) return <p className="text-slate-500">Loading results…</p>;
  if (results.isError) return <p className="rounded-lg bg-red-50 p-4 text-red-700">{results.error.message}</p>;
  const r = results.data;

  return (
    <div className="max-w-3xl">
      <Link to={`/plans/${r.plan_id}`} className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to plan
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Retest results</h1>
        <p className="text-2xl font-semibold">
          {r.total_score}
          <span className="text-base text-slate-400"> / {r.max_score}</span>
        </p>
      </div>

      <h2 className="mt-6 text-lg font-semibold">Before and after, by concept</h2>
      <div className="mt-3 space-y-3">
        {r.concepts.map((c) => (
          <div key={c.concept_id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-semibold">{c.name}</p>
              <span
                className={`rounded-full px-2 py-0.5 text-sm font-medium ${
                  c.gain_points > 0
                    ? "bg-emerald-100 text-emerald-800"
                    : c.gain_points < 0
                      ? "bg-red-100 text-red-800"
                      : "bg-slate-100 text-slate-700"
                }`}
              >
                {c.gain_points > 0 ? "+" : ""}
                {c.gain_points} points
              </span>
            </div>
            <Bar label={`Exam (${c.before_question_count} q)`} percent={c.before_percent} tone="bg-slate-400" />
            <Bar label={`Retest (${c.after_question_count} q)`} percent={c.after_percent} tone="bg-brand-600" />
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-slate-500">{r.note}</p>

      <h2 className="mt-8 text-lg font-semibold">Your answers</h2>
      <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {r.questions.map((q) => (
          <li key={q.bank_question_id} className="p-4 text-sm">
            <p className="text-xs text-slate-400">{q.concept_name}</p>
            <p className="font-medium">{q.prompt}</p>
            <p className={q.correct ? "text-emerald-700" : "text-red-700"}>
              {q.correct ? "✓" : "✗"} Your answer: {q.your_answer ?? "—"}
              {!q.correct && (
                <span className="text-slate-600">
                  {" "}
                  · Correct: {q.correct_answer}
                  {q.correct_answer_text && ` (${q.correct_answer_text})`}
                </span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bar({ label, percent, tone }: { label: string; percent: number; tone: string }) {
  return (
    <div className="mt-2 flex items-center gap-3 text-xs">
      <span className="w-24 shrink-0 text-slate-500">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${tone}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="w-12 text-right font-medium">{percent}%</span>
    </div>
  );
}
