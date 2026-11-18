import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { OptionList } from "../components/OptionList";
import { api } from "../services/api";
import type { BankQuestion, PracticeCheck } from "../types/api";

export function PracticePage() {
  const { planId = "", conceptId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const plan = useQuery({ queryKey: ["plan", planId], queryFn: () => api.plan(planId) });
  const questions = useQuery({ queryKey: ["practice", conceptId], queryFn: () => api.practice(conceptId) });

  const concept = plan.data?.concepts.find((c) => c.concept_id === conceptId);
  const task = concept?.tasks.find((t) => t.task_type === "practice");
  const finish = useMutation({
    mutationFn: () => (task && task.status !== "completed" ? api.completeTask(task.id) : Promise.resolve()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan", planId] });
      navigate(`/plans/${planId}`);
    },
  });

  if (plan.isPending || questions.isPending) return <p className="text-slate-500">Loading practice…</p>;
  if (plan.isError || questions.isError)
    return (
      <p className="rounded-lg bg-red-50 p-4 text-red-700">{(plan.error ?? questions.error)?.message}</p>
    );

  return (
    <div className="max-w-3xl">
      <Link to={`/plans/${planId}`} className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to plan
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Practice: {concept?.name}</h1>
      <p className="text-slate-600">Check each answer to see the right one and the slide that explains it.</p>

      {questions.data.length === 0 ? (
        <p className="mt-6 text-slate-500">No approved practice questions for this concept yet.</p>
      ) : (
        <ol className="mt-6 space-y-4">
          {questions.data.map((q, i) => (
            <PracticeQuestion key={q.id} index={i + 1} question={q} />
          ))}
        </ol>
      )}

      <button
        onClick={() => finish.mutate()}
        disabled={finish.isPending}
        className="mt-6 rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
      >
        Done practising
      </button>
    </div>
  );
}

function PracticeQuestion({ index, question: q }: { index: number; question: BankQuestion }) {
  const [answer, setAnswer] = useState<string>();
  const [result, setResult] = useState<PracticeCheck | null>(null);
  const check = useMutation({ mutationFn: () => api.checkPractice(q.id, answer!), onSuccess: setResult });

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="font-medium">
        <span className="text-slate-400">{index}.</span> {q.prompt}
      </p>
      <OptionList
        name={q.id}
        options={q.options}
        value={answer}
        onChange={(k) => {
          setAnswer(k);
          setResult(null);
        }}
        correctKey={result?.correct_answer}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={() => check.mutate()}
          disabled={!answer || check.isPending}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:border-brand-600 disabled:opacity-50"
        >
          Check
        </button>
        {result && (
          <p className={`text-sm ${result.correct ? "text-emerald-700" : "text-red-700"}`}>
            {result.correct ? "Correct." : `Not quite. The answer is ${result.correct_answer}.`}
            {result.source && (
              <>
                {" "}
                <Link
                  to={`/materials/${result.source.material_id}/pages/${result.source.page_number}`}
                  className="text-brand-700 underline"
                >
                  See {result.source.filename}, page {result.source.page_number}
                </Link>
              </>
            )}
          </p>
        )}
      </div>
    </li>
  );
}
