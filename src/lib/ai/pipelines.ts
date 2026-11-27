import "server-only";
import { z } from "zod";
import { aiEnabled, structured, type Attachment } from "./client";
import * as fb from "./fallback";
import type { ActivityType, ChainStep, CriterionStatus } from "../db/schema";
import { LETTERS, chainFromSlide, chainIsGrounded, chainIsWellFormed, mixChoices } from "../mcq";

/* Shared guardrails added to every system prompt. */
const GROUNDING = `You work inside GapMap, a tool that helps university instructors give exam feedback.
Rules: Only use the student's own words and the course's own lecture slides as evidence.
Quotes must be copied verbatim from the transcription. Never invent marks for criteria that do not exist.
Be concise, kind and specific. Write for an undergraduate student.`;

import { validateQuote, isGroundedIn, slideLabel } from "./quotes";
export { validateQuote };

/* ───────── 6.1 Lecture ingestion: concept tagging ───────── */

export async function tagSlides(
  concepts: { id: string; name: string; description?: string | null }[],
  slides: { id: string; page: number; title: string; body: string }[],
): Promise<{ slideId: string; conceptIds: string[] }[]> {
  if (aiEnabled()) {
    try {
      const { data } = await structured({
        name: "tag_slides",
        description: "Tag each slide with the course concepts it teaches.",
        schema: z.object({ tags: z.array(z.object({ page: z.number(), concepts: z.array(z.string()) })) }),
        jsonSchema: {
          type: "object",
          properties: {
            tags: {
              type: "array",
              items: {
                type: "object",
                properties: { page: { type: "number" }, concepts: { type: "array", items: { type: "string" } } },
                required: ["page", "concepts"],
              },
            },
          },
          required: ["tags"],
        },
        system: GROUNDING,
        kind: "fast",
        prompt: `Course concepts:\n${concepts.map((c) => `- ${c.name}${c.description ? `: ${c.description}` : ""}`).join("\n")}\n\nSlides:\n${slides
          .map((s) => `[page ${s.page}] ${s.title}\n${s.body.slice(0, 600)}`)
          .join("\n\n")}\n\nFor each slide, list the names of 0–2 concepts it actually teaches (use the exact names above).`,
      });
      const byName = new Map(concepts.map((c) => [c.name.toLowerCase(), c.id]));
      return slides.map((s) => {
        const t = data.tags.find((x) => x.page === s.page);
        return {
          slideId: s.id,
          conceptIds: (t?.concepts ?? []).map((n) => byName.get(n.toLowerCase())).filter((x): x is string => !!x),
        };
      });
    } catch (e) {
      console.warn("[ai] tagSlides fell back:", e);
    }
  }
  return slides.map((s) => {
    const text = `${s.title} ${s.body}`.toLowerCase();
    const ids = concepts
      .filter((c) => {
        const words = c.name.toLowerCase().replace(/s\b/, "").split(/[ &]+/).filter((w) => w.length > 3);
        return words.length > 0 && words.every((w) => text.includes(w));
      })
      .slice(0, 2)
      .map((c) => c.id);
    return { slideId: s.id, conceptIds: ids };
  });
}

/* ───────── 6.2 Rubric drafting ───────── */

export async function draftRubric(input: {
  prompt: string;
  modelAnswer: string;
  maxMarks: number;
  concepts: string[];
}): Promise<{ description: string; marks: number; concept: string | null }[]> {
  if (aiEnabled()) {
    try {
      const { data } = await structured({
        name: "draft_rubric",
        description: "Draft marking criteria from a model answer.",
        schema: z.object({
          criteria: z.array(z.object({ description: z.string(), marks: z.number(), concept: z.string().nullable() })),
        }),
        jsonSchema: {
          type: "object",
          properties: {
            criteria: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string", description: "One observable idea the answer must contain, max 14 words" },
                  marks: { type: "number" },
                  concept: { type: ["string", "null"] },
                },
                required: ["description", "marks", "concept"],
              },
            },
          },
          required: ["criteria"],
        },
        system: GROUNDING,
        prompt: `Question: ${input.prompt}\nModel answer: ${input.modelAnswer || "(not given: work from the question and the course concepts)"}\nTotal marks: ${input.maxMarks}\nConcepts: ${input.concepts.join(", ")}\n\nWrite 2–4 criteria whose marks add up to ${input.maxMarks}. Each criterion is one idea an examiner can see in a written answer.`,
      });
      return data.criteria;
    } catch (e) {
      console.warn("[ai] draftRubric fell back:", e);
    }
  }
  const parts = input.modelAnswer
    .split(/,|;|\band\b|\bbecause\b/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 4)
    .slice(0, 3);
  const each = Math.max(1, Math.round((input.maxMarks / Math.max(parts.length, 1)) * 2) / 2);
  return parts.map((p) => ({ description: p.charAt(0).toUpperCase() + p.slice(1), marks: each, concept: input.concepts[0] ?? null }));
}

/* ───────── 6.2 Handwriting transcription ───────── */

export type PaperAnswer = {
  number: number;
  /** The printed question, as it appears on the paper. */
  questionText: string;
  /** Marks printed next to the question, if any. */
  maxMarks: number | null;
  text: string;
  confidence: number;
  lowConfidence: string[];
  /** The mark the instructor wrote by hand (a tick = full marks, a cross = 0). Null if no mark is visible. */
  mark: number | null;
  markConfidence: number;
};

/**
 * Reads a paper the instructor has already marked: the printed questions, the student's handwritten
 * answers and the instructor's own marks. It never reads or returns the student's name or ID.
 */
export async function transcribePaper(
  file: Attachment,
  questions: { number: number; prompt: string; maxMarks: number }[],
): Promise<{ answers: PaperAnswer[]; model: string }> {
  const { data, model } = await structured({
    name: "read_marked_paper",
    description: "Read a marked exam paper: printed questions, handwritten answers and the instructor's handwritten marks.",
    kind: "vision",
    maxTokens: 4000,
    schema: z.object({
      answers: z.array(
        z.object({
          number: z.number(),
          questionText: z.string(),
          maxMarks: z.number().nullable(),
          text: z.string(),
          confidence: z.number().min(0).max(1),
          lowConfidence: z.array(z.string()),
          mark: z.number().nullable(),
          markConfidence: z.number().min(0).max(1),
        }),
      ),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        answers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              number: { type: "number" },
              questionText: { type: "string", description: "The printed question text, exactly as printed" },
              maxMarks: { type: ["number", "null"], description: "Marks printed for the question, e.g. (4 marks); null if not printed" },
              text: { type: "string", description: "The student's handwritten answer, exactly. Keep spelling mistakes. Arabic stays Arabic." },
              confidence: { type: "number", description: "0–1 legibility of the handwritten answer" },
              lowConfidence: { type: "array", items: { type: "string" }, description: "Words or short phrases you were unsure about" },
              mark: {
                type: ["number", "null"],
                description: "The instructor's handwritten mark for this answer (often red ink, e.g. 3/4, 2, ✓ or ✗). A tick = full marks (1 if no maximum is printed), a cross = 0. Null if you see no mark.",
              },
              markConfidence: { type: "number", description: "0–1 how sure you are about the mark" },
            },
            required: ["number", "questionText", "maxMarks", "text", "confidence", "lowConfidence", "mark", "markConfidence"],
          },
        },
      },
      required: ["answers"],
    },
    system:
      "You read university exam papers that an instructor has already marked by hand. Questions are printed; answers are handwritten (English, Arabic, or mixed; may include SQL or code). Copy answers exactly; do not correct them. If a word is illegible write [?]. You never judge or change marks: you only report the mark the instructor wrote. Ignore names, student numbers and IDs anywhere on the paper and never write them in your output.",
    prompt: `${questions.length ? `The exam has these questions:\n${questions.map((q) => `Q${q.number} (${q.maxMarks} marks): ${q.prompt}`).join("\n")}\n\n` : ""}For each question on the paper, return the printed question, the student's handwritten answer and the instructor's handwritten mark.`,
    attachments: [file],
  });
  return { answers: data.answers, model };
}

/* ───────── 6.2 Criterion matching ───────── */

export type SlideSource = { id: string; lecture: number; page: number; title: string; body: string };

export type MatchResult = {
  results: {
    code: string;
    status: CriterionStatus;
    evidence: string;
    gap: string;
    marks: number;
    confidence: number;
    /** Written only from the criterion's slide; empty when met. */
    explanation: string;
    /** The slide the explanation cites, or null when it is uncited (flagged for the instructor, hidden from students). */
    citedSlideId: string | null;
  }[];
  followupQuestion: string | null;
  followupReason: string | null;
  errorType: string | null;
  model: string;
};

export async function matchAnswer(input: {
  question: string;
  modelAnswer: string;
  criteria: { code: string; description: string; marks: number; slide?: SlideSource | null }[];
  transcription: string;
  /** The mark the instructor gave on the paper. The diagnosis explains it; it never replaces it. */
  instructorMark?: { marks: number; max: number } | null;
}): Promise<MatchResult> {
  // An explanation is "cited" only when it names the criterion's own slide and stays close to its text.
  const cite = (c: (typeof input.criteria)[number], explanation: string, citation: string) => {
    if (!explanation.trim()) return { explanation: "", citedSlideId: null };
    const flat = (x: string) => x.replace(/\s+/g, "").toLowerCase();
    const ok = !!c.slide && flat(citation) === flat(slideLabel(c.slide.lecture, c.slide.page)) && isGroundedIn(explanation, `${c.slide.title} ${c.slide.body}`);
    return { explanation: explanation.trim(), citedSlideId: ok ? c.slide!.id : null };
  };
  if (aiEnabled() && input.transcription.trim()) {
    try {
      const { data, model } = await structured({
        name: "match_criteria",
        description: "Diagnose a marked written answer against each criterion: what is there, what is missing, and why.",
        schema: z.object({
          results: z.array(
            z.object({
              code: z.string(),
              status: z.enum(["met", "partial", "missing"]),
              evidence: z.string(),
              gap: z.string(),
              marks: z.number(),
              confidence: z.number(),
              explanation: z.string(),
              citation: z.string(),
            }),
          ),
          followupQuestion: z.string().nullable(),
          followupReason: z.string().nullable(),
          errorType: z.string().nullable(),
        }),
        jsonSchema: {
          type: "object",
          properties: {
            results: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  status: { type: "string", enum: ["met", "partial", "missing"] },
                  evidence: { type: "string", description: "Verbatim words from the transcription, or empty if missing" },
                  gap: { type: "string", description: "What the student still needs to explain; empty if met" },
                  marks: { type: "number" },
                  confidence: { type: "number" },
                  explanation: {
                    type: "string",
                    description: "If not met: 1–2 sentences that close the gap, using ONLY the text of this criterion's slide. Empty if met or if the slide does not cover it.",
                  },
                  citation: { type: "string", description: "The label of the slide the explanation uses, exactly as given (e.g. L4 p.11). Empty if no explanation." },
                },
                required: ["code", "status", "evidence", "gap", "marks", "confidence", "explanation", "citation"],
              },
            },
            followupQuestion: {
              type: ["string", "null"],
              description:
                "If a partial criterion has two plausible explanations (brief wording vs real misunderstanding), ONE short concrete question that tells them apart. Otherwise null.",
            },
            followupReason: { type: ["string", "null"] },
            errorType: {
              type: ["string", "null"],
              description: "One of: Describes, doesn't justify | Misconception | Missing step | Off-topic | null",
            },
          },
          required: ["results", "followupQuestion", "followupReason", "errorType"],
        },
        system: GROUNDING,
        prompt: `Question: ${input.question}\nModel answer: ${input.modelAnswer}\n\nCriteria:\n${input.criteria
          .map((c) => `${c.code} (${c.marks} marks): ${c.description}${c.slide ? `\n   Slide [${slideLabel(c.slide.lecture, c.slide.page)}] "${c.slide.title}": ${c.slide.body}` : "\n   (no slide linked)"}`)
          .join("\n")}\n\nStudent's transcribed answer:\n"""${input.transcription}"""\n\nFor every criterion decide met / partial / missing, quote the exact words that show it, and say what is still missing. For each criterion that is not met, explain it from its own slide only and cite that slide's label. Never explain from outside knowledge.${input.instructorMark ? `\n\nThe instructor already marked this answer ${input.instructorMark.marks}/${input.instructorMark.max} on the paper. Do not re-mark it: make your met / partial / missing reading explain that mark.` : ""}`,
      });
      const results = input.criteria.map((c) => {
        const r = data.results.find((x) => x.code === c.code);
        if (!r) return { code: c.code, status: "missing" as const, evidence: "", gap: `Not addressed: ${c.description}`, marks: 0, confidence: 0.5, ...offlineExplanation(c, "missing") };
        const evidence = validateQuote(input.transcription, r.evidence);
        const { citation, ...rest } = r;
        return {
          ...rest,
          ...(r.status === "met" ? { explanation: "", citedSlideId: null } : cite(c, r.explanation, citation)),
          evidence,
          marks: Math.max(0, Math.min(c.marks, r.marks)),
          confidence: evidence || r.status === "missing" ? r.confidence : Math.min(r.confidence, 0.5),
        };
      });
      return { results, followupQuestion: data.followupQuestion, followupReason: data.followupReason, errorType: data.errorType, model };
    } catch (e) {
      console.warn("[ai] matchAnswer fell back:", e);
    }
  }
  const results = fb.heuristicMatch(input.transcription, input.criteria).map((r, i) => ({
    ...r,
    evidence: validateQuote(input.transcription, r.evidence),
    ...offlineExplanation(input.criteria[i]!, r.status),
  }));
  const partial = results.find((r) => r.status === "partial");
  const isKeyQuestion = /primary key/i.test(input.question);
  return {
    results,
    followupQuestion: partial
      ? isKeyQuestion
        ? "What would happen if two students had the same name?"
        : "Can you give a concrete example that shows the part you explained briefly?"
      : null,
    followupReason: partial ? `${partial.code} has two likely readings: a short answer or a real misunderstanding.` : null,
    errorType: partial ? "Describes, doesn't justify" : results.some((r) => r.status === "missing") ? "Missing step" : null,
    model: "demo-heuristic",
  };
}

/** Without the AI the explanation is the slide's own text, so it is always cited. */
function offlineExplanation(c: { slide?: SlideSource | null }, status: CriterionStatus) {
  if (status === "met" || !c.slide) return { explanation: "", citedSlideId: null };
  return { explanation: fb.explainFromSlide(c.slide.title, c.slide.body), citedSlideId: c.slide.id };
}

/* ───────── 6.3 Diagnosis follow-up ───────── */

export async function followupTurn(input: {
  question: string;
  studentAnswer: string;
  gap: string;
  concept: string;
  history: { role: "assistant" | "student"; text: string }[];
  reply: string;
}): Promise<{ reply: string; branch: "understands" | "misconception" | "unclear"; identifiedGap: string; done: boolean }> {
  if (aiEnabled()) {
    try {
      const { data } = await structured({
        name: "diagnose_reply",
        description: "Classify the student's reply and respond.",
        kind: "fast",
        schema: z.object({
          branch: z.enum(["understands", "misconception", "unclear"]),
          identifiedGap: z.string(),
          reply: z.string(),
        }),
        jsonSchema: {
          type: "object",
          properties: {
            branch: { type: "string", enum: ["understands", "misconception", "unclear"] },
            identifiedGap: { type: "string", description: "One sentence: what the student does or does not understand" },
            reply: {
              type: "string",
              description:
                "2–3 sentences. If understands: confirm and invite them to add the reasoning. If misconception: name the rule gently and say a short activity follows. If unclear: ask ONE more concrete question.",
            },
          },
          required: ["branch", "identifiedGap", "reply"],
        },
        system: GROUNDING,
        prompt: `Concept: ${input.concept}\nExam question: ${input.question}\nStudent's exam answer: ${input.studentAnswer}\nGap found: ${input.gap}\n\nConversation so far:\n${input.history
          .map((m) => `${m.role}: ${m.text}`)
          .join("\n")}\nstudent: ${input.reply}`,
      });
      return { ...data, done: data.branch !== "unclear" || input.history.length >= 4 };
    } catch (e) {
      console.warn("[ai] followupTurn fell back:", e);
    }
  }
  const branch = fb.classifyFollowupReply(input.reply);
  return {
    branch,
    reply: fb.followupResponse(branch, input.concept),
    identifiedGap:
      branch === "understands"
        ? "Understands uniqueness; the exam answer was just brief."
        : branch === "misconception"
          ? "Believes the key value could repeat between students."
          : "Not yet clear.",
    done: branch !== "unclear" || input.history.length >= 4,
  };
}

/* ───────── 6.4 Study profile ───────── */
// The study check-in is scored by rules in lib/profile-questions.ts: no AI call, so no student data leaves the server.

/* ───────── 6.5 Activities, practice and retest ───────── */

export type ExperimentPayload = {
  intro: string;
  table: { columns: string[]; rows: string[][] };
  task: string;
  sql: string;
  result: string;
  prompt: string;
  /** Words a correct explanation mentions; used to check answers offline. */
  checkFor: string[];
  /** The explanation shown once the student gets it right. */
  answer: string;
};

export type ActivitySlide = { id: string; lecture: number; page: number; title: string; body: string };

/**
 * Picks the activity from the gap, the follow-up branch and the check-in. Works for any concept:
 * an experiment uses the scenario drafted once for the concept (see draftExperiment); everything
 * else is built from the concept's own slide.
 */
export function chooseActivity(input: {
  concept: string;
  branch: "understands" | "misconception" | "unclear" | null;
  preferred: ActivityType;
  slide?: ActivitySlide | null;
  experiment?: ExperimentPayload | null;
}): { type: ActivityType; title: string; reason: string; payload: Record<string, unknown> } {
  const where = input.slide ? `Lecture ${input.slide.lecture}, page ${input.slide.page} (“${input.slide.title}”)` : "the linked slide";
  const base = { slideId: input.slide?.id ?? null, reference: input.slide ? `${input.slide.title}. ${input.slide.body}` : "" };
  if (input.branch === "understands") {
    return {
      type: "own_words",
      title: "Add your reasoning",
      reason: "You already understand the idea; writing it down makes it stick for the exam.",
      payload: { ...base, prompt: `Rewrite your answer about ${input.concept} so it explains why, not just what.` },
    };
  }
  const type = input.preferred;
  if (type === "experiment" && input.experiment) {
    return {
      type,
      title: "Try breaking the rule",
      reason: "Chosen because you said you learn best by trying small changes yourself.",
      payload: { ...base, ...input.experiment },
    };
  }
  if (type === "experiment") {
    return {
      type,
      title: `Change one thing: ${input.concept}`,
      reason: "Chosen because you said you learn best by trying small changes yourself.",
      payload: { ...base, prompt: `Open the example on ${where}. Change one detail of it, predict what happens, then explain why in your own words.` },
    };
  }
  if (type === "mind_map") {
    return {
      type,
      title: `Map ${input.concept}`,
      reason: "Chosen because you said drawing how ideas connect helps you.",
      payload: { ...base, prompt: `Using ${where}, list the ideas connected to ${input.concept} and write one sentence for each link (idea → why → what it leads to).` },
    };
  }
  if (type === "try_first") {
    return {
      type,
      title: `Try it first: ${input.concept}`,
      reason: "Chosen because you already practise with questions: answering before reading makes the slide stick.",
      payload: { ...base, prompt: `Before opening the slide: in two sentences, what does ${input.concept} guarantee, and what goes wrong without it? Then check yourself against ${where}.` },
    };
  }
  if (type === "own_words") {
    return {
      type,
      title: `Explain ${input.concept}`,
      reason: "Chosen because you said explaining in your own words helps you.",
      payload: { ...base, prompt: `Read ${where}, close it, then explain ${input.concept} as if to a classmate who missed the lecture.` },
    };
  }
  return {
    type: "worked_example",
    title: `Worked example: ${input.concept}`,
    reason: "Chosen because you said an example helps when you're stuck.",
    payload: { ...base, prompt: `Read the worked example on ${where}, then explain the key step of ${input.concept} in your own words.` },
  };
}

/** Drafts one experiment for a concept from its slides only. Called once per concept and cached; no student data. */
export async function draftExperiment(input: { concept: string; description?: string | null; slides: { title: string; body: string }[] }): Promise<ExperimentPayload | null> {
  if (!aiEnabled() || !input.slides.length) return null;
  try {
    const { data } = await structured({
      name: "draft_experiment",
      description: "Design a tiny 'break the rule' experiment that shows why a concept matters.",
      kind: "fast",
      schema: z.object({
        intro: z.string(),
        table: z.object({ columns: z.array(z.string()).min(1).max(5), rows: z.array(z.array(z.string())).min(1).max(4) }),
        task: z.string(),
        sql: z.string(),
        result: z.string(),
        prompt: z.string(),
        checkFor: z.array(z.string()).min(1).max(6),
        answer: z.string(),
      }),
      jsonSchema: {
        type: "object",
        properties: {
          intro: { type: "string", description: "One sentence setting up a small example where the rule is broken" },
          table: {
            type: "object",
            properties: { columns: { type: "array", items: { type: "string" } }, rows: { type: "array", items: { type: "array", items: { type: "string" } } } },
            required: ["columns", "rows"],
          },
          task: { type: "string", description: "What the student tries to do" },
          sql: { type: "string", description: "The short code or step that performs it" },
          result: { type: "string", description: "The surprising result, one line" },
          prompt: { type: "string", description: "Ask the student to explain in their own words why it happened" },
          checkFor: { type: "array", items: { type: "string" }, description: "2–4 lowercase words a correct explanation would use" },
          answer: { type: "string", description: "Two sentences explaining why it happened, from the slides" },
        },
        required: ["intro", "table", "task", "sql", "result", "prompt", "checkFor", "answer"],
      },
      system: GROUNDING,
      prompt: `Concept: ${input.concept}${input.description ? ` — ${input.description}` : ""}\n\nLecture slides (use only these):\n${input.slides.map((s) => `- ${s.title}: ${s.body}`).join("\n")}`,
    });
    return { ...data, checkFor: data.checkFor.map((w) => w.toLowerCase()) };
  } catch (e) {
    console.warn("[ai] draftExperiment fell back:", e);
    return null;
  }
}

export async function checkSubmission(input: { concept: string; task: string; submission: string; reference: string; checkFor: string[]; answer?: string }) {
  if (aiEnabled()) {
    try {
      const { data } = await structured({
        name: "check_explanation",
        description: "Check a student's explanation against the lecture idea.",
        kind: "fast",
        schema: z.object({ ok: z.boolean(), feedback: z.string() }),
        jsonSchema: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            feedback: { type: "string", description: "2 sentences. If not ok, ask for ONE specific revision." },
          },
          required: ["ok", "feedback"],
        },
        system: GROUNDING,
        prompt: `Concept: ${input.concept}\nTask: ${input.task}${input.reference ? `\nLecture slide: ${input.reference}` : ""}\nStudent's explanation: ${input.submission}`,
      });
      return data;
    } catch (e) {
      console.warn("[ai] checkSubmission fell back:", e);
    }
  }
  return fb.checkExplanationHeuristic(input.submission, { checkFor: input.checkFor, reference: input.reference, answer: input.answer });
}

export async function generateRetest(input: { concept: string; gap: string; avoid: string }) {
  if (aiEnabled()) {
    try {
      const { data } = await structured({
        name: "fresh_question",
        description: "Write one fresh written question targeting the exact gap.",
        schema: z.object({
          prompt: z.string(),
          criteria: z.array(z.object({ code: z.string(), description: z.string(), marks: z.number() })),
        }),
        jsonSchema: {
          type: "object",
          properties: {
            prompt: { type: "string" },
            criteria: {
              type: "array",
              items: {
                type: "object",
                properties: { code: { type: "string" }, description: { type: "string" }, marks: { type: "number" } },
                required: ["code", "description", "marks"],
              },
            },
          },
          required: ["prompt", "criteria"],
        },
        system: GROUNDING,
        prompt: `Concept: ${input.concept}\nThe student's gap: ${input.gap}\nDo NOT reuse this question: ${input.avoid}\nWrite a new short written question on a different table/scenario with 2–3 criteria (codes C1..).`,
      });
      return data;
    } catch (e) {
      console.warn("[ai] generateRetest fell back:", e);
    }
  }
  return fb.retestBank(input.concept);
}

export async function gradeRetest(input: {
  prompt: string;
  criteria: { code: string; description: string; marks: number }[];
  answer: string;
}) {
  const r = await matchAnswer({ question: input.prompt, modelAnswer: "", criteria: input.criteria, transcription: input.answer });
  return r.results;
}

/* ───────── 6.6 Misconception clustering ───────── */

export async function clusterMisconceptions(input: {
  question: string;
  gaps: { evidence: string; gap: string }[];
}): Promise<{ title: string; count: number; examples: string[] }[]> {
  if (input.gaps.length === 0) return [];
  if (aiEnabled()) {
    try {
      const { data } = await structured({
        name: "cluster_misconceptions",
        description: "Group student gaps that express the same misconception.",
        schema: z.object({
          clusters: z.array(z.object({ title: z.string(), indexes: z.array(z.number()) })),
        }),
        jsonSchema: {
          type: "object",
          properties: {
            clusters: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string", description: "≤ 8 words naming the misconception" },
                  indexes: { type: "array", items: { type: "number" } },
                },
                required: ["title", "indexes"],
              },
            },
          },
          required: ["clusters"],
        },
        system: GROUNDING,
        prompt: `Question: ${input.question}\n\nStudent gaps:\n${input.gaps
          .map((g, i) => `[${i}] wrote "${g.evidence}" — ${g.gap}`)
          .join("\n")}\n\nGroup them into at most 4 misconceptions.`,
      });
      return data.clusters
        .map((c) => ({
          title: c.title,
          count: c.indexes.length,
          examples: Array.from(new Set(c.indexes.map((i) => input.gaps[i]?.evidence).filter((x): x is string => !!x))).slice(0, 3),
        }))
        .filter((c) => c.count > 0)
        .sort((a, b) => b.count - a.count);
    } catch (e) {
      console.warn("[ai] clusterMisconceptions fell back:", e);
    }
  }
  const groups = new Map<string, { evidence: string; gap: string }[]>();
  for (const g of input.gaps) {
    const key = /student number|has an id|every student has/i.test(g.evidence)
      ? "Describes the column instead of the rule"
      : /name/i.test(g.evidence)
        ? "Believes a name can identify a student"
        : g.gap.split(":")[0] ?? "Other gaps";
    groups.set(key, [...(groups.get(key) ?? []), g]);
  }
  return Array.from(groups.entries())
    .map(([title, list]) => ({
      title,
      count: list.length,
      examples: Array.from(new Set(list.map((l) => l.evidence).filter(Boolean))).slice(0, 3),
    }))
    .sort((a, b) => b.count - a.count);
}

/* ───────── 6.7 Socratic-style fix for a wrong MCQ option ───────── */

/**
 * Writes a 2-step tap-to-answer chain for one wrong option. The AI sees only the question, the
 * options, the key and the slides: never a student. Chains that leave the slide are kept but uncited.
 */
export async function draftChain(input: {
  question: string;
  options: string[];
  correct: string;
  chosen: string;
  slides: { id: string; lecture: number; page: number; title: string; body: string }[];
}): Promise<{ misconception: string; steps: ChainStep[]; explanation: string; citedSlideId: string | null; model: string }> {
  const offline = () => {
    const slide = input.slides[0];
    if (!slide) return null;
    return { ...chainFromSlide({ ...input, slide }), citedSlideId: slide.id, model: "demo-slide" };
  };
  if (aiEnabled() && input.slides.length) {
    try {
      const { data, model } = await structured({
        name: "socratic_chain",
        description: "Write a 2-step tap-to-answer Socratic chain that leads a student from a wrong option to the idea on the slide.",
        kind: "fast",
        schema: z.object({
          misconception: z.string(),
          steps: z
            .array(z.object({ prompt: z.string(), choices: z.array(z.object({ text: z.string(), correct: z.boolean() })).min(2).max(4), hint: z.string() }))
            .min(2)
            .max(2),
          explanation: z.string(),
          citation: z.string(),
        }),
        jsonSchema: {
          type: "object",
          properties: {
            misconception: { type: "string", description: "One sentence: the likely misunderstanding behind choosing this wrong option" },
            steps: {
              type: "array",
              description: "Exactly 2 steps. Step 1 makes the student notice the flaw; step 2 asks them to apply the right idea. Lead, don't tell.",
              items: {
                type: "object",
                properties: {
                  prompt: { type: "string", description: "A short question the student answers with one tap" },
                  choices: {
                    type: "array",
                    items: { type: "object", properties: { text: { type: "string" }, correct: { type: "boolean" } }, required: ["text", "correct"] },
                    description: "2–3 short choices, exactly one correct. Mix the position of the correct one.",
                  },
                  hint: { type: "string", description: "Shown after a wrong tap: one sentence using only the slide's words" },
                },
                required: ["prompt", "choices", "hint"],
              },
            },
            explanation: { type: "string", description: "Shown at the end: 1–2 sentences from the slide only" },
            citation: { type: "string", description: "Label of the slide you used, exactly as given (e.g. L4 p.12)" },
          },
          required: ["misconception", "steps", "explanation", "citation"],
        },
        system: `${GROUNDING}\nYou write Socratic tutoring steps for one wrong multiple-choice option. You never see any student: only the question, its options and the lecturer's slides.`,
        prompt: `Question: ${input.question}\nOptions:\n${input.options.map((o, i) => `${LETTERS[i]}) ${o}`).join("\n")}\nCorrect: ${input.correct}\nWrong option chosen by some students: ${input.chosen}\n\nLecture slides (use only these):\n${input.slides.map((s) => `[${slideLabel(s.lecture, s.page)}] ${s.title}: ${s.body}`).join("\n")}`,
      });
      const slide = input.slides.find((s) => slideLabel(s.lecture, s.page).replace(/\s+/g, "").toLowerCase() === data.citation.replace(/\s+/g, "").toLowerCase());
      if (!chainIsWellFormed(data.steps)) throw new Error("chain is not well formed");
      const cited = slide && chainIsGrounded(data, `${slide.title} ${slide.body}`) ? slide.id : null;
      return { misconception: data.misconception, steps: mixChoices(data.steps, `${input.question}${input.chosen}`), explanation: data.explanation, citedSlideId: cited, model };
    } catch (e) {
      console.warn("[ai] draftChain fell back:", e);
    }
  }
  const o = offline();
  if (!o) throw new Error("No slide linked to this question's concept");
  return o;
}
