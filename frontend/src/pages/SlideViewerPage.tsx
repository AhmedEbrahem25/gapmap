import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { AuthedImage } from "../components/AuthedImage";
import { api } from "../services/api";

export function SlideViewerPage() {
  const { materialId = "", page: pageParam = "1" } = useParams();
  const pageNumber = Number(pageParam) || 1;
  const page = useQuery({
    queryKey: ["page", materialId, pageNumber],
    queryFn: () => api.page(materialId, pageNumber),
    placeholderData: keepPreviousData,
  });

  if (page.isPending) return <p className="text-slate-500">Loading slide…</p>;
  if (page.isError) return <p className="rounded-lg bg-red-50 p-4 text-red-700">{page.error.message}</p>;

  const p = page.data;
  const link = (n: number) => `/materials/${materialId}/pages/${n}`;
  return (
    <div>
      <Link to={`/courses/${p.course_id}`} className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to course
      </Link>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{p.title ?? `Page ${p.page_number}`}</h1>
        {/* FR-32: always show the real source */}
        <p className="text-sm text-slate-600">
          <span className="font-medium">{p.filename}</span> · page {p.page_number} of {p.page_count}
        </p>
      </div>

      {p.file_type === "docx" && (
        <p className="mt-2 text-xs text-slate-500">
          Word files have no fixed pages, so page numbers follow GapMap's copy, split at the document's page breaks
          or headings.
        </p>
      )}

      {p.image_url ? (
        <AuthedImage
          src={p.image_url}
          alt={`${p.filename}, page ${p.page_number}`}
          className="mx-auto mt-4 block h-auto max-h-[85vh] w-auto max-w-full rounded-lg border border-slate-200 bg-white shadow-sm"
        />
      ) : (
        <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-6 text-sm">{p.content}</pre>
      )}

      <div className="mt-4 flex items-center justify-between">
        <PageLink to={link(p.page_number - 1)} disabled={p.page_number <= 1} label="← Previous" />
        <PageLink to={link(p.page_number + 1)} disabled={p.page_number >= p.page_count} label="Next →" />
      </div>

      <details className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <summary className="cursor-pointer font-medium text-slate-700">Extracted text</summary>
        <pre className="mt-3 whitespace-pre-wrap font-sans text-slate-700">{p.content || "(no text on this page)"}</pre>
      </details>
    </div>
  );
}

function PageLink({ to, disabled, label }: { to: string; disabled: boolean; label: string }) {
  if (disabled) return <span className="rounded-md px-3 py-1.5 text-sm text-slate-300">{label}</span>;
  return (
    <Link to={to} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:border-brand-600">
      {label}
    </Link>
  );
}
