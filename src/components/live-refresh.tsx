"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Polls the server while background work (uploads, AI analysis) is running. */
export function LiveRefresh({ active, every = 2500 }: { active: boolean; every?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), every);
    return () => clearInterval(t);
  }, [active, every, router]);
  return null;
}
