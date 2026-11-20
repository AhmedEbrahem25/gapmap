import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { api } from "../services/api";
import type { BankItem, BankItemInput, BankOverview, BankUsage, SlideRef } from "../types/api";

const KEYS = ["A", "B", "C", "D", "E", "F"];

/** FR-39, BR-10, BR-11: the instructor reviews and maintains a concept's practice and retest questions. */
export function QuestionBankPage() {
  const { conceptId = "" } = useParams();
  const queryClient = useQueryClient();
  const bank = useQuery({ queryKey: ["bank", conceptId], queryFn: () => api.bank(conceptId) });
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saved = (data: BankOverview) => {
    queryClient.setQueryData(["bank", conceptId], data);
    queryClient.invalidateQueries({ queryKey: ["concepts", data.course_id] });
    setError(null);
  };
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "withdraw" | "delete" }) =>
      action === "approve"
        ? api.approveBankItem(id)
        : action === "withdraw"
          ? api.withdrawBankItem(id)
          : api.deleteBankItem(id),
    onSuccess: saved,
    onError: (err) => setError(err.message),
  });

  if (bank.isPending) return <p className="text-slate-500">Loading question bank…</p>;
  if (bank.isError) return <p className="rounded-lg bg-red-50 p-4 text-red-700">{bank.error.message}</p>;
  const b = bank.data;
  const pending = b.items.filter((i) => i.review_status === "pending");
  const approved = (usage: BankUsage) => b.items.filter((i) => i.review_status === "approved" && i.usage === usage);
  const retestShort = b.retest_questions_per_concept - approved("retest").length;

  const card = (item: BankItem) =>
    editing === item.id ? (
      <li key={item.id}>
        <ItemForm
          overview={b}
          initial={item}
          onSaved={(d) => {
            saved(d);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      </li>
    ) : (
      <ItemCard
        key={item.id}
        item={item}
        busy={act.isPending}
        onEdit={() => setEditing(item.id)}
        onAction={(action) =>
          (action !== "delete" || window.confirm("Delete this question?")) && act.mutate({ id: item.id, action })
        }
      />
    );

  return (
    <div className="max-w-4xl">
      <Link to={`/courses/${b.course_id}/concepts`} className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to concepts
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Question bank: {b.concept_name}</h1>
          <p className="text-slate-600">
            {approved("practice").length} practice · {approved("retest").length} retest
            {pending.length > 0 && ` · ${pending.length} waiting for review`}
          </p>
        </div>
        {editing !== "new" && (
          <button
            onClick={() => setEditing("new")}
            className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800"
          >
            New question
          </button>
        )}
      </div>
      <p className="mt-3 rounded-md bg-brand-50 px-3 py-2 text-sm text-slate-700">
        Students only see approved questions. Practice questions come with instant feedback; retest questions are
        kept for the retest, so practice can't give the answers away. Questions you write are approved when saved.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {editing === "new" && (
        <div className="mt-4">
          <ItemForm
            overview={b}
            onSaved={(d) => {
              saved(d);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {pending.length > 0 && (
        <Section title="Waiting for review" note="Not shown to students until you approve them.">
          {pending.map(card)}
        </Section>
      )}
      <Section title="Practice" note="Served on the practice screen, with the answer and its slide.">
        {approved("practice").map(card)}
      </Section>
      <Section
        title="Retest"
        note={`Each retest uses ${b.retest_questions_per_concept} questions per weak concept.`}
        warning={
          retestShort > 0
            ? `Only ${approved("retest").length} approved: add ${retestShort} more so the retest has enough.`
            : undefined
        }
      >
        {approved("retest").map(card)}
      </Section>
    </div>
  );
}

function Section({
  title,
  note,
  warning,
  children,
}: {
  title: string;
  note: string;
  warning?: string;
  children: React.ReactNode;
}) {
  const empty = Array.isArray(children) && children.length === 0;
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-slate-500">{note}</p>
      {warning && <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{warning}</p>}
      {empty ? <p className="mt-3 text-sm text-slate-500">None yet.</p> : <ol className="mt-3 space-y-3">{children}</ol>}
    </section>
  );
}

function ItemCard({
  item,
  busy,
  onEdit,
  onAction,
}: {
  item: BankItem;
  busy: boolean;
  onEdit: () => void;
  onAction: (action: "approve" | "withdraw" | "delete") => void;
}) {
  const frozen = item.used_in_retests > 0;
  const link = "text-brand-700 hover:underline disabled:opacity-60";
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{item.usage}</span>
          {item.origin === "ai" && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-800">AI draft</span>}
          {frozen && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
              used in {item.used_in_retests} retest{item.used_in_retests === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div className="flex gap-3 text-sm">
          {item.review_status === "pending" ? (
            <button onClick={() => onAction("approve")} disabled={busy} className="font-medium text-emerald-700 hover:underline">
              Approve
            </button>
          ) : (
            <button onClick={() => onAction("withdraw")} disabled={busy} className={link}>
              Withdraw
            </button>
          )}
          {!frozen && (
            <>
              <button onClick={onEdit} className={link}>
                Edit
              </button>
              <button onClick={() => onAction("delete")} disabled={busy} className="text-red-700 hover:underline">
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      <p className="mt-2 text-slate-800">{item.prompt}</p>
      <ul className="mt-2 space-y-1 text-sm">
        {item.options.map((o) => (
          <li key={o.key} className={o.key === item.answer_key ? "font-medium text-emerald-700" : "text-slate-600"}>
            {o.key === item.answer_key ? "✓" : "·"} {o.key}. {o.text}
          </li>
        ))}
      </ul>
      {item.source ? (
        <Link
          to={`/materials/${item.source.material_id}/pages/${item.source.page_number}`}
          className="mt-2 inline-block text-xs text-brand-700 hover:underline"
        >
          Explained on: {item.source.title ?? `Page ${item.source.page_number}`} · page {item.source.page_number}
        </Link>
      ) : (
        <p className="mt-2 text-xs text-slate-500">No source slide: practice feedback won't link to one.</p>
      )}
    </li>
  );
}

function ItemForm({
  overview,
  initial,
  onSaved,
  onCancel,
}: {
  overview: BankOverview;
  initial?: BankItem;
  onSaved: (data: BankOverview) => void;
  onCancel: () => void;
}) {
  const [usage, setUsage] = useState<BankUsage>(initial?.usage ?? "practice");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [answerKey, setAnswerKey] = useState(initial?.answer_key ?? "A");
  const [options, setOptions] = useState(initial?.options ?? KEYS.slice(0, 4).map((key) => ({ key, text: "" })));
  const [sourceId, setSourceId] = useState(initial?.source?.slide_chunk_id ?? overview.slides[0]?.slide_chunk_id ?? "");
  const [error, setError] = useState<string | null>(null);

  // The current source may not be one of the concept's approved slides any more; keep it selectable.
  const slides: SlideRef[] =
    initial?.source && !overview.slides.some((s) => s.slide_chunk_id === initial.source!.slide_chunk_id)
      ? [...overview.slides, initial.source]
      : overview.slides;

  const submit = useMutation({
    mutationFn: (body: BankItemInput) =>
      initial ? api.updateBankItem(initial.id, body) : api.addBankItem(overview.concept_id, body),
    onSuccess: onSaved,
    onError: (err) => setError(err.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const filled = options.filter((o) => o.text.trim());
    if (filled.length < 2) return setError("Add at least two options.");
    if (!filled.some((o) => o.key === answerKey)) return setError("Mark one of the filled options as correct.");
    submit.mutate({ usage, prompt, options: filled, answer_key: answerKey, source_chunk_id: sourceId || null });
  }

  const setText = (i: number, text: string) => setOptions((all) => all.map((o, j) => (j === i ? { ...o, text } : o)));
  const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand-600";

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border-2 border-brand-100 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <label className="text-xs text-slate-500">
          Used for
          <select value={usage} onChange={(e) => setUsage(e.target.value as BankUsage)} className={`${input} mt-1 w-full`}>
            <option value="practice">Practice</option>
            <option value="retest">Retest</option>
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Slide that explains the answer
          <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={`${input} mt-1 w-full`}>
            <option value="">No slide</option>
            {slides.map((s) => (
              <option key={s.slide_chunk_id} value={s.slide_chunk_id}>
                {s.title ?? `Page ${s.page_number}`} (page {s.page_number})
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-xs text-slate-500">
        Question (must differ from the exam's questions)
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} required rows={2} className={`${input} mt-1 w-full`} />
      </label>
      <fieldset>
        <legend className="text-xs text-slate-500">Options: mark the correct one</legend>
        <div className="mt-1 space-y-2">
          {options.map((o, i) => (
            <div key={o.key} className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-sm font-medium">
                <input
                  type="radio"
                  name="bank-answer"
                  checked={answerKey === o.key}
                  onChange={() => setAnswerKey(o.key)}
                  className="accent-brand-700"
                />
                {o.key}
              </label>
              <input
                value={o.text}
                onChange={(e) => setText(i, e.target.value)}
                placeholder={`Option ${o.key}`}
                className={`${input} min-w-0 flex-1`}
              />
            </div>
          ))}
        </div>
        {options.length < KEYS.length && (
          <button
            type="button"
            onClick={() => setOptions((all) => [...all, { key: KEYS[all.length], text: "" }])}
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
