import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { api } from "../../services/api";

/**
 * AI explanation grounded in the concept's approved slides. Loads after the plan, so the plan
 * never waits for it; when it is unavailable the plan is complete without it (NFR-05).
 */
export function ConceptExplanation({ conceptId }: { conceptId: string }) {
  const q = useQuery({
    queryKey: ["explanation", conceptId],
    queryFn: () => api.explanation(conceptId),
    staleTime: Infinity,
    retry: false,
  });

  if (q.isPending)
    return (
      <div className="mt-4 rounded-lg bg-brand-50 p-4" aria-busy>
        <p className="text-xs font-medium text-brand-700">Preparing an explanation from your slides…</p>
        <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-brand-100" />
        <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-brand-100" />
      </div>
    );
  if (q.isError || q.data.status !== "ready") return null; // the slides and practice below still work

  const e = q.data;
  return (
    <div className="mt-4 rounded-lg bg-brand-50 p-4 text-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-brand-700">Explanation</p>
      <div className="mt-2 space-y-2 text-slate-800">
        {e.explanation!.split(/\n{2,}/).map((para) => (
          <p key={para}>{para}</p>
        ))}
      </div>
      {e.key_points.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-slate-700">
          {e.key_points.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate-500">
        AI-generated from{" "}
        {e.sources.map((s, i) => (
          <span key={s.slide_chunk_id}>
            {i > 0 && ", "}
            <Link to={`/materials/${s.material_id}/pages/${s.page_number}`} className="text-brand-700 underline">
              page {s.page_number}
            </Link>
          </span>
        ))}{" "}
        of {e.sources[0]?.filename}. Check it against the slides; it is a study aid, not a final answer.
      </p>
    </div>
  );
}
