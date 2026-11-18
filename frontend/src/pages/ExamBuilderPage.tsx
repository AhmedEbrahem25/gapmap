import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { CAUSE_LABEL } from "../features/reports/ReportView";
import { api } from "../services/api";
import type { Concept, ErrorType, ExamDetail, ExamQuestion, QuestionInput, QuestionOption } from "../types/api";

const ERROR_TYPES: ErrorType[] = [
  "conceptual",
  "formula_application",
  "calculation",
  "missing_prerequisite",
  "incomplete_answer",
];
const KEYS = ["A", "B", "C", "D", "E", "F"];

export function ExamBuilderPage() {
  const { examId = "" } = useParams();
  const queryClient = useQueryClient();
  const exam = useQuery({ queryKey: ["exam", examId], queryFn: () => api.exam(examId) });
  const course = useQuery({
    queryKey: ["course", exam.data?.course_id],
    queryFn: () => api.course(exam.data!.course_id),
    enabled: !!exam.data,
  });
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = (data: ExamDetail) => {
    queryClient.setQueryData(["exam", examId], data);
    queryClient.invalidateQueries({ queryKey: ["exams", data.course_id] });
    setError(null);
  };
  const statusAction = useMutation({
    mutationFn: (action: "approve" | "reopen") => (action === "approve" ? api.approveKey(examId) : api.reopenExam(examId)),
    onSuccess: save,
    onError: (err) => setError(err.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteQuestion(id),
    onSuccess: save,
    onError: (err) => setError(err.message),
  });

  if (exam.isPending || course.isPending) return <p className="text-slate-500">Loading exam…</p>;
  if (exam.isError) return <p className="rounded-lg bg-red-50 p-4 text-red-700">{exam.error.message}</p>;
  const e = exam.data;
  const concepts = course.data?.concepts ?? [];
  const draft = e.status === "draft";
  const conceptName = (id: string | null) => concepts.find((c) => c.id === id)?.name ?? "No concept";

  return (
    <div className="max-w-4xl">
      <Link to={`/courses/${e.course_id}`} className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to course
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{e.title}</h1>
          <p className="text-slate-600">
            {e.questions.length} question{e.questions.length === 1 ? "" : "s"} ·{" "}
            {draft ? "Draft: the answer key is not approved yet" : "Answer key approved"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {draft ? (
            <button
              onClick={() => statusAction.mutate("approve")}
              disabled={statusAction.isPending}
              className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
            >
              Approve answer key
            </button>
          ) : (
            <>
              {e.can_reopen && (
                <button
                  onClick={() => statusAction.mutate("reopen")}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:border-brand-600"
                >
                  Reopen for editing
                </button>
              )}
              <Link
                to={`/exams/${e.id}/import`}
                className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800"
              >
                Import results
              </Link>
            </>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <ol className="mt-6 space-y-3">
        {e.questions.map((q) =>
          editing === q.id ? (
            <QuestionForm
              key={q.id}
              examId={e.id}
              concepts={concepts}
              initial={q}
              onSaved={(d) => {
                save(d);
                setEditing(null);
              }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <QuestionCard
              key={q.id}
              q={q}
              conceptName={conceptName(q.concept_id)}
              editable={draft}
              onEdit={() => setEditing(q.id)}
              onDelete={() => window.confirm(`Delete ${q.question_code}?`) && remove.mutate(q.id)}
            />
          ),
        )}
      </ol>

      {draft &&
        (editing === "new" ? (
          <div className="mt-3">
            <QuestionForm
              examId={e.id}
              concepts={concepts}
              nextCode={`Q${e.questions.length + 1}`}
              onSaved={(d) => {
                save(d);
                setEditing(null);
              }}
              onCancel={() => setEditing(null)}
            />
          </div>
        ) : (
          <button
            onClick={() => setEditing("new")}
            className="mt-4 rounded-md border border-dashed border-slate-400 px-4 py-2 text-sm text-slate-700 hover:border-brand-600"
          >
            + Add question
          </button>
        ))}
    </div>
  );
}

function QuestionCard({
  q,
  conceptName,
  editable,
  onEdit,
  onDelete,
}: {
  q: ExamQuestion;
  conceptName: string;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium">
          {q.question_code} <span className="font-normal text-slate-400">· {conceptName} · {q.max_score} pt</span>
        </p>
        {editable && (
          <div className="flex gap-3 text-sm">
            <button onClick={onEdit} className="text-brand-700 hover:underline">
              Edit
            </button>
            <button onClick={onDelete} className="text-red-700 hover:underline">
              Delete
            </button>
          </div>
        )}
      </div>
      <p className="mt-1 text-slate-700">{q.prompt}</p>
      <ul className="mt-2 space-y-1 text-sm">
        {q.options.map((o) => (
          <li key={o.key} className={o.key === q.answer_key ? "font-medium text-emerald-700" : "text-slate-600"}>
            {o.key === q.answer_key ? "✓" : "·"} {o.key}. {o.text}
            {o.error_type && (
              <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                {CAUSE_LABEL[o.error_type]}
              </span>
            )}
          </li>
        ))}
      </ul>
    </li>
  );
}

function QuestionForm({
  examId,
  concepts,
  initial,
  nextCode,
  onSaved,
  onCancel,
}: {
  examId: string;
  concepts: Concept[];
  initial?: ExamQuestion;
  nextCode?: string;
  onSaved: (exam: ExamDetail) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState(initial?.question_code ?? nextCode ?? "Q1");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [conceptId, setConceptId] = useState(initial?.concept_id ?? concepts[0]?.id ?? "");
  const [maxScore, setMaxScore] = useState(initial?.max_score ?? 1);
  const [answerKey, setAnswerKey] = useState(initial?.answer_key ?? "A");
  const [options, setOptions] = useState<QuestionOption[]>(
    initial?.options ?? KEYS.slice(0, 4).map((key) => ({ key, text: "", error_type: null })),
  );
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: (body: QuestionInput) => (initial ? api.updateQuestion(initial.id, body) : api.addQuestion(examId, body)),
    onSuccess: onSaved,
    onError: (err) => setError(err.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const filled = options.filter((o) => o.text.trim());
    if (filled.length < 2) return setError("Add at least two options.");
    if (!filled.some((o) => o.key === answerKey)) return setError("Mark one of the filled options as correct.");
    submit.mutate({ question_code: code, prompt, options: filled, answer_key: answerKey, max_score: maxScore, concept_id: conceptId });
  }

  const setOption = (i: number, patch: Partial<QuestionOption>) =>
    setOptions((all) => all.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand-600";

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border-2 border-brand-100 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-[6rem_1fr_6rem]">
        <label className="text-xs text-slate-500">
          Code
          <input value={code} onChange={(e) => setCode(e.target.value)} required className={`${input} mt-1 w-full`} />
        </label>
        <label className="text-xs text-slate-500">
          Concept
          <select value={conceptId} onChange={(e) => setConceptId(e.target.value)} required className={`${input} mt-1 w-full`}>
            {concepts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Points
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={maxScore}
            onChange={(e) => setMaxScore(Number(e.target.value))}
            className={`${input} mt-1 w-full`}
          />
        </label>
      </div>
      <label className="block text-xs text-slate-500">
        Question
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} required rows={2} className={`${input} mt-1 w-full`} />
      </label>

      <fieldset>
        <legend className="text-xs text-slate-500">Options: mark the correct one; tag what each wrong one suggests</legend>
        <div className="mt-1 space-y-2">
          {options.map((o, i) => (
            <div key={o.key} className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 text-sm font-medium">
                <input
                  type="radio"
                  name="answer"
                  checked={answerKey === o.key}
                  onChange={() => setAnswerKey(o.key)}
                  className="accent-brand-700"
                />
                {o.key}
              </label>
              <input
                value={o.text}
                onChange={(e) => setOption(i, { text: e.target.value })}
                placeholder={`Option ${o.key}`}
                className={`${input} min-w-0 flex-1`}
              />
              <select
                value={answerKey === o.key ? "" : (o.error_type ?? "")}
                disabled={answerKey === o.key}
                onChange={(e) => setOption(i, { error_type: (e.target.value || null) as ErrorType | null })}
                className={`${input} w-52 disabled:bg-slate-50 disabled:text-slate-400`}
              >
                <option value="">{answerKey === o.key ? "Correct answer" : "No tag (cause unknown)"}</option>
                {ERROR_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CAUSE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        {options.length < KEYS.length && (
          <button
            type="button"
            onClick={() => setOptions((all) => [...all, { key: KEYS[all.length], text: "", error_type: null }])}
            className="mt-2 text-xs text-brand-700 hover:underline"
          >
            + Add option
          </button>
        )}
      </fieldset>

      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submit.isPending}
          className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
        >
          {initial ? "Save question" : "Add question"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
      </div>
    </form>
  );
}
