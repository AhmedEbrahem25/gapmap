import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { staffCourses } from "@/lib/data";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge, StatusChip } from "@/components/ui/badge";
import { EvidenceQuote } from "@/components/ui/quote";
import { SubmitButton } from "@/components/ui/submit-button";
import { FadeIn } from "@/components/ui/motion";
import { replyThread } from "@/lib/actions/instructor";
import { cn, fmtMarks } from "@/lib/utils";

export const metadata: Metadata = { title: "Discussions" };

export default async function DiscussionsPage({ searchParams }: PageProps<"/instructor/discussions">) {
  const user = await requireRole("instructor", "ta", "admin");
  const sp = await searchParams;
  const courseIds = staffCourses(user).map((c) => c.id);
  // The student's identity is never selected here: staff only ever see the alias.
  const threads = courseIds.length
    ? db
        .select({ id: s.threads.id, alias: s.threads.alias, subject: s.threads.subject, status: s.threads.status, answerId: s.threads.answerId, createdAt: s.threads.createdAt })
        .from(s.threads)
        .where(inArray(s.threads.courseId, courseIds))
        .orderBy(asc(s.threads.status), desc(s.threads.createdAt))
        .all()
    : [];
  if (!threads.length) return <EmptyState title="No questions yet" body="Anonymous student questions appear here." />;
  const current = threads.find((t) => t.id === sp.t) ?? threads[0]!;
  const messages = db.select().from(s.threadMessages).where(eq(s.threadMessages.threadId, current.id)).orderBy(asc(s.threadMessages.createdAt)).all();
  const context = current.answerId
    ? db
        .select({ answer: s.answers, question: s.questions })
        .from(s.answers)
        .innerJoin(s.questions, eq(s.questions.id, s.answers.questionId))
        .where(eq(s.answers.id, current.answerId))
        .get()
    : null;
  const results = context
    ? db
        .select({ r: s.criterionResults, c: s.criteria })
        .from(s.criterionResults)
        .innerJoin(s.criteria, eq(s.criteria.id, s.criterionResults.criterionId))
        .where(eq(s.criterionResults.answerId, context.answer.id))
        .all()
    : [];

  return (
    <>
      <PageHeader title="Discussions" sub="Anonymous. You never see the name." />
      <div className="flex flex-wrap items-start gap-5">
        <Card className="w-full overflow-hidden lg:max-w-[360px]">
          <ul>
            {threads.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/instructor/discussions?t=${t.id}`}
                  className={cn("flex flex-col gap-1 border-b border-line-2 px-4 py-3.5 transition hover:bg-ground", t.id === current.id && "bg-primary-50")}
                >
                  <span className="flex items-center justify-between gap-2 text-xs text-ink-2">
                    {t.alias}
                    <Badge tone={t.status === "open" ? "partial" : "met"}>{t.status === "open" ? "Needs reply" : "Answered"}</Badge>
                  </span>
                  <span className="text-sm font-semibold">{t.subject}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <FadeIn key={current.id} className="flex min-w-0 flex-[999_1_480px] flex-col gap-4">
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex items-center gap-2 text-sm text-ink-2">
              <ShieldCheck size={16} className="text-met" aria-hidden /> Identity hidden · {current.alias}
            </div>
            <h2 className="text-lg font-semibold">{current.subject}</h2>
            {context ? (
              <div className="flex flex-col gap-2 rounded-card bg-ground p-4">
                <p className="text-sm text-ink-2">
                  Q{context.question.number} · {context.question.prompt}
                </p>
                <EvidenceQuote label="Their answer">{context.answer.transcription}</EvidenceQuote>
                <div className="flex flex-wrap gap-1.5">
                  {results.map(({ r, c }) => (
                    <StatusChip key={r.id} status={r.status} suffix={`${c.code} ${fmtMarks(r.marks)}/${fmtMarks(c.marks)}`} />
                  ))}
                </div>
              </div>
            ) : null}
            <ol className="flex flex-col gap-3">
              {messages.map((m) => (
                <li key={m.id} className={cn("max-w-[85%] rounded-2xl px-4 py-3 text-base leading-[22px]", m.authorRole === "instructor" ? "self-end rounded-br-sm bg-primary-600 text-white" : "self-start rounded-bl-sm border border-line bg-white")}>
                  {m.body}
                </li>
              ))}
            </ol>
            <form action={replyThread} className="flex flex-col gap-2">
              <input type="hidden" name="threadId" value={current.id} />
              <label htmlFor="reply" className="text-sm font-semibold">
                Your reply
              </label>
              <textarea id="reply" name="body" rows={3} required className="rounded-lg border border-[#9ca3af] p-3 text-base" />
              <SubmitButton className="self-end">Send reply</SubmitButton>
            </form>
          </Card>
        </FadeIn>
      </div>
    </>
  );
}
