import { useState } from "react";

import type { ConceptStat } from "../../types/api";

/**
 * Error rate per concept: one series, so one hue and no legend. Values are written next to
 * each bar, and re-teaching is shown with a labelled badge, so nothing relies on colour alone.
 */
export function ConceptErrorChart({
  concepts,
  reteachThreshold,
  reteachIds,
}: {
  concepts: ConceptStat[];
  reteachThreshold: number;
  reteachIds: Set<string>;
}) {
  const [hover, setHover] = useState<string | null>(null);

  return (
    <figure className="rounded-xl border border-slate-200 bg-white p-5">
      <figcaption className="text-sm font-medium text-slate-700">Wrong answers by concept</figcaption>
      <div className="relative mt-4 space-y-4">
        {concepts.map((c) => (
          <div
            key={c.concept_id}
            className="relative grid grid-cols-[minmax(6rem,9rem)_1fr] items-center gap-3"
            onMouseEnter={() => setHover(c.concept_id)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(c.concept_id)}
            onBlur={() => setHover(null)}
            tabIndex={0}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{c.name}</p>
              {reteachIds.has(c.concept_id) && (
                <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">
                  <span aria-hidden>⚑</span> Re-teach
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="relative h-3 flex-1">
                {/* threshold marker */}
                <div
                  className="absolute inset-y-[-6px] border-l border-dashed border-slate-400"
                  style={{ left: `${reteachThreshold}%` }}
                  aria-hidden
                />
                <div
                  className={`h-full rounded-r bg-brand-600 transition-opacity ${hover && hover !== c.concept_id ? "opacity-50" : ""}`}
                  style={{ width: `${Math.max(c.error_rate, 0.5)}%` }}
                />
              </div>
              <p className="w-32 shrink-0 text-right text-sm tabular-nums text-slate-700">
                <span className="font-semibold">{c.error_rate}%</span>{" "}
                <span className="text-slate-500">
                  of {c.responses}
                </span>
              </p>
            </div>

            {hover === c.concept_id && (
              <div
                role="tooltip"
                className="absolute left-36 top-full z-10 mt-1 w-64 rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-lg"
              >
                <p className="font-semibold text-slate-900">{c.name}</p>
                <p className="mt-1">
                  {c.incorrect} of {c.responses} answers wrong across {c.question_count} questions
                </p>
                <p>
                  {c.students_weak} of {c.students_measured} students need to review it
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-500">
        Dashed line: re-teaching threshold ({reteachThreshold}% wrong). Hover a bar for details.
      </p>
    </figure>
  );
}
