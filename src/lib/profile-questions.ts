import type { ActivityType } from "./db/schema";

/**
 * The 5-question study check-in (habits, time, goals). Every answer is a tap, and the
 * profile is built by the rules below: nothing the student picks is sent to the AI.
 */
export const PROFILE_QUESTIONS = [
  {
    key: "habit",
    label: "When you revise, what do you mostly do?",
    options: [
      { value: "reread", label: "Reread my slides or notes" },
      { value: "highlight", label: "Highlight or summarise" },
      { value: "self_test", label: "Test myself without notes" },
      { value: "practice", label: "Solve practice questions" },
    ],
  },
  {
    key: "stuck",
    label: "When you're stuck, what helps you most?",
    options: [
      { value: "worked_example", label: "Following a worked example" },
      { value: "experiment", label: "Trying small changes myself" },
      { value: "mind_map", label: "Drawing how the ideas connect" },
      { value: "own_words", label: "Explaining it in my own words" },
    ],
  },
  {
    key: "timing",
    label: "When do you usually start revising for an exam?",
    options: [
      { value: "night_before", label: "The night before" },
      { value: "few_days", label: "A few days before" },
      { value: "spread", label: "A little every week" },
    ],
  },
  {
    key: "minutes",
    label: "How much time can you give this course on a normal day?",
    options: [
      { value: "15", label: "15 min" },
      { value: "30", label: "30 min" },
      { value: "45", label: "45 min" },
      { value: "60", label: "1 hour+" },
    ],
  },
  {
    key: "goal",
    label: "What is your main goal in this course?",
    options: [
      { value: "pass", label: "Pass with confidence" },
      { value: "grade", label: "Raise my grade" },
      { value: "master", label: "Master it for later courses" },
    ],
  },
] as const;

export type CheckinKey = (typeof PROFILE_QUESTIONS)[number]["key"];
export type CheckinAnswers = Partial<Record<CheckinKey, string>>;

const ACTIVITIES: ActivityType[] = ["worked_example", "experiment", "mind_map", "own_words", "try_first"];

function optionLabel(key: CheckinKey, value: string | undefined) {
  return PROFILE_QUESTIONS.find((q) => q.key === key)?.options.find((o) => o.value === value)?.label;
}

/** Keeps only values that exist in the check-in, so stored answers are always valid choices. */
export function cleanCheckin(raw: Record<string, unknown>): CheckinAnswers {
  const out: CheckinAnswers = {};
  for (const q of PROFILE_QUESTIONS) {
    const v = String(raw[q.key] ?? "");
    if (q.options.some((o) => o.value === v)) out[q.key] = v;
  }
  return out;
}

/** Rules, not AI: habits and time only, never ability. Nudges self-testing over rereading. */
export function profileFromCheckin(a: CheckinAnswers): {
  traits: string[];
  preferred: ActivityType;
  minutes: number;
  summary: string;
} {
  const preferred = ACTIVITIES.includes(a.stuck as ActivityType) ? (a.stuck as ActivityType) : "worked_example";
  // Students who already practise get the question before the explanation.
  const finalPreferred: ActivityType = a.habit === "practice" && preferred === "worked_example" ? "try_first" : preferred;
  const minutes = Number(a.minutes) || 30;
  const passive = a.habit === "reread" || a.habit === "highlight";
  const cramming = a.timing === "night_before";

  const traits = [
    optionLabel("habit", a.habit),
    a.stuck ? `Stuck → ${optionLabel("stuck", a.stuck)!.toLowerCase()}` : undefined,
    `~${minutes} min a day`,
    optionLabel("goal", a.goal),
  ].filter((t): t is string => !!t);

  const nudges: string[] = [];
  if (passive) nudges.push("Rereading feels productive, but testing yourself works better, so every step ends with a quick question.");
  if (cramming) nudges.push(`Short daily sessions beat one long night, so your plan comes in ${minutes}-minute steps.`);
  if (!passive && !cramming) nudges.push(`Your plan comes in ${minutes}-minute steps, each ending with a quick question.`);
  if (a.goal === "master") nudges.push("Concepts that later units build on come first.");

  const label: Record<ActivityType, string> = {
    experiment: "short experiments before reading",
    mind_map: "mapping how ideas connect",
    worked_example: "worked examples you can follow step by step",
    own_words: "explaining ideas in your own words",
    try_first: "trying a question before the explanation",
  };
  return {
    traits,
    preferred: finalPreferred,
    minutes,
    summary: `Activities start with ${label[finalPreferred]}. ${nudges.join(" ")} You can change this at any time.`,
  };
}
