import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { releasedAnswers } from "@/lib/student";
import { StudentHeader } from "@/components/shell/student-header";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { askQuestion, replyAsStudent } from "@/lib/actions/student";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Ask" };

export default async function AskPage({ searchParams }: PageProps<"/student/ask">) {
  const user = await requireRole("student");
  const sp = await searchParams;
  const threads = db.select().from(s.threads).where(eq(s.threads.studentId, user.id)).orderBy(desc(s.threads.createdAt)).all();
  const open = threads.find((t) => t.id === sp.t);
  const messages = open ? db.select().from(s.threadMessages).where(eq(s.threadMessages.threadId, open.id)).orderBy(asc(s.threadMessages.createdAt)).all() : [];
  const answers = releasedAnswers(user.id);
  const preset = typeof sp.answer === "string" ? sp.answer : "";

  if (open) {
    return (
      <>
        <StudentHeader back="/student/ask" eyebrow={`You appear as ${open.alias}`} title={open.subject} />
        <div className="flex flex-col gap-3 px-5">
          <ol className="flex flex-col gap-3">
            {messages.map((m) => (
              <li key={m.id} className={cn("max-w-[86%] rounded-2xl px-3.5 py-3 text-[15px] leading-[22px]", m.authorRole === "student" ? "self-end rounded-br-sm bg-primary-600 text-white" : "self-start rounded-bl-sm border border-line bg-white")}>
                {m.authorRole === "instructor" ? <span className="mb-1 block text-xs font-semibold text-primary-700">Instructor</span> : null}
                {m.body}
              </li>
            ))}
          </ol>
          <form action={replyAsStudent} className="flex flex-col gap-2">
            <input type="hidden" name="threadId" value={open.id} />
            <label htmlFor="body" className="text-sm font-semibold">
              Reply
            </label>
            <textarea id="body" name="body" rows={2} required className="resize-none rounded-[10px] border border-[#9ca3af] bg-white px-3 py-2.5 text-[15px]" />
            <SubmitButton>Send</SubmitButton>
          </form>
        </div>
      </>
    );
  }

  return (
    <>
      <StudentHeader eyebrow="Anonymous questions" title="Ask your instructor" />
      <Stagger className="flex flex-col gap-3.5 px-5">
        <StaggerItem>
          <p className="flex gap-2 rounded-2xl bg-met-soft px-4 py-3 text-sm leading-[21px] text-[#0b5d56]">
            <ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden /> Your instructor sees your answer and the marking comment, never your name.
          </p>
        </StaggerItem>
        <StaggerItem>
          <form action={askQuestion} className="flex flex-col gap-3 rounded-sheet border border-line bg-white p-4">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              About
              <select name="answerId" defaultValue={preset} className="h-11 rounded-[10px] border border-[#9ca3af] bg-white px-2 text-[15px] font-normal">
                <option value="">General question</option>
                {answers.map((a) => (
                  <option key={a.answer.id} value={a.answer.id}>
                    {a.exam.title} · Q{a.question.number}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Subject
              <input name="subject" required maxLength={140} placeholder="Why is my Q3 reason only partial?" className="h-11 rounded-[10px] border border-[#9ca3af] px-3 text-[15px] font-normal" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Your question
              <textarea name="body" rows={3} required className="resize-none rounded-[10px] border border-[#9ca3af] px-3 py-2.5 text-[15px] font-normal" />
            </label>
            <SubmitButton size="lg">Send anonymously</SubmitButton>
          </form>
        </StaggerItem>
        {threads.length ? (
          <StaggerItem>
            <h2 className="mb-2 text-sm font-semibold text-ink-2">Your questions</h2>
            <ul className="flex flex-col gap-2">
              {threads.map((t) => (
                <li key={t.id}>
                  <Link href={`/student/ask?t=${t.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm">
                    <span className="min-w-0 truncate font-semibold">{t.subject}</span>
                    <Badge tone={t.status === "answered" ? "met" : "neutral"}>{t.status === "answered" ? "Answered" : "Waiting"}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </StaggerItem>
        ) : null}
      </Stagger>
    </>
  );
}
