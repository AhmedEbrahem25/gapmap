import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "../features/auth/AuthContext";
import { MaterialsSection } from "../features/materials/MaterialsSection";
import { ExamsSection } from "../features/reports/ExamsSection";
import { api } from "../services/api";

export function CoursePage() {
  const { courseId = "" } = useParams();
  const { user } = useAuth();
  const isInstructor = user?.role === "instructor" || user?.role === "admin";
  const course = useQuery({ queryKey: ["course", courseId], queryFn: () => api.course(courseId) });

  if (course.isPending) return <p className="text-slate-500">Loading course…</p>;
  if (course.isError)
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-700">
        <p>{course.error.message}</p>
        <Link to="/" className="mt-2 inline-block text-sm underline">
          Back to my courses
        </Link>
      </div>
    );

  const c = course.data;
  return (
    <div>
      <Link to="/" className="text-sm text-slate-500 hover:text-slate-800">
        ← My courses
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{c.title}</h1>
        <div className="flex gap-2">
          {isInstructor && (
            <Link
              to={`/courses/${c.id}/audit`}
              className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              Audit log
            </Link>
          )}
          {user && user.role !== "student" && (
            <Link
              to={`/courses/${c.id}/analytics`}
              className="rounded-md border border-brand-600 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              Class analytics
            </Link>
          )}
        </div>
      </div>
      <p className="text-slate-600">
        {[c.code, c.term, c.instructor_name].filter(Boolean).join(" · ")}
      </p>

      <dl className="mt-6 grid grid-cols-3 gap-4 sm:max-w-lg">
        <Stat label="Students" value={c.student_count} to={isInstructor ? `/courses/${c.id}/students` : undefined} />
        <Stat label="Materials" value={c.material_count} />
        <Stat label="Exams" value={c.exam_count} />
      </dl>

      <div className="mt-10 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Concepts</h2>
        {isInstructor && (
          <Link to={`/courses/${c.id}/concepts`} className="text-sm font-medium text-brand-700 hover:underline">
            Manage concepts and slides
          </Link>
        )}
      </div>
      {c.concepts.length === 0 && (
        <p className="mt-3 text-sm text-slate-600">
          No concepts yet.
          {isInstructor && " Upload a lecture, then add a concept for each topic your exam questions assess."}
        </p>
      )}
      <ul className="mt-3 grid gap-3 sm:grid-cols-3">
        {c.concepts.map((concept) => (
          <li key={concept.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="font-medium">{concept.name}</p>
            {concept.description && <p className="mt-1 text-sm text-slate-600">{concept.description}</p>}
          </li>
        ))}
      </ul>

      {(isInstructor || user?.role === "student") && <ExamsSection courseId={c.id} isInstructor={isInstructor} />}

      <MaterialsSection courseId={c.id} canUpload={isInstructor} />
    </div>
  );
}

function Stat({ label, value, to }: { label: string; value: number; to?: string }) {
  const body = (
    <>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
      {to && <dd className="mt-1 text-xs text-brand-700">Manage</dd>}
    </>
  );
  return to ? (
    <Link to={to} className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-600">
      {body}
    </Link>
  ) : (
    <div className="rounded-lg border border-slate-200 bg-white p-4">{body}</div>
  );
}
