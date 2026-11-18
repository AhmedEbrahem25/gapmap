import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api } from "../../services/api";
import type { Exam, ExamStatus } from "../../types/api";

const STATUS_LABEL: Record<ExamStatus, string> = {
  draft: "Draft",
  key_approved: "Answer key approved",
  analyzed: "Analysed",
};

/** Instructors run analysis and open results; students open their own report. */
export function ExamsSection({ courseId, isInstructor }: { courseId: string; isInstructor: boolean }) {
  const exams = useQuery({ queryKey: ["exams", courseId], queryFn: () => api.exams(courseId) });

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{isInstructor ? "Exams" : "My exam results"}</h2>
        {isInstructor && <NewExam courseId={courseId} />}
      </div>
      <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {exams.isPending && <li className="p-4 text-sm text-slate-500">Loading…</li>}
        {exams.data?.length === 0 && <li className="p-4 text-sm text-slate-500">No exams yet.</li>}
        {exams.data?.map((exam) =>
          isInstructor ? <InstructorExamRow key={exam.id} exam={exam} /> : <StudentExamRow key={exam.id} exam={exam} />,
        )}
      </ul>
    </section>
  );
}

function InstructorExamRow({ exam }: { exam: Exam }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const analyze = useMutation({
    mutationFn: () => api.analyze(exam.id),
    onMutate: () => setMessage(null),
    onSuccess: (s) => {
      setMessage({
        ok: true,
        text:
          `Analysed ${s.students} students (${s.answers} answers).` +
          (s.score_mismatches === 1
            ? " 1 official score differs from the answer key."
            : s.score_mismatches
              ? ` ${s.score_mismatches} official scores differ from the answer key.`
              : ""),
      });
      queryClient.invalidateQueries({ queryKey: ["exams", exam.course_id] });
      queryClient.invalidateQueries({ queryKey: ["results", exam.id] });
    },
    onError: (err) => setMessage({ ok: false, text: err.message }),
  });

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{exam.title}</p>
          <p className="text-xs text-slate-500">
            {exam.question_count} questions · {STATUS_LABEL[exam.status]}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link to={`/exams/${exam.id}/edit`} className="text-sm text-brand-700 hover:underline">
            {exam.status === "draft" ? "Edit questions" : "Questions"}
          </Link>
          {exam.status !== "draft" && (
            <Link to={`/exams/${exam.id}/import`} className="text-sm text-brand-700 hover:underline">
              Import results
            </Link>
          )}
          {exam.status === "analyzed" && (
            <Link to={`/exams/${exam.id}/results`} className="text-sm font-medium text-brand-700 hover:underline">
              View results
            </Link>
          )}
          {exam.status !== "draft" && (
            <button
              onClick={() => analyze.mutate()}
              disabled={analyze.isPending}
              className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
            >
              {analyze.isPending ? "Analysing…" : exam.status === "analyzed" ? "Re-run analysis" : "Run analysis"}
            </button>
          )}
        </div>
      </div>
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`mt-3 rounded-md px-3 py-2 text-sm ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}
        >
          {message.text}
        </p>
      )}
    </li>
  );
}

function NewExam({ courseId }: { courseId: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const create = useMutation({
    mutationFn: () => api.createExam(courseId, title),
    onSuccess: (exam) => navigate(`/exams/${exam.id}/edit`),
  });

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="text-sm font-medium text-brand-700 hover:underline">
        + New exam
      </button>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
      className="flex items-center gap-2"
    >
      <input
        autoFocus
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Exam title"
        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
      />
      <button type="submit" disabled={create.isPending} className="rounded-md bg-brand-700 px-3 py-1 text-sm text-white">
        Create
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500">
        Cancel
      </button>
      {create.isError && <span className="text-sm text-red-700">{create.error.message}</span>}
    </form>
  );
}

function StudentExamRow({ exam }: { exam: Exam }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-4">
      <p className="font-medium">{exam.title}</p>
      {exam.status === "analyzed" ? (
        <Link to={`/exams/${exam.id}/report`} className="text-sm font-medium text-brand-700 hover:underline">
          Open my report
        </Link>
      ) : (
        <span className="text-sm text-slate-500">Report not ready yet</span>
      )}
    </li>
  );
}
