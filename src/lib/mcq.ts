import type { ChainStep } from "./db/schema";
import { isGroundedIn } from "./ai/quotes";

/**
 * Multiple-choice rules. Scoring is plain rules on the answer key; the AI only writes the
 * Socratic-style fix for wrong options, from the question, the options and the slides.
 */
export const LETTERS = ["A", "B", "C", "D", "E"] as const;

/** Most chains written per quiz (one per question and wrong option that students chose). */
export const CHAINS_PER_QUIZ = 30;

/** Reads a chosen option from an import cell or a scan: "b", "B)", "(C)", "Option D" → the letter. */
export function parseChoice(cell: string | null | undefined, optionCount = 4): string | null {
  const m = String(cell ?? "").trim().toUpperCase().match(/^(?:OPTION\s*)?\(?([A-E])\)?[.)]?$/);
  if (!m) return null;
  return LETTERS.indexOf(m[1] as (typeof LETTERS)[number]) < optionCount ? m[1]! : null;
}

export const scoreChoice = (chosen: string | null, correct: string | null, maxMarks: number) => (chosen && correct && chosen === correct ? maxMarks : 0);

/** Wrong options students chose, most common first, capped for the whole quiz. */
export function chainTargets(
  questions: { id: string; correctOption: string | null }[],
  answers: { questionId: string; chosenOption: string | null }[],
  cap = CHAINS_PER_QUIZ,
) {
  const counts = new Map<string, { questionId: string; option: string; count: number }>();
  for (const a of answers) {
    const q = questions.find((x) => x.id === a.questionId);
    // Without a key nobody knows which options are wrong, so no chain yet.
    if (!q?.correctOption || !a.chosenOption || a.chosenOption === q.correctOption) continue;
    const key = `${q.id}:${a.chosenOption}`;
    const entry = counts.get(key) ?? { questionId: q.id, option: a.chosenOption, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, cap);
}

/**
 * Puts the right choice of each step in a different place (the AI tends to list it first), the same
 * way every time, so a student can't learn "the first one is right".
 */
export function mixChoices(steps: ChainStep[], seed: string): ChainStep[] {
  const base = [...seed].reduce((n, ch) => n + ch.charCodeAt(0), 0);
  return steps.map((s, i) => {
    const right = s.choices.find((c) => c.correct)!;
    const others = s.choices.filter((c) => c !== right);
    const at = (base + i + 1) % s.choices.length;
    return { ...s, choices: [...others.slice(0, at), right, ...others.slice(at)] };
  });
}

/** A chain is usable when every step has 2–4 choices and exactly one right one. */
export function chainIsWellFormed(steps: ChainStep[]) {
  return steps.length >= 1 && steps.length <= 3 && steps.every((s) => s.prompt.trim() && s.choices.length >= 2 && s.choices.length <= 4 && s.choices.filter((c) => c.correct).length === 1);
}

/** Hints and the explanation must stay on the slide; otherwise the chain is uncited and flagged. */
export function chainIsGrounded(chain: { steps: ChainStep[]; explanation: string }, slideText: string) {
  return isGroundedIn(chain.explanation, slideText) && chain.steps.every((s) => !s.hint.trim() || isGroundedIn(s.hint, slideText));
}

/** Offline chain from the slide's own words: always cited, used when no AI key is set or the AI fails. */
export function chainFromSlide(input: {
  question: string;
  options: string[];
  correct: string;
  chosen: string;
  slide: { title: string; body: string };
}): { misconception: string; steps: ChainStep[]; explanation: string } {
  const at = (l: string) => input.options[LETTERS.indexOf(l as (typeof LETTERS)[number])] ?? l;
  const right = at(input.correct);
  const wrong = at(input.chosen);
  const fact = input.slide.body.split(/(?<=[.!?])\s+/)[0] ?? input.slide.body;
  const other = input.options.find((o) => o !== right && o !== wrong);
  return {
    misconception: `Chose “${wrong}” instead of “${right}”.`,
    steps: [
      {
        prompt: `Which statement matches the slide “${input.slide.title}”?`,
        choices: [
          { text: `“${wrong}” is always the right answer here.`, correct: false },
          { text: fact, correct: true },
        ],
        hint: `${input.slide.title}: ${input.slide.body}`,
      },
      {
        prompt: `With that in mind: ${input.question}`,
        choices: [{ text: wrong, correct: false }, ...(other ? [{ text: other, correct: false }] : []), { text: right, correct: true }],
        hint: `${input.slide.title}: ${fact}`,
      },
    ],
    explanation: `${input.slide.title}: ${input.slide.body}`,
  };
}

/**
 * Splits an exam file's text into questions: "1. …" or "I.1. …", then options "A. …" to "E. …".
 * Used when the AI is off; with the AI on, it reads the file instead.
 */
export function parseExamText(text: string): { number: number; prompt: string; options: string[] }[] {
  const flat = text
    .replace(/Page \d+ of \d+/gi, " ")
    .replace(/Student Name:[.…\s]*/gi, " ")
    .replace(/\s+/g, " ");
  const parts = flat.split(/(?:^|\s)(?:[IVX]+\.)?(\d{1,2})\.\s+(?=[A-Z“"(])/);
  const out: { number: number; prompt: string; options: string[] }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const body = parts[i + 1] ?? "";
    const pieces = body.split(/\s([A-E])\.\s/);
    const prompt = pieces[0]!.trim();
    const options: string[] = [];
    for (let k = 1; k < pieces.length; k += 2) options.push(pieces[k + 1]!.trim());
    if (prompt.length > 8) out.push({ number: Number(parts[i]), prompt, options: options.length >= 2 ? options : [] });
  }
  return out;
}

/** Reads a typed key such as "C B A C", "1C 2B 3A" or "C,B,_,A" (blank or _ = no key yet). */
export function parseKey(text: string): (string | null)[] {
  return String(text ?? "")
    .toUpperCase()
    .replace(/\d+\s*[.):-]?\s*(?=[A-E_?])/g, " ")
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((x) => (/^[A-E]$/.test(x) ? x : null));
}
