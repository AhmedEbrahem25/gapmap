import { test } from "node:test";
import assert from "node:assert/strict";
import { validateQuote } from "../src/lib/ai/quotes";
import { heuristicMatch, classifyFollowupReply, profileFromAnswers, checkExplanationHeuristic, retestBank } from "../src/lib/ai/fallback";

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

test("study profile describes habits and time, never ability", () => {
  const p = profileFromAnswers({ a: "I like to try things myself and experiment", b: "about 45 min" });
  assert.equal(p.preferred, "experiment");
  assert.equal(p.minutes, 45);
  assert.ok(p.traits.includes("Tries things first"));
});

test("experiment explanation check and fresh question bank", () => {
  assert.equal(checkExplanationHeuristic("Both rows have the same StudentID 1042").ok, true);
  assert.equal(checkExplanationHeuristic("I don't know").ok, false);
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
