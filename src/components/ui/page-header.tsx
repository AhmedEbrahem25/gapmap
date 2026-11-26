import type { ReactNode } from "react";
import { FadeIn } from "./motion";

export function PageHeader({
  crumb,
  title,
  sub,
  actions,
}: {
  crumb?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <FadeIn className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {crumb ? <p className="text-[13px] text-ink-2">{crumb}</p> : null}
        <h1 className="mt-1 text-[26px] leading-9 font-bold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {sub ? <p className="mt-1 text-sm text-ink-2">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </FadeIn>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-primary-200 bg-[#f8f9ff] px-6 py-10 text-center">
      <p className="text-[15px] font-semibold">{title}</p>
      <p className="max-w-md text-sm text-ink-2">{body}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
