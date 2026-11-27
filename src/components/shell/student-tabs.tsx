"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Home, FileText, ListChecks, PenLine, MessageCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/student", label: "Home", icon: Home, exact: true },
  { href: "/student/papers", label: "My papers", icon: FileText },
  { href: "/student/plan", label: "Study plan", icon: ListChecks },
  { href: "/student/practice", label: "Practice", icon: PenLine },
  { href: "/student/ask", label: "Ask", icon: MessageCircle },
  { href: "/student/me", label: "Me", icon: User },
];

export function StudentTabs({ hidden }: { hidden?: boolean }) {
  const pathname = usePathname();
  if (hidden || pathname.startsWith("/student/followup")) return null;
  return (
    <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-20 mx-auto flex h-[76px] max-w-[480px] border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href || pathname.startsWith("/student/answers") : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            data-tour={`tab-${t.href.split("/")[2] ?? "home"}`}
            aria-current={active ? "page" : undefined}
            className={cn("relative flex flex-1 flex-col items-center gap-1 pt-2.5 text-[11px] font-medium transition-colors", active ? "font-semibold text-primary-600" : "text-ink-2 hover:text-ink")}
          >
            {active ? <motion.span layoutId="tab-dot" className="absolute top-0 h-[3px] w-10 rounded-b-full bg-primary-600" transition={{ type: "spring", stiffness: 500, damping: 35 }} /> : null}
            <t.icon size={22} aria-hidden strokeWidth={active ? 2.3 : 2} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
