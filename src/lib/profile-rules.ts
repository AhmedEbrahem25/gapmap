import type { ActivityType, Confidence } from "./db/schema";

/**
 * Rules that turn stored taps into the next suggestion. No AI: every rule reads the student's own
 * taps and the marks, and each one describes recent evidence, never the student's ability.
 */

export const CONFIDENCE_OPTIONS: { value: Confidence; label: string }[] = [
  { value: "sure", label: "Sure" },
  { value: "unsure", label: "Not sure" },
  { value: "guess", label: "Guessing" },
];

export const parseConfidence = (v: unknown): Confidence | null => (CONFIDENCE_OPTIONS.some((o) => o.value === v) ? (v as Confidence) : null);

/** A fresh test counts as right at 80%, the same bar that closes a concept. */
export const isRight = (score: number, max: number) => max > 0 && score / max >= 0.8;

export type Calibration = "matched" | "underconfident" | "overconfident";

/** Compares how sure the student said they were with how the answer went. */
export function calibration(right: boolean, confidence: Confidence | null): Calibration | null {
  if (!confidence) return null;
  if (right && confidence !== "sure") return "underconfident";
  if (!right && confidence === "sure") return "overconfident";
  return "matched";
}

export const CALIBRATION_NOTE: Record<Calibration, { title: string; body: string }> = {
  underconfident: {
    title: "Right, but you weren't sure",
    body: "One more quick question on this will show whether it holds. Getting it right again is what makes it stick.",
  },
  overconfident: {
    title: "You were sure, but this one was off",
    body: "That often means two ideas are mixed up. Compare the right answer with yours, then look at the slide before your next try.",
  },
  matched: { title: "", body: "" },
};

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  experiment: "Experiments",
  mind_map: "Mind maps",
  worked_example: "Worked examples",
  try_first: "Trying it first",
  own_words: "Explaining it",
};

/** Ratings in a row that make GapMap suggest another approach. */
export const NOT_HELPING_IN_A_ROW = 2;

/**
 * When the student's preferred activity type got "not really" on its last two rated activities,
 * suggest switching. The student decides; nothing changes on its own.
 */
export function shouldSuggestSwitch(rated: { type: ActivityType; usefulness: string | null }[], preferred: ActivityType | null) {
  if (!preferred) return false;
  const last = rated.filter((r) => r.type === preferred && r.usefulness).slice(-NOT_HELPING_IN_A_ROW);
  return last.length === NOT_HELPING_IN_A_ROW && last.every((r) => r.usefulness === "not_really");
}

/** The note shown on an activity whose type changed, so the student can see why. */
export const changedReason = (from: ActivityType, to: ActivityType, why: string) =>
  `Changed ${why}: ${ACTIVITY_LABEL[to].toLowerCase()} instead of ${ACTIVITY_LABEL[from].toLowerCase()}.`;
