import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Page content renders visible straight from the server. These wrappers used to fade content in, which hid it
 * until the JavaScript loaded and made every page feel slow (most of all in dev mode and on slower laptops).
 * They keep their props so pages don't change; interactive animations live in the components that need them.
 */

type Box = { children: ReactNode; className?: string };

export function FadeIn({ children, className }: Box & { delay?: number; y?: number }) {
  return <div className={className}>{children}</div>;
}

export function Reveal({ children, className }: Box & { delay?: number }) {
  return <div className={className}>{children}</div>;
}

export function Stagger({ children, className }: Box & { gap?: number }) {
  return <div className={className}>{children}</div>;
}

export function StaggerItem({ children, className }: Box) {
  return <div className={className}>{children}</div>;
}

export function AnimatedBar({ value, color, height = 8, className }: { value: number; color: string; height?: number; className?: string; delay?: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-[#f1f2f4]", className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full" style={{ background: color, width: `${pct}%` }} />
    </div>
  );
}

export function CountUp({ to, suffix = "", className }: { to: number; suffix?: string; className?: string }) {
  return (
    <span className={className}>
      {to}
      {suffix}
    </span>
  );
}
