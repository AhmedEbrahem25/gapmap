import { Link } from "react-router-dom";

import type { ConceptReport, ConceptStatus, QuestionResult, StudentReport } from "../../types/api";

const STATUS: Record<ConceptStatus, { label: string; badge: string; bar: string }> = {
  weak: { label: "Needs review", badge: "bg-red-100 text-red-800", bar: "bg-red-500" },
  ok: { label: "On track", badge: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-500" },
  not_enough_data: { label: "Not enough data", badge: "bg-slate-200 text-slate-700", bar: "bg-slate-400" },
};

export const CAUSE_LABEL: Record<string, string> = {
  conceptual: "Conceptual misunderstanding",
  formula_application: "Formula / application",
  calculation: "Calculation",
  missing_prerequisite: "Missing prerequisite",
  incomplete_answer: "Incomplete answer",
  unknown: "Cause unknown",
};

export function ReportView({ report }: { report: StudentReport }) {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{report.course_title}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{report.exam_title}</h1>
          <p className="text-slate-600">
            {report.student_name}
            {report.student_ref && <span className="text-slate-400"> · {report.student_ref}</span>}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold">
            {report.earned}
            <span className="text-lg text-slate-400"> / {report.max}</span>
          </p>
          <p className="text-xs text-slate-500">exam score</p>
        </div>
      </div>

      <p className="mt-4 rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-800">
        A concept needs review when its score is below {report.weak_threshold_percent}% across at least 2
        questions. Causes below are likely explanations, not final judgements.
      </p>

      <h2 className="mt-8 text-lg font-semibold">By concept</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-3">
        {report.concepts.map((c) => (
          <ConceptCard key={c.concept_id} concept={c} />
        ))}
      </div>

      <h2 className="mt-10 text-lg font-semibold">By question</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Question</th>
              <th className="px-4 py-2">Your answer</th>
              <th className="px-4 py-2">Correct answer</th>
              <th className="px-4 py-2">Likely cause</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {report.questions.map((q) => (
              <QuestionRow key={q.question_code} q={q} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConceptCard({ concept: c }: { concept: ConceptReport }) {
  const style = STATUS[c.status];
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{c.name}</h3>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}>{style.label}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold">{c.percent}%</p>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${style.bar}`} style={{ width: `${c.percent}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {c.earned} of {c.max} points · {c.question_count} question{c.question_count === 1 ? "" : "s"}
      </p>

      {c.status === "weak" && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Review these slides</p>
          {c.slides.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No suitable source was found in the course materials.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {c.slides.map((s) => (
                <li key={`${s.material_id}-${s.page_number}`}>
                  <Link
                    to={`/materials/${s.material_id}/pages/${s.page_number}`}
                    className="block rounded-md border border-slate-200 p-2 hover:border-brand-600"
                  >
                    <p className="text-sm font-medium text-brand-700">{s.title ?? `Page ${s.page_number}`}</p>
                    <p className="text-xs text-slate-500">
                      {s.filename} · page {s.page_number}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600">{s.excerpt}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function QuestionRow({ q }: { q: QuestionResult }) {
  const correct = q.score === q.max_score;
  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <p className="font-medium">
          {q.question_code} <span className="font-normal text-slate-400">· {q.concept_names.join(", ")}</span>
        </p>
        <p className="mt-0.5 text-slate-600">{q.prompt}</p>
      </td>
      <td className="px-4 py-3">
        <span className={correct ? "text-emerald-700" : "text-red-700"}>
          {correct ? "✓" : "✗"} {q.your_answer ?? "—"}
        </span>
        {q.your_answer_text && <p className="text-slate-500">{q.your_answer_text}</p>}
      </td>
      <td className="px-4 py-3">
        {correct ? (
          <span className="text-slate-400">—</span>
        ) : (
          <>
            {q.correct_answer}
            {q.correct_answer_text && <p className="text-slate-500">{q.correct_answer_text}</p>}
          </>
        )}
      </td>
      <td className="px-4 py-3">
        {q.likely_cause ? (
          <>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
              {CAUSE_LABEL[q.likely_cause] ?? q.likely_cause}
            </span>
            {q.evidence && <p className="mt-1 text-xs text-slate-500">{q.evidence}</p>}
          </>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
    </tr>
  );
}
