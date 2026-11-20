import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { api } from "../services/api";
import type { EnrollResult } from "../types/api";

/** FR-05: the instructor enrols student accounts in a course by their reference. */
export function StudentsPage() {
  const { courseId = "" } = useParams();
  const queryClient = useQueryClient();
  const course = useQuery({ queryKey: ["course", courseId], queryFn: () => api.course(courseId) });
  const students = useQuery({ queryKey: ["students", courseId], queryFn: () => api.students(courseId) });
  const [refs, setRefs] = useState("");
  const [result, setResult] = useState<EnrollResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["students", courseId] });
    queryClient.invalidateQueries({ queryKey: ["course", courseId] });
  };
  const enroll = useMutation({
    // References can be pasted from a spreadsheet column or typed with commas or spaces.
    mutationFn: () => api.enroll(courseId, refs.split(/[\s,;]+/).filter(Boolean)),
    onSuccess: (data) => {
      setResult(data);
      setError(null);
      setRefs(data.unknown.join("\n"));
      refresh();
    },
    onError: (err) => setError(err.message),
  });
  const remove = useMutation({
    mutationFn: (studentId: string) => api.unenroll(courseId, studentId),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (err) => setError(err.message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    enroll.mutate();
  };

  return (
    <div className="max-w-4xl">
      <Link to={`/courses/${courseId}`} className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to course
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Students</h1>
      <p className="text-slate-600">{course.data?.title}</p>

      <form onSubmit={submit} className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <label htmlFor="refs" className="block text-sm font-medium">
          Add students by reference
        </label>
        <p className="text-xs text-slate-500">
          Paste references from a spreadsheet, one per line or separated by commas. Students need an account first.
        </p>
        <textarea
          id="refs"
          value={refs}
          onChange={(e) => setRefs(e.target.value)}
          rows={4}
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:border-brand-600 focus:outline-none"
          placeholder={"STU001\nSTU002"}
        />
        <button
          type="submit"
          disabled={enroll.isPending || !refs.trim()}
          className="mt-3 rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
        >
          Enrol
        </button>
        {result && (
          <div className="mt-3 space-y-1 text-sm" role="status">
            {result.enrolled.length > 0 && <p className="text-emerald-700">Enrolled: {result.enrolled.join(", ")}</p>}
            {result.already_enrolled.length > 0 && (
              <p className="text-slate-600">Already enrolled: {result.already_enrolled.join(", ")}</p>
            )}
            {result.unknown.length > 0 && (
              <p className="text-amber-800">
                No student account for: {result.unknown.join(", ")}. Check the references, or ask an administrator to
                create the accounts.
              </p>
            )}
          </div>
        )}
      </form>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {students.isPending && <p className="mt-6 text-slate-500">Loading students…</p>}
      {students.isError && <p className="mt-6 rounded-lg bg-red-50 p-4 text-red-700">{students.error.message}</p>}
      {students.data && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Reference</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {students.data.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    No students yet.
                  </td>
                </tr>
              )}
              {students.data.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 font-mono">{s.student_ref}</td>
                  <td className="px-4 py-2">{s.name}</td>
                  <td className="px-4 py-2 text-slate-600">{s.email}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => window.confirm(`Remove ${s.student_ref ?? s.name} from the course?`) && remove.mutate(s.id)}
                      disabled={remove.isPending}
                      className="text-sm text-slate-600 hover:text-red-700"
                    >
                      Remove
                    </button>
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
