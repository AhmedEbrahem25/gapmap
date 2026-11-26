/**
 * Deterministic "demo mode" logic used when no ANTHROPIC_API_KEY is set,
 * or when a live call fails. It keeps every screen working offline (e.g. on
 * hackathon Wi-Fi) and gives the same shape of output as the Claude pipelines.
 */
import type { ActivityType, CriterionStatus } from "../db/schema";

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
  if (branch === "understands") {
    return `Exactly — that's uniqueness. No two records can share the key, so it always points to one ${concept === "Primary keys" ? "student" : "record"}. Add that reason to your answer, then try a fresh question to lock it in.`;
  }
  if (branch === "misconception") {
    return "Good thing to check. A primary key must be unique: the database refuses two rows with the same key. Let's see why that matters with a quick experiment.";
  }
  return "Let's make it concrete. If two students are both called “Mariam Adel”, how would the database know which one you mean when you update a grade?";
}

export function profileFromAnswers(a: Record<string, string>): {
  traits: string[];
  preferred: ActivityType;
  minutes: number;
  summary: string;
} {
  const all = Object.values(a).join(" ").toLowerCase();
  const traits: string[] = [];
  let preferred: ActivityType = "worked_example";
  if (/try|experiment|figure|myself|test/.test(all)) {
    traits.push("Tries things first");
    preferred = "experiment";
  }
  if (/map|diagram|connect|draw|relationship/.test(all)) {
    traits.push("Connects ideas visually");
    if (preferred === "worked_example") preferred = "mind_map";
  }
  if (/example|video|watch|see how/.test(all)) traits.push("Stuck → looks for an example");
  if (/explain|teach|write|own words/.test(all)) {
    traits.push("Learns by explaining");
    if (preferred === "worked_example") preferred = "own_words";
  }
  if (/friend|group|ask/.test(all)) traits.push("Asks others when stuck");
  const m = all.match(/(\d{1,3})\s*(min|minute|m\b)/);
  const h = all.match(/(\d(?:\.\d)?)\s*(hour|hr)/);
  const minutes = m ? Number(m[1]) : h ? Math.round(Number(h[1]) * 60) : 30;
  traits.push(`~${minutes} min a day`);
  if (traits.length === 1) traits.unshift("Steady reader");
  const label: Record<ActivityType, string> = {
    experiment: "short experiments before reading",
    mind_map: "mapping how ideas connect",
    worked_example: "worked examples you can follow step by step",
    own_words: "explaining ideas in your own words",
    try_first: "trying a problem before the solution",
  };
  return {
    traits,
    preferred,
    minutes,
    summary: `You seem to learn best through ${label[preferred]}, with about ${minutes} minutes a day. You can change this at any time.`,
  };
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

export function checkExplanationHeuristic(text: string) {
  const t = text.toLowerCase();
  const good = /(same|duplicate|two rows|both|not unique|repeat|share)/.test(t) && /(id|key|studentid|1042)/.test(t);
  return good
    ? {
        ok: true,
        feedback:
          "Yes. The WHERE clause matched both rows because they share StudentID 1042, so the update hit both. A primary key prevents that by refusing duplicate values.",
      }
    : {
        ok: false,
        feedback:
          "Close. Look at the WHERE clause: which rows have StudentID = 1042? Explain why the update could not tell Mariam and Omar apart.",
      };
}
