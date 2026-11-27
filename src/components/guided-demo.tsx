"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { demoSteps } from "@/lib/tours";
import { logout } from "@/lib/actions/auth";

const KEY = "gm-demo-step";
const EVENT = "gm:demo";

function readStep(): number | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}
function writeStep(i: number | null) {
  try {
    if (i === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(i));
  } catch {
    /* private mode: the guide just ends */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function demoActive() {
  return readStep() !== null;
}

/** Starts the guided demo from the top, signed out. */
export async function startGuidedDemo() {
  writeStep(0);
  await logout();
}

type Rect = { top: number; left: number; width: number; height: number };

/** A corner card that walks a visitor through the whole story, page by page, lighting up what to click next. */
export function GuidedDemo() {
  const pathname = usePathname();
  const [index, setIndex] = useState<number | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    const sync = () => setIndex(readStep());
    const raf = requestAnimationFrame(sync);
    window.addEventListener(EVENT, sync);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener(EVENT, sync);
    };
  }, []);

  // Reaching a later step's page (by clicking the lit-up element) moves the guide there.
  useEffect(() => {
    if (index === null) return;
    const step = demoSteps[index];
    if (!step || new RegExp(step.path).test(pathname)) return;
    const ahead = demoSteps.findIndex((s, i) => i > index && new RegExp(s.path).test(pathname));
    if (ahead !== -1) writeStep(ahead);
  }, [pathname, index]);

  const step = index === null ? undefined : demoSteps[index];
  const onPage = !!step && new RegExp(step.path).test(pathname);

  // Light up the step's element and keep the ring on it while the page moves.
  useEffect(() => {
    if (!onPage || !step?.target) {
      const raf = requestAnimationFrame(() => setRect(null));
      return () => cancelAnimationFrame(raf);
    }
    let el: HTMLElement | null = null;
    const measure = () => {
      el ??= document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      const r = el && el.offsetWidth > 0 ? el.getBoundingClientRect() : null;
      setRect(r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null);
    };
    const raf = requestAnimationFrame(measure);
    const first = window.setTimeout(() => {
      measure();
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 400);
    const poll = window.setInterval(measure, 300);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(first);
      window.clearInterval(poll);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [onPage, step]);

  const end = useCallback(() => writeStep(null), []);

  if (index === null || !step) return null;
  const last = index === demoSteps.length - 1;
  // A click step whose element isn't on the page (e.g. the demo data moved on) falls back to "Next".
  const waitForClick = onPage && step.click && !!rect;

  return (
    <>
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[90] animate-pulse rounded-xl ring-4 ring-primary-500/80"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      ) : null}
      <div
        role="dialog"
        aria-label="Guided demo"
        className="fixed right-4 bottom-24 left-4 z-[95] flex flex-col gap-2 rounded-2xl border border-line bg-white p-4 shadow-[0_24px_60px_-20px_rgb(15_18_40/0.5)] sm:left-auto sm:w-80 lg:bottom-6"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-primary-700">
            Guided demo · {index + 1} of {demoSteps.length}
          </span>
          <button onClick={end} aria-label="End the guided demo" className="-m-1 flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 hover:bg-ground hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <h2 className="text-base font-semibold text-navy">{step.title}</h2>
        <p className="text-sm text-ink-2">{onPage ? step.body : "Go back to continue, or restart."}</p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <button onClick={() => void startGuidedDemo()} className="text-xs font-medium text-ink-2 hover:text-ink">
            Restart
          </button>
          {onPage && !waitForClick ? (
            <button
              onClick={() => (last ? end() : writeStep(index + 1))}
              className="h-9 rounded-[10px] bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700"
            >
              {last ? "Finish" : "Next"}
            </button>
          ) : onPage ? (
            <span className="text-xs font-semibold text-primary-700">Click the highlighted item</span>
          ) : null}
        </div>
      </div>
    </>
  );
}

/** "Guided demo" button for the sign-in page. */
export function GuidedDemoButton({ className, children = "Guided demo · 2 min" }: { className?: string; children?: React.ReactNode }) {
  return (
    <button type="button" onClick={() => void startGuidedDemo()} className={className}>
      {children}
    </button>
  );
}
