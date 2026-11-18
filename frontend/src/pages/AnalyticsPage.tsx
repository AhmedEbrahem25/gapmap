import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ConceptErrorChart } from "../features/analytics/ConceptErrorChart";
import { CAUSE_LABEL } from "../features/reports/ReportView";
import { api } from "../services/api";

export function AnalyticsPage() {
  const { courseId = "" } = useParams();
  const [examId, setExamId] = useState<string>();
  const data = useQuery({
    queryKey: ["analytics", courseId, examId],
    queryFn: () => api.analytics(courseId, examId),
  });

  if (data.isPending) return <p className="text-slate-500">Loading analytics…</p>;
  if (data.isError) return <p className="rounded-lg bg-red-50 p-4 text-red-700">{data.error.message}</p>;
  const a = data.data;

  return (
    <div>
      <Link to={`/courses/${courseId}`} className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to course
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Class analytics</h1>
          {a.exam && (
            <p className="text-slate-600">
              {a.exam.title} · {a.student_count} students · approved results only
            </p>
          )}
        </div>
        {a.exams.length > 1 && (
          <label className="text-sm text-slate-600">
            Exam{" "}
            <select
              value={examId ?? a.exam?.id ?? ""}
              onChange={(e) => setExamId(e.target.value)}
              className="ml-1 rounded-md border border-slate-300 bg-white px-2 py-1"
            >
              {a.exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!a.exam ? (
        <p className="mt-8 rounded-lg border border-slate-200 bg-white p-6 text-slate-600">
          No approved results yet. Import and approve exam results to see class analytics.
        </p>
      ) : (
        <>
          <section className="mt-6">
            <h2 className="text-lg font-semibold">Suggested for re-teaching</h2>
            {a.reteach.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">
                No concept reaches {a.reteach_threshold_percent}% wrong answers.
              </p>
            ) : (
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                {a.reteach.map((r) => (
                  <div key={r.concept_id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="flex items-center gap-2 font-semibold text-amber-900">
                      <span aria-hidden>⚑</span> {r.name}
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {r.evidence.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="mt-8">
            <ConceptErrorChart
              concepts={a.concepts}
              reteachThreshold={a.reteach_threshold_percent}
              reteachIds={new Set(a.reteach.map((r) => r.concept_id))}
            />
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-semibold">By question</h2>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Question</th>
                    <th className="px-4 py-2 text-right">Wrong</th>
                    <th className="px-4 py-2">Most common wrong answer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {a.questions.map((q) => (
                    <tr key={q.question_code} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium">
                          {q.question_code} <span className="font-normal text-slate-400">· {q.concept_names.join(", ")}</span>
                        </p>
                        <p className="mt-0.5 text-slate-600">{q.prompt}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        <span className="font-semibold">{q.error_rate}%</span>
                        <p className="text-xs text-slate-500">
                          {q.incorrect} of {q.responses}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {q.top_wrong ? (
                          <>
                            <p>
                              {q.top_wrong.key}. {q.top_wrong.text}{" "}
                              <span className="text-slate-500">({q.top_wrong.count} students)</span>
                            </p>
                            {q.top_wrong.error_type && (
                              <span className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                                {CAUSE_LABEL[q.top_wrong.error_type] ?? q.top_wrong.error_type}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
