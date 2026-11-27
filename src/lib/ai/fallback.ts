/**
 * Deterministic "demo mode" logic used when no ANTHROPIC_API_KEY is set,
 * or when a live call fails. It keeps every screen working offline (e.g. on
 * hackathon Wi-Fi) and gives the same shape of output as the Claude pipelines.
 */
import type { CriterionStatus, FollowupChoice } from "../db/schema";

const STOP = new Set(
  "the a an and or of to in on for is are be it its that this with as by from at which each every must should can not no into their they them have has was were will".split(
    " ",
  ),
);

export function keywords(text: string) {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9؀-ۿ\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOP.has(w)),
    ),
  );
}

/** Concept-specific cue words that signal a criterion is addressed. */
const CUES: Record<string, string[]> = {
  unique: ["unique", "uniquely", "distinct", "different", "no two", "not repeat", "never repeat", "duplicate", "only one", "same id", "identify each", "share"],
  change: ["change", "changes", "fixed", "stable", "null", "empty", "never changes", "stays"],
  key: ["studentid", "student_id", "student id", "id", "coursecode", "course code", "primary key"],
  foreign: ["foreign", "references", "refer", "link", "points to"],
  join: ["join", "inner join", " on ", "where"],
};

function cueGroup(desc: string): string[] {
  const d = desc.toLowerCase();
  if (/unique|distinct|uniqueness/.test(d)) return CUES.unique!;
  if (/change|empty|null/.test(d)) return CUES.change!;
  if (/foreign|refer|link/.test(d)) return CUES.foreign!;
  if (/join|query/.test(d)) return CUES.join!;
  if (/names? a suitable|primary key|key/.test(d)) return CUES.key!;
  return [];
}

export function findQuote(transcription: string, cues: string[]): string {
  const t = transcription;
  const lower = t.toLowerCase();
  const sentences = t.split(/(?<=[.!?\n])\s*/).filter(Boolean);
  for (const s of sentences) {
    const sl = s.toLowerCase();
    if (cues.some((c) => sl.includes(c.trim()))) return s.trim().replace(/[.]$/, "");
  }
  for (const c of cues) {
    const i = lower.indexOf(c.trim());
    if (i >= 0) return t.slice(i, i + c.trim().length);
  }
  return "";
}

export function heuristicMatch(
  transcription: string,
  criteria: { code: string; description: string; marks: number }[],
): { code: string; status: CriterionStatus; evidence: string; gap: string; marks: number; confidence: number }[] {
  const lower = transcription.toLowerCase();
  return criteria.map((c) => {
    const cues = cueGroup(c.description);
    const kw = keywords(c.description);
    const cueHits = cues.filter((q) => lower.includes(q.trim())).length;
    const kwHits = kw.filter((k) => lower.includes(k)).length;
    const score = cueHits * 2 + kwHits;
    let status: CriterionStatus = score >= 3 ? "met" : score >= 1 ? "partial" : "missing";
    // A justification that only restates the column ("because it is the student number")
    // describes rather than justifies.
    if (/unique|distinct/.test(c.description.toLowerCase()) && /because it is the (student )?number/.test(lower) && cueHits === 0) {
      status = "partial";
    }
    const evidence = status === "missing" ? "" : findQuote(transcription, cues.length ? cues : kw);
    const marks = status === "met" ? c.marks : status === "partial" ? Math.round((c.marks / 2) * 2) / 2 : 0;
    const gap =
      status === "met"
        ? ""
        : status === "partial"
          ? `Mentions the idea but does not fully explain: ${c.description.toLowerCase()}.`
          : `Not addressed in the answer: ${c.description.toLowerCase()}.`;
    return { code: c.code, status, evidence, gap, marks, confidence: 0.62 };
  });
}

export function classifyFollowupReply(reply: string): "understands" | "misconception" | "unclear" {
  const r = reply.toLowerCase();
  if (/(would|could|might|can) (also )?(share|repeat|be the same)|same number|need the name|also share|repeat/.test(r)) {
    return "misconception";
  }
  if (/(different|unique|distinct|tell them apart|still|no two|not the same|only one)/.test(r)) return "understands";
  return "unclear";
}

export function followupResponse(branch: "understands" | "misconception" | "unclear", concept: string) {
  const keys = concept === "Primary keys";
  if (branch === "understands") {
    return keys
      ? "Exactly — that's uniqueness. No two records can share the key, so it always points to one student. Add that reason to your answer, then try a fresh question to lock it in."
      : `Exactly — that's the idea behind ${concept}. Add that reason to your answer, then try a fresh question to lock it in.`;
  }
  if (branch === "misconception") {
    return keys
      ? "Good thing to check. A primary key must be unique: the database refuses two rows with the same key. Let's see why that matters with a quick experiment."
      : `Good thing to check: that's a common mix-up with ${concept}. Read the slide below, then a short activity will show why.`;
  }
  return keys
    ? "Let's make it concrete. If two students are both called “Mariam Adel”, how would the database know which one you mean when you update a grade?"
    : `No problem. The slide below explains ${concept}; a short activity comes next.`;
}

/** Tap replies to a follow-up question when the AI is off: one per branch. */
export function followupChoicesFor(question: string): FollowupChoice[] {
  if (/primary key/i.test(question)) {
    return [
      { text: "Their StudentIDs would still be different, so we can tell them apart", branch: "understands" },
      { text: "They could also share a number, so we'd need the name too", branch: "misconception" },
      { text: "I'm not sure", branch: "unclear" },
    ];
  }
  return [
    { text: "I know why — I just wrote it too briefly", branch: "understands" },
    { text: "I thought describing it was enough", branch: "misconception" },
    { text: "I'm not sure why it matters", branch: "unclear" },
  ];
}

export function retestBank(concept: string): { prompt: string; criteria: { code: string; description: string; marks: number }[] } {
  const c = concept.toLowerCase();
  if (c.includes("primary")) {
    return {
      prompt: "Choose a primary key for the Course table (CourseCode, Title, Credits, Instructor) and justify your choice.",
      criteria: [
        { code: "C1", description: "Names a suitable primary key (CourseCode)", marks: 1 },
        { code: "C2", description: "Explains that no two courses can share the value (uniqueness)", marks: 2 },
        { code: "C3", description: "Notes the value should not change or be empty", marks: 1 },
      ],
    };
  }
  if (c.includes("foreign")) {
    return {
      prompt: "An Enrollment table has (StudentID, CourseCode, Term). Which columns are foreign keys, and what do they reference?",
      criteria: [
        { code: "C1", description: "Identifies StudentID and CourseCode as foreign keys", marks: 2 },
        { code: "C2", description: "States each references the primary key of Student / Course", marks: 2 },
      ],
    };
  }
  if (c.includes("join")) {
    return {
      prompt: "Write a query that lists each student's name with the title of every course they are enrolled in.",
      criteria: [
        { code: "C1", description: "Joins Student, Enrollment and Course", marks: 2 },
        { code: "C2", description: "Uses the correct join conditions on the foreign keys", marks: 2 },
      ],
    };
  }
  return {
    prompt: `Explain the key idea of ${concept} with an example from a university database.`,
    criteria: [
      { code: "C1", description: `States the definition of ${concept}`, marks: 2 },
      { code: "C2", description: "Gives a correct example", marks: 2 },
    ],
  };
}

/**
 * Offline check of a student's explanation. With the experiment's checkFor words it needs most of
 * them; otherwise it needs a full sentence that reuses ideas from the slide.
 */
export function checkExplanationHeuristic(text: string, ref: { checkFor?: string[]; reference?: string; answer?: string } = {}) {
  const t = text.toLowerCase();
  const checkFor = ref.checkFor ?? [];
  const ok = checkFor.length
    ? checkFor.filter((w) => t.includes(w.toLowerCase())).length >= Math.min(2, checkFor.length)
    : t.split(/\s+/).length >= 8 && keywords(ref.reference ?? "").filter((k) => t.includes(k)).length >= 2;
  return ok
    ? { ok: true, feedback: ref.answer ? `Yes. ${ref.answer}` : "Yes, that is the idea on the slide. Put it in your own exam answer too, then take a fresh test to lock it in." }
    : {
        ok: false,
        feedback: checkFor.length
          ? "Close. Look again at the result: which rows or values were affected, and what rule would have stopped it?"
          : "Close. Reuse the key idea from the slide in your own words, and say why it matters.",
      };
}

/** Offline explanation: the slide's own sentences, so it is always grounded and cited. */
export function explainFromSlide(slideTitle: string, slideBody: string): string {
  const body = slideBody.trim();
  if (!body) return "";
  const sentences = body.split(/(?<=[.!?])\s+/).filter(Boolean);
  let out = "";
  for (const s of sentences) {
    if ((out + " " + s).trim().length > 240) break;
    out = (out + " " + s).trim();
  }
  return `${slideTitle}: ${out || body.slice(0, 240)}`;
}
