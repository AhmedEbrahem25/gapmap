"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { tours, type TourId, type TourStep } from "@/lib/tours";

const EVENT = "gm:tour";
const seenKey = (id: TourId) => `gm-tour-${id}`;

/** Starts a tour from anywhere (the "Take the tour" buttons). */
export function startTour(id: TourId) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
}

function readSeen(id: TourId) {
  try {
    return localStorage.getItem(seenKey(id)) === "1";
  } catch {
    return false;
  }
}
function markSeen(id: TourId) {
  try {
    localStorage.setItem(seenKey(id), "1");
  } catch {
    /* private mode: the tour simply shows again next time */
  }
}

type Rect = { top: number; left: number; width: number; height: number };

/** A fixed element (like the bottom tab bar) never needs the page scrolled. */
function isFixed(el: HTMLElement | null): boolean {
  for (let n = el; n; n = n.parentElement) if (getComputedStyle(n).position === "fixed") return true;
  return false;
}

/**
 * A guided tour: dims the page, lights up one part at a time and explains it.
 * Starts by itself on a first visit (not in automated browsers), and again from any "Take the tour" button.
 */
export function Tour({ id }: { id: TourId }) {
  const steps: TourStep[] = tours[id];
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(220);
  const card = useRef<HTMLDivElement>(null);
  const cardHRef = useRef(220);
  const reduce = useReducedMotion();
  const step = steps[index];

  const close = useCallback(() => {
    markSeen(id);
    setOpen(false);
  }, [id]);

  useEffect(() => {
    const onStart = (e: Event) => {
      if ((e as CustomEvent).detail !== id) return;
      setIndex(0);
      setOpen(true);
    };
    window.addEventListener(EVENT, onStart);
    // Shown once by itself: leaving half-way still counts as seen; the "Take the tour" buttons replay it.
    const auto = !readSeen(id) && !navigator.webdriver ? window.setTimeout(() => (markSeen(id), setOpen(true)), 900) : undefined;
    return () => {
      window.removeEventListener(EVENT, onStart);
      if (auto) window.clearTimeout(auto);
    };
  }, [id]);

  // Find the lit-up element, bring it into view and follow it while the page moves.
  useEffect(() => {
    if (!open || !step) return;
    const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
    const visible = el && el.getClientRects().length > 0 && el.offsetWidth > 0;
    if (!visible) {
      const raf = requestAnimationFrame(() => setRect(null));
      return () => cancelAnimationFrame(raf);
    }
    // Leave room for the card: put the element near the top when both fit, otherwise centre it. Elements already in view stay put.
    const r0 = el.getBoundingClientRect();
    const behavior = reduce ? "auto" : "smooth";
    if (!isFixed(el) && (r0.top < 72 || r0.bottom > window.innerHeight - 16)) {
      if (r0.height + cardHRef.current + 120 < window.innerHeight) window.scrollTo({ top: window.scrollY + r0.top - 88, behavior });
      else el.scrollIntoView({ block: "center", behavior });
    }
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const raf = requestAnimationFrame(measure);
    const t = window.setTimeout(measure, reduce ? 0 : 450);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step, reduce]);

  useLayoutEffect(() => {
    if (card.current) {
      cardHRef.current = card.current.offsetHeight;
      setCardH(card.current.offsetHeight);
    }
    card.current?.focus();
  }, [index, open, rect]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, steps.length]);

  if (!open || !step || typeof document === "undefined") return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = 8;
  const cardW = Math.min(380, vw - 32);
  // The spotlight stays inside the screen even for sections taller than it.
  const spot = rect
    ? {
        top: Math.max(rect.top - pad, 8),
        left: Math.max(rect.left - pad, 8),
        width: Math.min(rect.width + pad * 2, vw - 16),
        height: Math.min(rect.top + rect.height + pad, vh - 8) - Math.max(rect.top - pad, 8),
      }
    : null;
  let top = vh / 2 - cardH / 2;
  let left = vw / 2 - cardW / 2;
  if (spot) {
    const below = spot.top + spot.height + 12;
    const above = spot.top - 12 - cardH;
    top = below + cardH <= vh - 16 ? below : above >= 16 ? above : vh - cardH - 16;
    left = Math.min(Math.max(spot.left + spot.width / 2 - cardW / 2, 16), vw - cardW - 16);
  }
  const last = index === steps.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[100]" aria-live="polite">
      {/* Dims everything except the spotlight; clicks outside do nothing, so the tour can't be lost by accident. */}
      {spot ? (
        <motion.div
          className="pointer-events-none fixed rounded-xl ring-2 ring-primary-500"
          style={{ boxShadow: "0 0 0 9999px rgb(15 18 40 / 0.58)" }}
          initial={false}
          animate={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
          transition={{ duration: reduce ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
        />
      ) : (
        <div className="fixed inset-0 bg-[rgb(15_18_40/0.58)]" />
      )}
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          ref={card}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-title"
          aria-describedby="tour-body"
          tabIndex={-1}
          initial={{ opacity: 0, y: reduce ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
          className="fixed flex flex-col gap-3 rounded-2xl border border-line bg-white p-5 shadow-[0_24px_60px_-20px_rgb(15_18_40/0.5)] outline-none"
          style={{ top, left, width: cardW }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold tracking-wide text-primary-700 uppercase">
              {step.eyebrow ?? "Tour"} · {index + 1} of {steps.length}
            </span>
            <button onClick={close} aria-label="Close the tour" className="-m-1 flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 hover:bg-ground hover:text-ink">
              <X size={16} />
            </button>
          </div>
          <h2 id="tour-title" className="text-[17px] leading-6 font-semibold text-navy">
            {step.title}
          </h2>
          <p id="tour-body" className="text-sm leading-[21px] text-ink-2">
            {step.body}
          </p>
          <div className="flex gap-1" aria-hidden>
            {steps.map((_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-primary-600" : "bg-line"}`} />
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <button onClick={close} className="text-sm font-medium text-ink-2 hover:text-ink">
              Skip tour
            </button>
            <div className="flex gap-2">
              {index > 0 ? (
                <button onClick={() => setIndex(index - 1)} className="h-10 rounded-[10px] border border-line px-3.5 text-sm font-semibold hover:bg-ground">
                  Back
                </button>
              ) : null}
              <button
                onClick={() => (last ? close() : setIndex(index + 1))}
                className="h-10 rounded-[10px] bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700"
              >
                {last ? (step.done ?? "Start exploring") : "Next"}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body,
  );
}

/** Replays a tour. */
export function TourButton({ id, className, children = "Take the tour", ...rest }: { id: TourId; className?: string; children?: React.ReactNode; "data-tour"?: string }) {
  return (
    <button type="button" onClick={() => startTour(id)} className={className} {...rest}>
      {children}
    </button>
  );
}
