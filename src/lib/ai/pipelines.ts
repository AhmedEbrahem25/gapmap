import "server-only";
import { z } from "zod";
import { aiEnabled, structured, type Attachment } from "./client";
import * as fb from "./fallback";
import type { ActivityType, CriterionStatus } from "../db/schema";

/* Shared guardrails added to every system prompt. */
const GROUNDING = `You work inside GapMap, a tool that helps university instructors give exam feedback.
Rules: Only use the student's own words and the course's own lecture slides as evidence.
Quotes must be copied verbatim from the transcription. Never invent marks for criteria that do not exist.
Be concise, kind and specific. Write for an undergraduate student.`;

import { validateQuote } from "./quotes";
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
        prompt: `Question: ${input.prompt}\nModel answer: ${input.modelAnswer}\nTotal marks: ${input.maxMarks}\nConcepts: ${input.concepts.join(", ")}\n\nWrite 2–4 criteria whose marks add up to ${input.maxMarks}. Each criterion is one idea an examiner can see in a written answer.`,
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

export async function transcribePaper(
  file: Attachment,
  questions: { number: number; prompt: string }[],
): Promise<{
  studentName: string | null;
  studentNumber: string | null;
  answers: { number: number; text: string; confidence: number; lowConfidence: string[] }[];
  model: string;
}> {
  const { data, model } = await structured({
    name: "transcribe_exam_paper",
    description: "Transcribe a scanned handwritten exam paper, split by question.",
    kind: "vision",
    maxTokens: 4000,
    schema: z.object({
      studentName: z.string().nullable(),
      studentNumber: z.string().nullable(),
      answers: z.array(
        z.object({
          number: z.number(),
          text: z.string(),
          confidence: z.number().min(0).max(1),
          lowConfidence: z.array(z.string()),
        }),
      ),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        studentName: { type: ["string", "null"] },
        studentNumber: { type: ["string", "null"] },
        answers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              number: { type: "number" },
              text: { type: "string", description: "Exact transcription. Keep spelling mistakes. Arabic stays Arabic." },
              confidence: { type: "number", description: "0–1 overall legibility" },
              lowConfidence: { type: "array", items: { type: "string" }, description: "Words or short phrases you were unsure about" },
            },
            required: ["number", "text", "confidence", "lowConfidence"],
          },
        },
      },
      required: ["studentName", "studentNumber", "answers"],
    },
    system:
      "You transcribe handwritten university exam papers (English, Arabic, or mixed; may include SQL or code). Copy exactly what is written; do not correct or improve it. If a word is illegible write [?].",
    prompt: `The exam has these questions:\n${questions.map((q) => `Q${q.number}: ${q.prompt}`).join("\n")}\n\nRead the cover page for the student's name and number, then transcribe each answer under its question number.`,
    attachments: [file],
  });
  return { ...data, model };
}

/* ───────── 6.2 Criterion matching ───────── */

export type MatchResult = {
  results: { code: string; status: CriterionStatus; evidence: string; gap: string; marks: number; confidence: number }[];
  followupQuestion: string | null;
  followupReason: string | null;
  errorType: string | null;
  model: string;
};

export async function matchAnswer(input: {
  question: string;
  modelAnswer: string;
  criteria: { code: string; description: string; marks: number; slideTitle?: string | null }[];
  transcription: string;
}): Promise<MatchResult> {
  if (aiEnabled() && input.transcription.trim()) {
    try {
      const { data, model } = await structured({
        name: "match_criteria",
        description: "Judge a written answer against each marking criterion.",
        schema: z.object({
          results: z.array(
            z.object({
              code: z.string(),
              status: z.enum(["met", "partial", "missing"]),
              evidence: z.string(),
              gap: z.string(),
              marks: z.number(),
              confidence: z.number(),
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
                },
                required: ["code", "status", "evidence", "gap", "marks", "confidence"],
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
          .map((c) => `${c.code} (${c.marks} marks): ${c.description}${c.slideTitle ? ` [taught on slide: ${c.slideTitle}]` : ""}`)
          .join("\n")}\n\nStudent's transcribed answer:\n"""${input.transcription}"""\n\nFor every criterion decide met / partial / missing, quote the exact words that show it, and say what is still missing.`,
      });
      const results = input.criteria.map((c) => {
        const r = data.results.find((x) => x.code === c.code);
        if (!r) return { code: c.code, status: "missing" as const, evidence: "", gap: `Not addressed: ${c.description}`, marks: 0, confidence: 0.5 };
        const evidence = validateQuote(input.transcription, r.evidence);
        return {
          ...r,
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
  const results = fb.heuristicMatch(input.transcription, input.criteria).map((r) => ({
    ...r,
    evidence: validateQuote(input.transcription, r.evidence),
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

export async function buildProfile(answers: Record<string, string>) {
  const base = fb.profileFromAnswers(answers);
  if (!aiEnabled()) return base;
  try {
    const { data } = await structured({
      name: "study_profile",
      description: "Summarise study habits into a short, editable profile.",
      kind: "fast",
      schema: z.object({
        traits: z.array(z.string()).max(4),
        preferred: z.enum(["experiment", "mind_map", "worked_example", "own_words", "try_first"]),
        minutes: z.number(),
        summary: z.string(),
      }),
      jsonSchema: {
        type: "object",
        properties: {
          traits: { type: "array", items: { type: "string", description: "≤ 5 words, a habit not a personality label" } },
          preferred: { type: "string", enum: ["experiment", "mind_map", "worked_example", "own_words", "try_first"] },
          minutes: { type: "number" },
          summary: { type: "string", description: "2 sentences addressed to the student, explaining the choice" },
        },
        required: ["traits", "preferred", "minutes", "summary"],
      },
      system:
        "Describe study habits and preferences only. Never diagnose personality or ability. The student can edit everything you write.",
      prompt: Object.entries(answers)
        .map(([q, a]) => `${q}\n→ ${a}`)
        .join("\n\n"),
    });
    return { ...data, traits: [...data.traits.slice(0, 3), `~${data.minutes} min a day`] };
  } catch (e) {
    console.warn("[ai] buildProfile fell back:", e);
    return base;
  }
}

/* ───────── 6.5 Activities, practice and retest ───────── */

export function chooseActivity(input: {
  concept: string;
  branch: "understands" | "misconception" | "unclear" | null;
  preferred: ActivityType;
}): { type: ActivityType; title: string; reason: string; payload: Record<string, unknown> } {
  const isKeys = /primary key/i.test(input.concept);
  if (input.branch === "understands") {
    return {
      type: "own_words",
      title: "Add your reasoning",
      reason: "You already understand the idea; writing it down makes it stick for the exam.",
      payload: { prompt: `Rewrite your answer about ${input.concept} so it explains why, not just what.` },
    };
  }
  const type = input.preferred;
  if (type === "experiment" && isKeys) {
    return {
      type,
      title: "Try breaking the rule",
      reason: "Chosen because you said you learn best by experimenting before reading.",
      payload: {
        intro: "This table has no primary key. Two students got the same StudentID by mistake.",
        table: {
          columns: ["StudentID", "Name", "Email"],
          rows: [
            ["1042", "Mariam", "m@uni.edu"],
            ["1042", "Omar", "o@uni.edu"],
          ],
        },
        task: "Change only Omar's email.",
        sql: "UPDATE Student\nSET Email = 'omar@uni.edu'\nWHERE StudentID = 1042;",
        result: "2 rows updated — Mariam's email changed too",
        prompt: "In your own words: why did this happen?",
      },
    };
  }
  if (type === "mind_map") {
    return {
      type,
      title: `Map ${input.concept}`,
      reason: "Chosen because you like seeing how ideas connect.",
      payload: {
        prompt: `List the ideas connected to ${input.concept} and write one sentence for each link (e.g. "Primary key → must be unique → so each row is identified once").`,
      },
    };
  }
  return {
    type: "worked_example",
    title: `Worked example: ${input.concept}`,
    reason: "Chosen because you said an example helps when you're stuck.",
    payload: {
      prompt: `Read the worked example on the linked slide, then explain the key step of ${input.concept} in your own words.`,
    },
  };
}

export async function checkSubmission(input: { concept: string; task: string; submission: string }) {
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
        prompt: `Concept: ${input.concept}\nTask: ${input.task}\nStudent's explanation: ${input.submission}`,
      });
      return data;
    } catch (e) {
      console.warn("[ai] checkSubmission fell back:", e);
    }
  }
  return fb.checkExplanationHeuristic(input.submission);
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
