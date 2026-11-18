import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { api } from "../services/api";

export function CoursePage() {
  const { courseId = "" } = useParams();
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
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{c.title}</h1>
      <p className="text-slate-600">
        {[c.code, c.term, c.instructor_name].filter(Boolean).join(" · ")}
      </p>

      <dl className="mt-6 grid grid-cols-3 gap-4 sm:max-w-lg">
        <Stat label="Students" value={c.student_count} />
        <Stat label="Materials" value={c.material_count} />
        <Stat label="Exams" value={c.exam_count} />
      </dl>

      <h2 className="mt-10 text-lg font-semibold">Concepts</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-3">
        {c.concepts.map((concept) => (
          <li key={concept.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="font-medium">{concept.name}</p>
            {concept.description && <p className="mt-1 text-sm text-slate-600">{concept.description}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
    </div>
  );
}
