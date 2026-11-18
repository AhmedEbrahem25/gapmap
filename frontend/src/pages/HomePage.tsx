import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

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

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user?.name}</h1>
      {user && <p className="mt-1 text-slate-600">{SUBTITLE[user.role]}</p>}

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
