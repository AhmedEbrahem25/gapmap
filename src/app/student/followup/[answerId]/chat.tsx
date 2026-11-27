"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft } from "lucide-react";
import { sendFollowup, restartFollowup } from "@/lib/actions/student";
import { SlideLink } from "@/components/ui/slide-link";
import type { ChatMessage } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

type Branch = "understands" | "misconception" | "unclear" | null;

export function FollowupChat(props: {
  answerId: string;
  title: string;
  excerpt: string;
  intro: string;
  opening: string;
  initial: ChatMessage[];
  initialBranch: Branch;
  initialDone: boolean;
  initialActivityId: string | null;
  quickReplies: string[];
  slide: { id: string; lecture: number; page: number; title: string } | null;
  showIntro: boolean;
}) {
  const opening: ChatMessage = { role: "assistant", text: props.opening, at: 0 };
  const [messages, setMessages] = useState<ChatMessage[]>(props.initial.length ? props.initial : [opening]);
  const [branch, setBranch] = useState<Branch>(props.initialBranch);
  const [done, setDone] = useState(props.initialDone);
  const [activityId, setActivityId] = useState(props.initialActivityId);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  function send(choice: number) {
    const text = props.quickReplies[choice];
    if (!text || pending) return;
    setError(undefined);
    setMessages((m) => [...m, { role: "student", text, at: Date.now() }]);
    start(async () => {
      const res = await sendFollowup(props.answerId, choice);
      if (res.error) {
        setError(res.error);
        setMessages((m) => m.slice(0, -1));
        return;
      }
      setMessages(res.messages);
      setBranch(res.branch);
      setDone(res.done);
      if (res.activityId) setActivityId(res.activityId);
    });
  }

  function reset() {
    start(async () => {
      await restartFollowup(props.answerId);
      setMessages([opening]);
      setBranch(null);
      setDone(false);
      setActivityId(null);
    });
  }

  const showQuick = !done && messages.filter((m) => m.role === "student").length === 0 && props.quickReplies.length > 0;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-white/95 px-4 py-3 backdrop-blur">
        <Link href="/student" aria-label="Back to report" className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-ground">
          <ChevronLeft size={22} />
        </Link>
        <div>
          <h1 className="text-[17px] leading-[22px] font-semibold">{props.title}</h1>
          <p className="text-xs text-ink-2">1 question · about 1 minute</p>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-3 p-4" aria-live="polite">
        <div className="rounded-xl border border-quote-line bg-quote px-3 py-2.5 text-[13px] leading-[19px]">
          <span className="text-ink-2">Your answer</span>
          <br />“{props.excerpt.length > 120 ? props.excerpt.slice(0, 120) + "…" : props.excerpt}”
        </div>

        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div
              key={`${m.at}-${i}`}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "max-w-[86%] px-3.5 py-3 text-[15px] leading-[22px]",
                m.role === "assistant" ? "self-start rounded-2xl rounded-bl-sm border border-line bg-white" : "self-end rounded-2xl rounded-br-sm bg-primary-600 text-white",
              )}
            >
              {i === 0 && m.role === "assistant" && props.showIntro ? (
                <>
                  {props.intro}
                  <br />
                  <strong>{m.text}</strong>
                </>
              ) : (
                m.text
              )}
            </motion.div>
          ))}
          {pending ? (
            <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-1 self-start rounded-2xl rounded-bl-sm border border-line bg-white px-4 py-3.5" aria-label="GapMap is typing">
              {[0, 1, 2].map((d) => (
                <motion.span key={d} className="h-2 w-2 rounded-full bg-ink-3" animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: d * 0.15 }} />
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {showQuick ? (
          <div className="mt-1 flex flex-col gap-2">
            <p className="text-xs text-ink-2">Tap the reply closest to what you were thinking.</p>
            {props.quickReplies.map((q, i) => (
              <button
                key={q}
                onClick={() => send(i)}
                disabled={pending}
                className="min-h-11 rounded-xl border border-primary-200 bg-[#f8f9ff] px-3.5 py-2.5 text-left text-sm font-medium text-primary-800 transition hover:border-primary-600 hover:bg-primary-50 active:scale-[0.99]"
              >
                {q}
              </button>
            ))}
          </div>
        ) : null}

        {done ? (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-1 flex flex-col gap-2.5">
            {branch === "misconception" && props.slide ? (
              <SlideLink href={`/slides/${props.slide.id}?from=/student/followup/${props.answerId}`} lecture={props.slide.lecture} page={props.slide.page} title={props.slide.title} sub="Read this slide first" />
            ) : null}
            {activityId ? (
              <Link href={`/student/plan/${activityId}`} className="flex h-12 items-center justify-center rounded-xl bg-primary-600 text-[15px] font-semibold text-white transition hover:bg-primary-700 active:scale-[0.99]">
                {branch === "understands" ? "Improve my answer" : "Start the activity"}
              </Link>
            ) : null}
            <button onClick={reset} disabled={pending} className="min-h-11 text-sm font-medium text-primary-600">
              Try the other reply
            </button>
          </motion.div>
        ) : null}
        {error ? <p role="alert" className="text-sm text-missing">{error}</p> : null}
        <div ref={end} />
      </div>

    </div>
  );
}
