import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api } from "../services/api";
import type { ImportDetail, ImportRow, ImportRowPatch } from "../types/api";

type Filter = "all" | "invalid" | "warnings";

const BATCH_STATUS: Record<ImportDetail["status"], { label: string; tone: string }> = {
  pending_review: { label: "Pending review", tone: "bg-amber-100 text-amber-900" },
  approved: { label: "Approved", tone: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "Rejected", tone: "bg-slate-200 text-slate-700" },
};

export function ImportPage() {
  const { examId = "" } = useParams();
  const queryClient = useQueryClient();
  const exam = useQuery({ queryKey: ["exam", examId], queryFn: () => api.exam(examId) });
  const imports = useQuery({ queryKey: ["imports", examId], queryFn: () => api.imports(examId) });
  const [selected, setSelected] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const currentId = selected ?? imports.data?.[0]?.id ?? null;
  const upload = useMutation({
    mutationFn: (file: File) => api.uploadResults(examId, file),
    onMutate: () => setUploadError(null),
    onSuccess: (batch) => {
      queryClient.setQueryData(["import", batch.id], batch);
      queryClient.invalidateQueries({ queryKey: ["imports", examId] });
      setSelected(batch.id);
    },
    onError: (err) => setUploadError(err.message),
    onSettled: () => {
      if (input.current) input.current.value = "";
    },
  });

  if (exam.isPending) return <p className="text-slate-500">Loading…</p>;
  if (exam.isError) return <p className="rounded-lg bg-red-50 p-4 text-red-700">{exam.error.message}</p>;
  const e = exam.data;

  function downloadTemplate() {
    const lines = ["student_ref,question_id,answer,score", ...e.questions.map((q) => `STU001,${q.question_code},,`)];
    const url = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${e.title} results template.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <Link to={`/courses/${e.course_id}`} className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to course
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Import results: {e.title}</h1>
      <p className="text-slate-600">
        One row per student and question: <code className="text-sm">student_ref, question_id, answer, score</code> (score
        optional). Nothing becomes official until you approve it.
      </p>

      {e.status === "draft" ? (
        <p className="mt-6 rounded-lg bg-amber-50 p-4 text-amber-900">
          Approve the answer key first.{" "}
          <Link to={`/exams/${e.id}/edit`} className="underline">
            Open the exam
          </Link>
        </p>
      ) : (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">
            {upload.isPending ? "Checking file…" : "Upload CSV or Excel"}
            <input
              ref={input}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={upload.isPending}
              onChange={(ev) => ev.target.files?.[0] && upload.mutate(ev.target.files[0])}
            />
          </label>
          <button onClick={downloadTemplate} className="text-sm text-brand-700 hover:underline">
            Download template
          </button>
        </div>
      )}
      {uploadError && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {uploadError}
        </p>
      )}

      {imports.data && imports.data.length > 1 && (
        <div className="mt-6 flex flex-wrap gap-2 text-sm">
          {imports.data.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelected(b.id)}
              className={`rounded-full border px-3 py-1 ${b.id === currentId ? "border-brand-600 bg-brand-50" : "border-slate-300 bg-white"}`}
            >
              {b.original_filename} · {BATCH_STATUS[b.status].label}
            </button>
          ))}
        </div>
      )}

      {currentId && <BatchReview key={currentId} importId={currentId} examId={examId} courseId={e.course_id} />}
    </div>
  );
}

function BatchReview({ importId, examId, courseId }: { importId: string; examId: string; courseId: string }) {
  const queryClient = useQueryClient();
  const batch = useQuery({ queryKey: ["import", importId], queryFn: () => api.importDetail(importId) });
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);

  const update = (data: ImportDetail) => {
    queryClient.setQueryData(["import", importId], data);
    queryClient.invalidateQueries({ queryKey: ["imports", examId] });
    setError(null);
  };
  const decide = useMutation({
    mutationFn: (action: "approve" | "reject") =>
      action === "approve" ? api.approveImport(importId) : api.rejectImport(importId),
    onSuccess: (data) => {
      update(data);
      queryClient.invalidateQueries({ queryKey: ["exams", courseId] });
    },
    onError: (err) => setError(err.message),
  });

  if (batch.isPending) return <p className="mt-6 text-slate-500">Loading import…</p>;
  if (batch.isError) return <p className="mt-6 text-red-700">{batch.error.message}</p>;
  const b = batch.data;
  const pending = b.status === "pending_review";
  const rows = b.rows.filter((r) =>
    filter === "invalid" ? r.errors.length > 0 : filter === "warnings" ? r.warnings.length > 0 && !r.errors.length : true,
  );

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BATCH_STATUS[b.status].tone}`}>
            {BATCH_STATUS[b.status].label}
          </span>
          <span className="font-medium">{b.original_filename}</span>
          <span className="text-slate-600">
            {b.total_rows} rows · {b.students} students
          </span>
          <span className={b.invalid_rows ? "font-medium text-red-700" : "text-emerald-700"}>
            {b.invalid_rows ? `${b.invalid_rows} to fix` : "No errors"}
          </span>
          {b.warning_rows > 0 && <span className="text-amber-800">{b.warning_rows} with warnings</span>}
        </div>
        {pending && (
          <div className="flex gap-2">
            <button
              onClick={() => window.confirm("Reject this import? Its rows will not be used.") && decide.mutate("reject")}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:border-red-400"
            >
              Reject
            </button>
            <button
              onClick={() => decide.mutate("approve")}
              disabled={b.invalid_rows > 0 || decide.isPending}
              title={b.invalid_rows ? "Fix or delete the invalid rows first" : undefined}
              className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
            >
              Approve results
            </button>
          </div>
        )}
      </div>

      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {b.status === "approved" && (
        <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Results approved.{" "}
          <Link to={`/courses/${courseId}`} className="font-medium underline">
            Run the analysis from the course page
          </Link>{" "}
          to update student reports.
        </p>
      )}

      <div className="mt-4 flex gap-1 text-sm">
        {(["all", "invalid", "warnings"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1 ${filter === f ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {f === "all" ? `All (${b.total_rows})` : f === "invalid" ? `To fix (${b.invalid_rows})` : `Warnings (${b.warning_rows})`}
          </button>
        ))}
      </div>

      <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Line</th>
              <th className="px-3 py-2">Student</th>
              <th className="px-3 py-2">Question</th>
              <th className="px-3 py-2">Answer</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Check</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <Row key={r.id} row={r} importId={importId} editable={pending} onChange={update} onError={setError} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  Nothing here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({
  row: r,
  importId,
  editable,
  onChange,
  onError,
}: {
  row: ImportRow;
  importId: string;
  editable: boolean;
  onChange: (d: ImportDetail) => void;
  onError: (m: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    student_ref: r.student_ref ?? "",
    question_code: r.question_code ?? "",
    answer: r.answer ?? "",
    score: r.score === null ? "" : String(r.score),
  });
  const save = useMutation({
    mutationFn: () => {
      const patch: ImportRowPatch = { student_ref: draft.student_ref, question_code: draft.question_code, answer: draft.answer };
      if (draft.score.trim() === "") patch.clear_score = true;
      else patch.score = Number(draft.score);
      return api.correctRow(importId, r.id, patch);
    },
    onSuccess: (d) => {
      onChange(d);
      setEditing(false);
    },
    onError: (err) => onError(err.message),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteRow(importId, r.id),
    onSuccess: onChange,
    onError: (err) => onError(err.message),
  });

  const cell = "w-24 rounded border border-slate-300 px-1.5 py-1 text-sm";
  const tone = r.errors.length ? "bg-red-50/60" : r.warnings.length ? "bg-amber-50/50" : "";

  return (
    <tr className={`align-top ${tone}`}>
      <td className="px-3 py-2 text-slate-500 tabular-nums">{r.row_number}</td>
      {editing ? (
        <>
          <td className="px-3 py-2">
            <input className={cell} value={draft.student_ref} onChange={(e) => setDraft({ ...draft, student_ref: e.target.value })} />
          </td>
          <td className="px-3 py-2">
            <input className={cell} value={draft.question_code} onChange={(e) => setDraft({ ...draft, question_code: e.target.value })} />
          </td>
          <td className="px-3 py-2">
            <input className={`${cell} w-16`} value={draft.answer} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} />
          </td>
          <td className="px-3 py-2">
            <input className={`${cell} w-16`} value={draft.score} onChange={(e) => setDraft({ ...draft, score: e.target.value })} />
          </td>
        </>
      ) : (
        <>
          <td className="px-3 py-2">{r.student_ref || <Empty />}</td>
          <td className="px-3 py-2">{r.question_code || <Empty />}</td>
          <td className="px-3 py-2">{r.answer || <Empty />}</td>
          <td className="px-3 py-2 tabular-nums">{r.score ?? <Empty />}</td>
        </>
      )}
      <td className="px-3 py-2">
        {r.errors.map((m) => (
          <p key={m} className="text-red-700">
            ✗ {m}
          </p>
        ))}
        {r.warnings.map((m) => (
          <p key={m} className="text-amber-800">
            ! {m}
          </p>
        ))}
        {!r.errors.length && !r.warnings.length && (
          <span className="text-emerald-700">✓ {r.status === "corrected" ? "Corrected" : "OK"}</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        {editable &&
          (editing ? (
            <>
              <button onClick={() => save.mutate()} disabled={save.isPending} className="text-sm font-medium text-brand-700 hover:underline">
                Save
              </button>
              <button onClick={() => setEditing(false)} className="ml-3 text-sm text-slate-500 hover:underline">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="text-sm text-brand-700 hover:underline">
                Edit
              </button>
              <button
                onClick={() => window.confirm(`Delete line ${r.row_number}?`) && remove.mutate()}
                className="ml-3 text-sm text-red-700 hover:underline"
              >
                Delete
              </button>
            </>
          ))}
      </td>
    </tr>
  );
}

function Empty() {
  return <span className="text-slate-400">(empty)</span>;
}
