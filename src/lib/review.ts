/**
 * Rules that decide which AI-marked answers a reviewer must open one by one.
 * Everything else can be approved per question in one step.
 */
export const READABILITY_MIN = 0.7;
export const AI_CONFIDENCE_MIN = 0.6;

type FlagAnswer = { confidence: number; transcription: string; paperMarks: number | null; paperMarkConfidence: number };
type FlagResult = { aiConfidence: number; explanation: string; citedSlideId: string | null; marks: number };

/** Marks come from the instructor's pen. These rules decide what a reviewer must still check by hand. */
export function answerFlags(answer: FlagAnswer, results: FlagResult[], maxMarks: number): string[] {
  const flags: string[] = [];
  if (answer.paperMarks === null) flags.push("Mark not found");
  else if (answer.paperMarkConfidence < READABILITY_MIN) flags.push("Mark hard to read");
  if (!results.length) flags.push("Not diagnosed yet");
  if (answer.transcription && answer.confidence < READABILITY_MIN) flags.push("Hard to read");
  if (results.some((r) => r.aiConfidence < AI_CONFIDENCE_MIN)) flags.push("Low AI confidence");
  if (results.some((r) => r.explanation && !r.citedSlideId)) flags.push("Uncited explanation");
  // The diagnosis should explain the instructor's mark; a big gap means one of them needs a look.
  if (answer.paperMarks !== null && results.length) {
    const diagnosed = results.reduce((t, r) => t + r.marks, 0);
    if (Math.abs(diagnosed - answer.paperMarks) >= Math.max(1, maxMarks / 4)) flags.push("Diagnosis disagrees with the mark");
  }
  return flags;
}

/** A concept goes on "What to re-teach" when at least this share of the class has a gap in it. */
export const RETEACH_SHARE = 40;

/** Share of AI feedback a reviewer approved without editing (outline target: at least 80%). */
export function approvedWithoutEdits(results: { edited: boolean }[]) {
  if (!results.length) return null;
  return Math.round((results.filter((r) => !r.edited).length / results.length) * 100);
}
