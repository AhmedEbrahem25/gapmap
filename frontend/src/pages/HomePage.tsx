import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../features/auth/AuthContext";
import { api } from "../services/api";
import type { Role } from "../types/api";

const SUBTITLE: Record<Role, string> = {
  instructor: "Your courses. Open one to manage materials, exams and results.",
  student: "Your courses. Open one to see your report and recovery plan.",
  coordinator: "Courses you can view aggregated analytics for.",
  admin: "All courses in the system.",
};

export function HomePage() {
  const { user } = useAuth();
  const courses = useQuery({ queryKey: ["courses"], queryFn: api.courses });
  const [creating, setCreating] = useState(false);
  const canCreate = user?.role === "instructor" || user?.role === "admin";

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user?.name}</h1>
          {user && <p className="mt-1 text-slate-600">{SUBTITLE[user.role]}</p>}
        </div>
        {canCreate && !creating && (
          <button
            onClick={() => setCreating(true)}
            className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800"
          >
            New course
          </button>
        )}
      </div>
      {creating && <NewCourseForm onCancel={() => setCreating(false)} />}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courses.isPending && <p className="text-slate-500">Loading courses…</p>}
        {courses.isError && <p className="text-red-700">{courses.error.message}</p>}
        {courses.data?.length === 0 && <p className="text-slate-500">No courses yet.</p>}
        {courses.data?.map((c) => (
          <Link
            key={c.id}
            to={`/courses/${c.id}`}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-600 hover:shadow"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-brand-600">
              {[c.code, c.term].filter(Boolean).join(" · ")}
            </p>
            <h2 className="mt-1 text-lg font-semibold">{c.title}</h2>
            <p className="mt-3 text-sm text-slate-600">{c.instructor_name}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function NewCourseForm({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [term, setTerm] = useState("");
  const create = useMutation({
    mutationFn: () => api.createCourse({ title, code: code.trim() || null, term: term.trim() || null }),
    onSuccess: (course) => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      navigate(`/courses/${course.id}`);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  const input = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal focus:border-brand-600 focus:outline-none";

  return (
    <form onSubmit={submit} className="mt-6 max-w-2xl rounded-lg border border-brand-600 bg-white p-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem_9rem]">
        <label className="text-sm font-medium">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            className={input}
            placeholder="Software Testing"
          />
        </label>
        <label className="text-sm font-medium">
          Code
          <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={40} className={input} placeholder="SE402" />
        </label>
        <label className="text-sm font-medium">
          Term
          <input value={term} onChange={(e) => setTerm(e.target.value)} maxLength={40} className={input} placeholder="Spring 2027" />
        </label>
      </div>
      {create.isError && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {create.error.message}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
        >
          Create course
        </button>
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
      </div>
    </form>
  );
}
