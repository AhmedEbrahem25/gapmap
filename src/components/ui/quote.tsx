import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function EvidenceQuote({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <blockquote className={cn("m-0 rounded-[10px] border border-quote-line bg-quote px-3.5 py-2.5 text-base leading-6", className)}>
      {label ? <span className="mb-0.5 block text-xs text-ink-2">{label}</span> : null}
      {children}
    </blockquote>
  );
}

type Tone = "met" | "partial" | "missing" | "low";

export function Mark({ tone = "partial", children }: { tone?: Tone; children: ReactNode }) {
  if (tone === "low") {
    return (
      <span title="Low confidence — check against the scan" className="underline decoration-partial decoration-wavy underline-offset-4">
        {children}
      </span>
    );
  }
  const cls =
    tone === "met"
      ? "bg-met-soft text-met"
      : tone === "missing"
        ? "bg-missing-soft text-missing"
        : "bg-partial-soft text-partial-ink";
  return <mark className={cn("rounded px-1 py-px", cls)}>{children}</mark>;
}

/** Highlights every evidence quote inside a transcription. */
export function HighlightedText({
  text,
  marks,
}: {
  text: string;
  marks: { quote: string; tone: Tone }[];
}) {
  const ranges: { start: number; end: number; tone: Tone }[] = [];
  for (const m of marks) {
    if (!m.quote) continue;
    const i = text.toLowerCase().indexOf(m.quote.toLowerCase());
    if (i >= 0 && !ranges.some((r) => i < r.end && i + m.quote.length > r.start)) {
      ranges.push({ start: i, end: i + m.quote.length, tone: m.tone });
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  const out: ReactNode[] = [];
  let pos = 0;
  ranges.forEach((r, idx) => {
    if (r.start > pos) out.push(text.slice(pos, r.start));
    out.push(
      <Mark key={idx} tone={r.tone}>
        {text.slice(r.start, r.end)}
      </Mark>,
    );
    pos = r.end;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return <>{out}</>;
}
