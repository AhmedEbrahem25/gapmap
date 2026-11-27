import Link from "next/link";
import { cn } from "@/lib/utils";

export function SlideLink({
  href,
  lecture,
  page,
  title,
  sub,
  className,
}: {
  href: string;
  lecture: number;
  page: number;
  title: string;
  sub?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-xl border border-line bg-white p-2 text-ink no-underline transition hover:border-primary-200 hover:shadow-lift",
        className,
      )}
    >
      <span className="flex h-11 w-16 shrink-0 items-center justify-center rounded-md bg-primary-50 text-xs font-semibold text-primary-800 transition group-hover:bg-primary-100">
        L{lecture} · {page}
      </span>
      <span className="flex min-w-0 flex-col text-sm">
        <strong className="truncate font-semibold">{title}</strong>
        <span className="text-xs text-ink-2">{sub ?? `Lecture ${lecture} · slide ${page}`}</span>
      </span>
    </Link>
  );
}
