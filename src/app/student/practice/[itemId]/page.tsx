import type { Metadata } from "next";
import { and, asc, eq, ne } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { masteryByConcept } from "@/lib/data";
import { StudentHeader } from "@/components/shell/student-header";
import { StatusChip, statusFromRatio } from "@/components/ui/badge";
import { HighlightedText } from "@/components/ui/quote";
import { AnimatedBar, Stagger, StaggerItem } from "@/components/ui/motion";
import { ButtonLink } from "@/components/ui/button";
import { RetestForm } from "./retest-form";
import { fmtMarks } from "@/lib/utils";

export const metadata: Metadata = { title: "Fresh test" };

const color = { met: "#0F766E", partial: "#B45309", missing: "#B91C1C" } as const;

export default async function RetestPage({ params }: PageProps<"/student/practice/[itemId]">) {
  const user = await requireRole("student");
  const { itemId } = await params;
  const item = db.select().from(s.practiceItems).where(and(eq(s.practiceItems.id, itemId), eq(s.practiceItems.studentId, user.id))).get();
  if (!item) notFound();
  const concept = db.select().from(s.concepts).where(eq(s.concepts.id, item.conceptId)).get()!;
  const before = db
    .select()
    .from(s.attempts)
    .where(and(eq(s.attempts.studentId, user.id), eq(s.attempts.conceptId, item.conceptId), ne(s.attempts.source, "retest")))
    .orderBy(asc(s.attempts.date))
    .all()
    .filter((a) => a.source === "exam")
    .at(-1);
  const answered = item.score !== null && item.result;
  const beforeStatus = before ? statusFromRatio(before.score, before.maxScore) : null;
  const afterStatus = answered ? statusFromRatio(item.score!, item.maxScore) : null;
  const mastery = masteryByConcept(user.id);
  const nextWeak = db
    .select()
    .from(s.concepts)
    .where(and(eq(s.concepts.courseId, concept.courseId), ne(s.concepts.id, concept.id)))
    .all()
    .map((c) => ({ c, m: mastery.get(c.id) }))
    .filter((x) => x.m && x.m.score / x.m.max < 0.8)
    .sort((a, b) => a.m!.score / a.m!.max - b.m!.score / b.m!.max)[0]?.c;

  return (
    <>
      <StudentHeader
        back="/student/practice"
        eyebrow={`Practice · Fresh test`}
        title={answered ? (afterStatus === "met" ? `${concept.name}: you've got it` : `${concept.name}: getting closer`) : concept.name}
      />
      <Stagger className="flex flex-col gap-3 px-5">
        {answered && before ? (
          <StaggerItem>
            <section aria-label="Change" className="flex flex-col gap-3 rounded-sheet border border-line bg-white p-4">
              <div className="flex items-center gap-2.5">
                <StatusChip status={beforeStatus!} />
                <ArrowRight size={18} className="text-ink-2" aria-hidden />
                <StatusChip status={afterStatus!} />
              </div>
              {[
                [before.label, before.score, before.maxScore, beforeStatus!],
                ["Fresh test", item.score!, item.maxScore, afterStatus!],
              ].map(([label, sc, mx, st], i) => (
                <div key={label as string} className="grid grid-cols-[96px_1fr_40px] items-center gap-2 text-sm">
                  <span className="truncate text-ink-2">{label}</span>
                  <AnimatedBar value={((sc as number) / (mx as number)) * 100} color={color[st as keyof typeof color]} height={10} delay={0.2 + i * 0.25} />
                  <strong>
                    {fmtMarks(sc as number)}/{fmtMarks(mx as number)}
                  </strong>
                </div>
              ))}
            </section>
          </StaggerItem>
        ) : null}
        <StaggerItem>
          <section className="flex flex-col gap-2.5 rounded-sheet border border-line bg-white p-4">
            <p className="text-sm text-ink-2">New question</p>
            <p className="text-base leading-[22px] font-semibold">{item.prompt}</p>
            {answered ? (
              <>
                <p className="rounded-[10px] bg-ground px-3 py-2.5 text-sm leading-[21px]">
                  “<HighlightedText text={item.answer!} marks={item.result!.filter((r) => r.evidence).map((r) => ({ quote: r.evidence, tone: r.status }))} />”
                </p>
                <ul className="flex flex-col gap-1.5">
                  {item.criteria.map((c) => {
                    const r = item.result!.find((x) => x.code === c.code);
                    return (
                      <li key={c.code} className="flex items-start justify-between gap-2 text-sm">
                        <span>
                          {c.description}
                          {r && r.status !== "met" && r.gap ? <span className="block text-xs text-ink-2">{r.gap}</span> : null}
                        </span>
                        {r ? <StatusChip status={r.status} /> : null}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <RetestForm itemId={item.id} options={item.options} />
            )}
          </section>
        </StaggerItem>
        {answered ? (
          <StaggerItem className="flex flex-col gap-2">
            <ButtonLink size="lg" href={afterStatus === "met" ? "/student/practice" : `/student/plan`}>
              {afterStatus === "met" ? `Next gap${nextWeak ? `: ${nextWeak.name}` : ""}` : "Back to my study plan"}
            </ButtonLink>
          </StaggerItem>
        ) : null}
      </Stagger>
    </>
  );
}
