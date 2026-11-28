import { AnimatedBar } from "@/components/ui/motion";
import { ACTIVITY_LABEL } from "@/lib/profile-rules";
import type { ActivityType } from "@/lib/db/schema";

export type WhatWorksRow = { type: ActivityType; value: number; detail: string };

const fmt = (x: number) => String(Math.round(x * 10) / 10);
export const timesText = (wins: number, n: number) => (n ? `${fmt(wins)} of ${n}` : "not tried");

/** Bars for how well each activity type has helped, best first. Used by the student plan and the lecturer's course page. */
export function WhatWorks({ title, rows, note }: { title: string; rows: WhatWorksRow[]; note: string }) {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  return (
    <section aria-label={title} className="rounded-sheet border border-line bg-white p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="mt-1 flex flex-col">
        {sorted.map((r) => (
          <li key={r.type} className="flex flex-col gap-1.5 border-t border-line-2 py-2.5 first:border-0">
            <span className="flex items-center justify-between gap-2 text-sm">
              <span>{ACTIVITY_LABEL[r.type]}</span>
              <span className="text-xs text-ink-2">{r.detail}</span>
            </span>
            <AnimatedBar value={Math.round(r.value * 100)} color="#232A6B" height={6} />
          </li>
        ))}
      </ul>
      <p className="border-t border-line-2 pt-2.5 text-xs leading-[18px] text-ink-2">{note}</p>
    </section>
  );
}
