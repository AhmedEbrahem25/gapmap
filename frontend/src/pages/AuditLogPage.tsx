import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { api } from "../services/api";

const ACTION_LABEL: Record<string, string> = {
  "course.created": "Created the course",
  "course.students_enrolled": "Enrolled students",
  "course.student_removed": "Removed a student",
  "material.uploaded": "Uploaded a lecture file",
  "exam.created": "Created an exam",
  "question.added": "Added a question",
  "question.updated": "Edited a question",
  "question.deleted": "Deleted a question",
  "exam.key_approved": "Approved the answer key",
  "exam.reopened": "Reopened an exam for editing",
  "import.uploaded": "Uploaded results",
  "import.row_corrected": "Corrected a results row",
  "import.row_deleted": "Deleted a results row",
  "import.approved": "Approved results",
  "import.rejected": "Rejected results",
  "exam.analyzed": "Ran the analysis",
  "concept.created": "Added a concept",
  "concept.updated": "Edited a concept",
  "concept.deleted": "Deleted a concept",
  "concept.slide_approved": "Approved a slide for a concept",
  "concept.slide_removed": "Removed a slide from a concept",
  "bank.added": "Added a practice or retest question",
  "bank.updated": "Edited a practice or retest question",
  "bank.approved": "Approved a practice or retest question",
  "bank.withdrawn": "Withdrew a practice or retest question",
  "bank.deleted": "Deleted a practice or retest question",
};

export function AuditLogPage() {
  const { courseId = "" } = useParams();
  const log = useQuery({ queryKey: ["audit", courseId], queryFn: () => api.auditLog(courseId) });

  return (
    <div>
      <Link to={`/courses/${courseId}`} className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to course
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Audit log</h1>
      <p className="text-slate-600">Approvals and important edits in this course, newest first.</p>

      {log.isPending && <p className="mt-6 text-slate-500">Loading…</p>}
      {log.isError && <p className="mt-6 rounded-lg bg-red-50 p-4 text-red-700">{log.error.message}</p>}
      {log.data && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Who</th>
                <th className="px-4 py-2">What</th>
                <th className="px-4 py-2">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {log.data.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    Nothing recorded yet.
                  </td>
                </tr>
              )}
              {log.data.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-2 text-slate-600">{new Date(e.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-2">{e.actor_name ?? "System"}</td>
                  <td className="px-4 py-2">{ACTION_LABEL[e.action] ?? e.action}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">
                    {e.details ? JSON.stringify(e.details) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
