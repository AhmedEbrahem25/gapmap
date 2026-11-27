import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { FadeIn } from "@/components/ui/motion";

export function StudentHeader({ eyebrow, title, back, right }: { eyebrow?: string; title: string; back?: string; right?: ReactNode }) {
  return (
    <header className="flex items-center gap-2 px-5 pt-5 pb-3">
      {back ? (
        <Link href={back} aria-label="Back" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-ink hover:bg-white">
          <ChevronLeft size={22} />
        </Link>
      ) : null}
      <FadeIn className="min-w-0 flex-1" y={6}>
        {eyebrow ? <p className="text-[13px] text-ink-2">{eyebrow}</p> : null}
        <h1 className="text-[22px] leading-7 font-bold tracking-tight text-navy">{title}</h1>
      </FadeIn>
      {right}
    </header>
  );
}
