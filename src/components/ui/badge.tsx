import { cn } from "@/lib/utils";
import { Check, X, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import type { CriterionStatus } from "@/lib/db/schema";

const tones = {
  neutral: "bg-ground text-[#374151] border border-line",
  primary: "bg-primary-50 text-primary-800",
  met: "bg-met-soft text-met",
  partial: "bg-partial-soft text-partial",
  missing: "bg-missing-soft text-missing",
  ai: "bg-ai-soft text-ai-ink",
  dark: "bg-ink text-white",
  solid: "bg-primary-600 text-white",
} as const;

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: keyof typeof tones;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

function HalfIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
    </svg>
  );
}

const statusLabel: Record<CriterionStatus, string> = { met: "Met", partial: "Partial", missing: "Missing" };

/** Status is never colour-only: icon + word, always. */
export function StatusChip({ status, suffix, className }: { status: CriterionStatus; suffix?: string; className?: string }) {
  const icon =
    status === "met" ? <Check size={13} strokeWidth={3} aria-hidden /> : status === "missing" ? <X size={13} strokeWidth={3} aria-hidden /> : <HalfIcon />;
  return (
    <Badge tone={status} className={className}>
      {icon}
      {statusLabel[status]}
      {suffix ? <span className="font-semibold"> · {suffix}</span> : null}
    </Badge>
  );
}

export function AiBadge({ children = "AI suggestion · needs review" }: { children?: ReactNode }) {
  return (
    <Badge tone="ai">
      <Sparkles size={12} aria-hidden />
      {children}
    </Badge>
  );
}

export function statusFromRatio(score: number, max: number): CriterionStatus {
  if (max === 0) return "missing";
  const r = score / max;
  if (r >= 0.8) return "met";
  if (r > 0) return "partial";
  return "missing";
}
