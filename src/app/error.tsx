"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-lg font-bold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-ink-2">Your work is saved. Try again, and if it keeps happening, tell your course admin{error.digest ? ` (ref ${error.digest})` : ""}.</p>
      <button onClick={reset} className="rounded-[10px] bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">
        Try again
      </button>
    </main>
  );
}
