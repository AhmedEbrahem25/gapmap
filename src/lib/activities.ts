import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "./db";
import { chooseActivity, draftExperiment, type ActivitySlide, type ExperimentPayload } from "./ai/pipelines";
import type { ActivityType } from "./db/schema";

/** The slide an activity points to: the one linked to the student's gap, else the concept's first tagged slide. */
function activitySlide(conceptId: string, answerId?: string | null): ActivitySlide | null {
  const cols = { id: s.slides.id, page: s.slides.page, title: s.slides.title, body: s.slides.body, lecture: s.lectures.number };
  if (answerId) {
    const gapSlide = db
      .select(cols)
      .from(s.criterionResults)
      .innerJoin(s.criteria, eq(s.criteria.id, s.criterionResults.criterionId))
      .innerJoin(s.slides, eq(s.slides.id, s.criteria.slideId))
      .innerJoin(s.lectures, eq(s.lectures.id, s.slides.lectureId))
      .where(and(eq(s.criterionResults.answerId, answerId), inArray(s.criterionResults.status, ["partial", "missing"])))
      .get();
    if (gapSlide) return gapSlide;
  }
  return (
    db
      .select(cols)
      .from(s.slideConcepts)
      .innerJoin(s.slides, eq(s.slides.id, s.slideConcepts.slideId))
      .innerJoin(s.lectures, eq(s.lectures.id, s.slides.lectureId))
      .where(and(eq(s.slideConcepts.conceptId, conceptId), eq(s.slideConcepts.status, "confirmed")))
      .orderBy(asc(s.lectures.number), asc(s.slides.page))
      .get() ?? null
  );
}

/** One experiment per concept, drafted by the AI from the slides the first time it is needed, then reused. */
async function conceptExperiment(concept: typeof s.concepts.$inferSelect): Promise<ExperimentPayload | null> {
  const cached = concept.activityCache?.experiment as ExperimentPayload | undefined;
  if (cached) return cached;
  const slides = db
    .select({ title: s.slides.title, body: s.slides.body })
    .from(s.slideConcepts)
    .innerJoin(s.slides, eq(s.slides.id, s.slideConcepts.slideId))
    .where(and(eq(s.slideConcepts.conceptId, concept.id), eq(s.slideConcepts.status, "confirmed")))
    .limit(6)
    .all();
  const drafted = await draftExperiment({ concept: concept.name, description: concept.description, slides });
  if (drafted) db.update(s.concepts).set({ activityCache: { ...concept.activityCache, experiment: drafted } }).where(eq(s.concepts.id, concept.id)).run();
  return drafted;
}

export async function activityFor(input: {
  conceptId: string;
  branch: "understands" | "misconception" | "unclear" | null;
  preferred: ActivityType;
  answerId?: string | null;
}) {
  const concept = db.select().from(s.concepts).where(eq(s.concepts.id, input.conceptId)).get();
  if (!concept) return null;
  const experiment = input.preferred === "experiment" && input.branch !== "understands" ? await conceptExperiment(concept) : null;
  return chooseActivity({ concept: concept.name, branch: input.branch, preferred: input.preferred, slide: activitySlide(concept.id, input.answerId), experiment });
}
