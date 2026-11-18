import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../../services/api";
import type { Material } from "../../types/api";

const STATUS_STYLE: Record<Material["status"], string> = {
  ready: "bg-emerald-100 text-emerald-800",
  processing: "bg-amber-100 text-amber-800",
  uploaded: "bg-slate-100 text-slate-700",
  failed: "bg-red-100 text-red-800",
};

export function MaterialsSection({ courseId, canUpload }: { courseId: string; canUpload: boolean }) {
  const queryClient = useQueryClient();
  const materials = useQuery({ queryKey: ["materials", courseId], queryFn: () => api.materials(courseId) });
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: (file: File) => api.uploadMaterial(courseId, file),
    onMutate: () => setError(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials", courseId] });
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
    },
    onError: (err) => setError(err.message),
    onSettled: () => {
      if (input.current) input.current.value = "";
    },
  });

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Lecture materials</h2>
        {canUpload && (
          <label className="cursor-pointer rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800">
            {upload.isPending ? "Processing…" : "Upload PDF or Word"}
            <input
              ref={input}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              disabled={upload.isPending}
              onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])}
            />
          </label>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {materials.isPending && <li className="p-4 text-sm text-slate-500">Loading…</li>}
        {materials.data?.length === 0 && <li className="p-4 text-sm text-slate-500">No materials uploaded yet.</li>}
        {materials.data?.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div className="min-w-0">
              <p className="truncate font-medium">{m.filename}</p>
              <p className="text-xs text-slate-500">
                {m.page_count ? `${m.page_count} pages` : "—"}
                {m.error && <span className="text-red-700"> · {m.error}</span>}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[m.status]}`}>{m.status}</span>
              {m.status === "ready" && (
                <Link to={`/materials/${m.id}/pages/1`} className="text-sm font-medium text-brand-700 hover:underline">
                  View slides
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
