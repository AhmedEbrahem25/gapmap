"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { BookOpen, FileText, BarChart3, MessagesSquare, BellRing, Briefcase, Menu, X, Compass } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { TourButton } from "@/components/tour";
import { Logo } from "@/components/ui/logo";

const items = [
  { href: "/instructor", label: "Courses", icon: BookOpen, exact: true },
  { href: "/instructor/exams", label: "Exams", icon: FileText },
  { href: "/instructor/insights", label: "Class insights", icon: BarChart3 },
  { href: "/instructor/discussions", label: "Discussions", icon: MessagesSquare, countKey: "threads" },
  { href: "/instructor/alerts", label: "Alerts", icon: BellRing, countKey: "alerts" },
  { href: "/instructor/internships", label: "Internships", icon: Briefcase },
] as const;

export function StaffNav({ counts, footer, partners }: { counts: { threads: number; alerts: number }; footer: React.ReactNode; partners: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href || pathname.startsWith("/instructor/courses") : pathname.startsWith(href);

  const list = (
    <ul className="flex flex-col gap-1">
      {items.filter((it) => partners || it.href !== "/instructor/internships").map((it) => {
        const active = isActive(it.href, "exact" in it ? it.exact : false);
        const count = "countKey" in it ? counts[it.countKey] : 0;
        return (
          <li key={it.href} className="relative">
            {active ? (
              <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg bg-primary-50" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
            ) : null}
            <Link
              href={it.href}
              data-tour={`nav-${it.href.split("/")[2] ?? "courses"}`}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors",
                active ? "font-semibold text-primary-800" : "text-[#374151] hover:bg-ground",
              )}
            >
              <it.icon size={17} aria-hidden className={active ? "text-primary-600" : "text-ink-3"} />
              {it.label}
              {count > 0 ? <span className="ml-auto rounded-full bg-primary-600 px-1.5 text-xs leading-5 font-semibold text-white">{count}</span> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <div className="flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:hidden">
        <Link href="/instructor">
          <Logo />
        </Link>
        <button aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-ground">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open ? (
        <nav aria-label="Main" className="border-b border-line bg-white p-3 lg:hidden">
          {list}
          <div className="mt-3 border-t border-line pt-3">{footer}</div>
        </nav>
      ) : null}
      <nav aria-label="Main" className="hidden w-60 shrink-0 flex-col border-r border-line bg-white px-4 py-6 lg:flex lg:sticky lg:top-0 lg:h-screen">
        <Link href="/instructor" className="px-2 pb-6">
          <Logo />
        </Link>
        {list}
        <TourButton
          id="instructor"
          data-tour="tour-button"
          className="mt-4 flex h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-primary-700 hover:bg-primary-50"
        >
          <Compass size={17} aria-hidden /> Take the tour
        </TourButton>
        <div className="mt-auto border-t border-line pt-3">{footer}</div>
      </nav>
    </>
  );
}
