import { cn } from "@/lib/utils";

export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <rect width="48" height="48" rx="12" fill="#B51834" />
      <path d="M12 32 L20 20 L28 27 L36 15" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="36" cy="15" r="4" fill="#FDBA74" />
      <circle cx="12" cy="32" r="3" fill="#fff" />
    </svg>
  );
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className={cn("text-lg font-bold tracking-tight", light ? "text-white" : "text-ink")}>GapMap</span>
    </span>
  );
}
