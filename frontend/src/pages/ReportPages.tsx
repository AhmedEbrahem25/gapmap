import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ReportView } from "../features/reports/ReportView";
import { api } from "../services/api";

/** Student: their own report for one exam. */
export function MyReportPage() {
  const { examId = "" } = useParams();
  const report = useQuery({ queryKey: ["my-report", examId], queryFn: () => api.myReport(examId) });

  if (report.isPending) return <p className="text-slate-500">Loading report…</p>;
  if (report.isError) return <p className="rounded-lg bg-red-50 p-4 text-red-700">{report.error.message}</p>;
  return (
    <>
      <BackToCourse courseId={report.data.course_id} />
      <ReportView report={report.data} />
    </>
  );
}

/** Instructor: one student's report. */
export function StudentReportPage() {
  const { examId = "", studentId = "" } = useParams();
  const report = useQuery({
    queryKey: ["student-report", examId, studentId],
    queryFn: () => api.studentReport(examId, studentId),
  });

  if (report.isPending) return <p className="text-slate-500">Loading report…</p>;
  if (report.isError) return <p className="rounded-lg bg-red-50 p-4 text-red-700">{report.error.message}</p>;
  return (
    <>
      <Link to={`/exams/${examId}/results`} className="mb-3 inline-block text-sm text-slate-500 hover:text-slate-800">
        ← All students
      </Link>
      <ReportView report={report.data} />
    </>
  );
}

/** Instructor: every student's score and weak concepts. */
export function ExamResultsPage() {
  const { examId = "" } = useParams();
  const navigate = useNavigate();
  const rows = useQuery({ queryKey: ["results", examId], queryFn: () => api.examResults(examId) });

  if (rows.isPending) return <p className="text-slate-500">Loading results…</p>;
  if (rows.isError) return <p className="rounded-lg bg-red-50 p-4 text-red-700">{rows.error.message}</p>;
  if (rows.data.length === 0) return <p className="text-slate-500">Run the analysis to see results.</p>;

  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-3 text-sm text-slate-500 hover:text-slate-800">
        ← Back
      </button>
      <h1 className="text-2xl font-semibold tracking-tight">Student results</h1>
      <p className="mt-1 text-slate-600">{rows.data.length} students. Open a row to see the full report.</p>
      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Student</th>
              <th className="px-4 py-2">Score</th>
              <th className="px-4 py-2">Needs review</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.data.map((r) => (
              <tr key={r.student_id} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link to={`/exams/${examId}/students/${r.student_id}`} className="font-medium text-brand-700 hover:underline">
                    {r.student_ref}
                  </Link>
                  <span className="text-slate-500"> · {r.student_name}</span>
                </td>
                <td className="px-4 py-2">
                  {r.earned} / {r.max}
                </td>
                <td className="px-4 py-2">
                  {r.weak_concepts.length ? (
                    <div className="flex flex-wrap gap-1">
                      {r.weak_concepts.map((c) => (
                        <span key={c} className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-800">
                          {c}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BackToCourse({ courseId }: { courseId: string }) {
  return (
    <Link to={`/courses/${courseId}`} className="mb-3 inline-block text-sm text-slate-500 hover:text-slate-800">
      ← Back to course
    </Link>
  );
}
