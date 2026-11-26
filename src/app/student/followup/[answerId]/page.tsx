import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { slideRef } from "@/lib/data";
import { ownAnswer, resultsFor } from "@/lib/student";
import { FollowupChat } from "./chat";

export const metadata: Metadata = { title: "Quick check" };

export default async function FollowupPage({ params }: PageProps<"/student/followup/[answerId]">) {
  const user = await requireRole("student");
  const { answerId } = await params;
  const { answer, question } = ownAnswer(user.id, answerId);
  const concept = question.conceptId ? db.select().from(s.concepts).where(eq(s.concepts.id, question.conceptId)).get() : undefined;
  const existing = db.select().from(s.followups).where(and(eq(s.followups.answerId, answerId), eq(s.followups.studentId, user.id))).get();
  const activity = db.select().from(s.activities).where(and(eq(s.activities.answerId, answerId), eq(s.activities.studentId, user.id))).get();
  const gap = resultsFor([answerId]).find((r) => r.result.status !== "met");
  const slide = slideRef(gap?.criterion.slideId);
  const opening = answer.followupQuestion ?? "Which part of this question felt unclear?";
  const isKeys = /primary key/i.test(question.prompt);

  return (
    <FollowupChat
      answerId={answerId}
      title={`Quick check · ${concept?.name ?? `Q${question.number}`}`}
      excerpt={answer.transcription}
      intro={`Your key is right. One question to see what you were thinking:`}
      opening={opening}
      initial={existing?.messages ?? []}
      initialBranch={existing?.branch ?? null}
      initialDone={existing?.resolved ?? false}
      initialActivityId={activity?.id ?? null}
      quickReplies={
        isKeys
          ? ["Their StudentIDs would still be different, so we can tell them apart", "They could also share a number, so we'd need the name too"]
          : []
      }
      slide={slide ? { id: slide.id, lecture: slide.lectureNumber, page: slide.page, title: slide.title } : null}
      showIntro={isKeys}
    />
  );
}
