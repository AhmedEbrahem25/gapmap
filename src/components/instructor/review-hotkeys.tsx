"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** J / K move through the queue, A approves. Ignored while typing in a field. */
export function ReviewHotkeys({ prev, next, approveFormId }: { prev?: string; next?: string; approveFormId: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" && next) router.push(next);
      if (e.key === "k" && prev) router.push(prev);
      if (e.key === "a") (document.getElementById(approveFormId) as HTMLFormElement | null)?.requestSubmit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, approveFormId, router]);
  return null;
}
