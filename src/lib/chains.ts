import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "./db";
import { draftChain } from "./ai/pipelines";
import { keywords } from "./ai/fallback";
import { chainTargets } from "./mcq";

/** The concept's slides closest to the question and the wrong option (the AI may use only these). */
function chainSlides(question: typeof s.questions.$inferSelect, optionText: string) {
  if (!question.conceptId) return [];
  const words = keywords(`${question.prompt} ${optionText}`);
  return db
    .select({ id: s.slides.id, page: s.slides.page, title: s.slides.title, body: s.slides.body, lecture: s.lectures.number })
    .from(s.slideConcepts)
    .innerJoin(s.slides, eq(s.slides.id, s.slideConcepts.slideId))
    .innerJoin(s.lectures, eq(s.lectures.id, s.slides.lectureId))
    .where(and(eq(s.slideConcepts.conceptId, question.conceptId), eq(s.slideConcepts.status, "confirmed")))
    .orderBy(asc(s.lectures.number), asc(s.slides.page))
    .all()
    .map((sl) => ({ sl, hits: words.filter((w) => `${sl.title} ${sl.body}`.toLowerCase().includes(w)).length }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3)
    .map((x) => x.sl);
}

/**
 * Writes the missing chains for a quiz: one per question and wrong option that students chose,
 * most common first, up to 30. Rules pick the options; the AI only writes the chain.
 */
export async function draftChainsForExam(examId: string) {
  const questions = db.select().from(s.questions).where(and(eq(s.questions.examId, examId), eq(s.questions.kind, "mcq"))).all();
  if (!questions.length) return 0;
  const answers = db
    .select({ questionId: s.answers.questionId, chosenOption: s.answers.chosenOption })
    .from(s.answers)
    .where(inArray(s.answers.questionId, questions.map((q) => q.id)))
    .all();
  const existing = db.select({ questionId: s.chains.questionId, option: s.chains.option }).from(s.chains).where(inArray(s.chains.questionId, questions.map((q) => q.id))).all();
  let written = 0;
  for (const target of chainTargets(questions, answers)) {
    if (existing.some((c) => c.questionId === target.questionId && c.option === target.option)) continue;
    const q = questions.find((x) => x.id === target.questionId)!;
    const options = q.options ?? [];
    const optionText = options["ABCDE".indexOf(target.option)] ?? "";
    try {
      const chain = await draftChain({ question: q.prompt, options, correct: q.correctOption ?? "", chosen: target.option, slides: chainSlides(q, optionText) });
      db.insert(s.chains)
        .values({ id: crypto.randomUUID(), questionId: q.id, option: target.option, misconception: chain.misconception, steps: chain.steps, explanation: chain.explanation, citedSlideId: chain.citedSlideId, model: chain.model })
        .run();
      written++;
    } catch (e) {
      console.warn("[chains] could not write a chain for", q.id, target.option, e);
    }
  }
  return written;
}

/** The approved, cited chain a student may tap through for their wrong option. */
export function chainForAnswer(questionId: string, chosenOption: string | null) {
  if (!chosenOption) return null;
  return (
    db
      .select()
      .from(s.chains)
      .where(and(eq(s.chains.questionId, questionId), eq(s.chains.option, chosenOption), eq(s.chains.status, "approved")))
      .get() ?? null
  );
}
