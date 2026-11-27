import { test } from "node:test";
import assert from "node:assert/strict";
import { validateQuote, isGroundedIn, slideLabel } from "../src/lib/ai/quotes";
import { heuristicMatch, classifyFollowupReply, checkExplanationHeuristic, retestBank, explainFromSlide } from "../src/lib/ai/fallback";
import { answerFlags, approvedWithoutEdits } from "../src/lib/review";
import { cleanCheckin, profileFromCheckin } from "../src/lib/profile-questions";

const mariam = "I will choose StudentID as the primary key because it is the student number. Name can not be a key.";
const criteria = [
  { code: "C1", description: "Names a suitable primary key (StudentID)", marks: 1 },
  { code: "C2", description: "Explains that each student needs a distinct value (uniqueness)", marks: 2 },
  { code: "C3", description: "Notes the value should not change or be empty", marks: 1 },
];

test("quotes are kept only when they appear verbatim", () => {
  assert.equal(validateQuote(mariam, "because it is the student number"), "because it is the student number");
  assert.equal(validateQuote(mariam, "“BECAUSE it is   the student number”"), "because it is the student number");
  assert.equal(validateQuote(mariam, "because it is unique"), "");
  assert.equal(validateQuote(mariam, ""), "");
});

test("offline matcher reads Mariam's answer like the demo expects", () => {
  const r = heuristicMatch(mariam, criteria);
  assert.equal(r[0]!.status, "met");
  assert.equal(r[1]!.status, "partial");
  assert.equal(r[2]!.status, "missing");
  for (const x of r) if (x.evidence) assert.ok(mariam.includes(x.evidence), `evidence must be verbatim: ${x.evidence}`);
});

test("a complete answer meets every criterion", () => {
  const full = "I choose StudentID because every student gets a different ID, so no two students can share it. It never changes and can't be empty.";
  assert.deepEqual(heuristicMatch(full, criteria).map((x) => x.status), ["met", "met", "met"]);
});

test("follow-up replies pick the right branch", () => {
  assert.equal(classifyFollowupReply("Their StudentIDs would still be different, so we can tell them apart"), "understands");
  assert.equal(classifyFollowupReply("They could also share a number, so we'd need the name too"), "misconception");
  assert.equal(classifyFollowupReply("not sure"), "unclear");
});

test("study check-in is scored by rules: habits and time, never ability", () => {
  const p = profileFromCheckin({ habit: "reread", stuck: "experiment", timing: "night_before", minutes: "45", goal: "master" });
  assert.equal(p.preferred, "experiment");
  assert.equal(p.minutes, 45);
  assert.ok(p.traits.includes("Reread my slides or notes"));
  assert.match(p.summary, /testing yourself/);
  assert.match(p.summary, /45-minute steps/);
  assert.equal(profileFromCheckin({ habit: "practice", stuck: "worked_example" }).preferred, "try_first");
});

test("check-in keeps only real choices", () => {
  assert.deepEqual(cleanCheckin({ habit: "self_test", stuck: "<script>", minutes: "999", goal: "grade" }), { habit: "self_test", goal: "grade" });
});

test("experiment explanation check and fresh question bank", () => {
  const checkFor = ["same", "both", "1042", "duplicate", "unique", "studentid"];
  assert.equal(checkExplanationHeuristic("Both rows have the same StudentID 1042", { checkFor }).ok, true);
  assert.equal(checkExplanationHeuristic("I don't know", { checkFor }).ok, false);
  // Any concept: without checkFor words the explanation must reuse the slide's ideas.
  const reference = "Normalisation removes repeated data so each fact is stored once and updates cannot disagree.";
  assert.equal(checkExplanationHeuristic("Normalisation stores each fact once, so repeated data cannot get out of step after updates.", { reference }).ok, true);
  assert.equal(checkExplanationHeuristic("It makes the database better.", { reference }).ok, false);
  const q = retestBank("Primary keys");
  assert.match(q.prompt, /Course/);
  assert.equal(q.criteria.reduce((t, c) => t + c.marks, 0), 4);
});

import { toGeminiSchema } from "../src/lib/ai/gemini-schema";

test("JSON Schema is converted to Gemini's response schema", () => {
  const out = toGeminiSchema({
    type: "object",
    properties: {
      followupQuestion: { type: ["string", "null"], description: "one question" },
      results: { type: "array", items: { type: "object", properties: { status: { type: "string", enum: ["met", "partial", "missing"] } }, required: ["status"] } },
    },
    required: ["followupQuestion", "results"],
  });
  assert.deepEqual(out.propertyOrdering, ["followupQuestion", "results"]);
  const props = out.properties as Record<string, Record<string, unknown>>;
  assert.equal(props.followupQuestion!.type, "string");
  assert.equal(props.followupQuestion!.nullable, true);
  const items = props.results!.items as Record<string, unknown>;
  assert.deepEqual((items.properties as Record<string, Record<string, unknown>>).status!.enum, ["met", "partial", "missing"]);
});

test("explanations count as cited only when they stay on the slide", () => {
  const slide = "Primary keys. The primary key is the candidate key we choose to identify rows. PRIMARY KEY (StudentID).";
  assert.equal(isGroundedIn("The primary key is the candidate key chosen to identify rows.", slide), true);
  assert.equal(isGroundedIn("Indexes speed up lookups on large tables with B-trees.", slide), false);
  assert.equal(slideLabel(4, 11), "L4 p.11");
  const offline = explainFromSlide("Primary keys", "The primary key is the candidate key we choose to identify rows. PRIMARY KEY (StudentID).");
  assert.ok(isGroundedIn(offline, slide), "the offline explanation is always grounded");
});

test("review rules flag answers that need a one-by-one look", () => {
  const paper = { confidence: 0.95, transcription: "text", paperMarks: 3, paperMarkConfidence: 0.97 };
  const ok = { aiConfidence: 0.9, explanation: "From the slide", citedSlideId: "sld_1", marks: 3 };
  assert.deepEqual(answerFlags(paper, [ok], 4), []);
  assert.deepEqual(answerFlags({ ...paper, confidence: 0.5 }, [ok], 4), ["Hard to read"]);
  assert.deepEqual(answerFlags(paper, [{ ...ok, citedSlideId: null }], 4), ["Uncited explanation"]);
  assert.deepEqual(answerFlags(paper, [{ ...ok, aiConfidence: 0.4 }], 4), ["Low AI confidence"]);
  assert.deepEqual(answerFlags({ ...paper, transcription: "", confidence: 0 }, [], 4), ["Not diagnosed yet"]);
});

test("the mark is the instructor's: missing, smudged or contradicted marks are flagged", () => {
  const paper = { confidence: 0.95, transcription: "text", paperMarks: 3, paperMarkConfidence: 0.97 };
  const ok = { aiConfidence: 0.9, explanation: "", citedSlideId: null, marks: 3 };
  assert.deepEqual(answerFlags({ ...paper, paperMarks: null }, [ok], 4), ["Mark not found"]);
  assert.deepEqual(answerFlags({ ...paper, paperMarkConfidence: 0.5 }, [ok], 4), ["Mark hard to read"]);
  assert.deepEqual(answerFlags({ ...paper, paperMarks: 4 }, [{ ...ok, marks: 1 }], 4), ["Diagnosis disagrees with the mark"]);
  assert.deepEqual(answerFlags({ ...paper, paperMarks: 3.5 }, [ok], 4), [], "small differences are fine");
});

test("AI quality is the share approved without edits", () => {
  assert.equal(approvedWithoutEdits([]), null);
  assert.equal(approvedWithoutEdits([{ edited: false }, { edited: false }, { edited: false }, { edited: true }]), 75);
});
