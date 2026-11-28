import { test } from "node:test";
import assert from "node:assert/strict";
import { calibration, changedReason, isRight, parseConfidence, shouldSuggestSwitch } from "../src/lib/profile-rules";
import { cleanCheckin, profileFromCheckin } from "../src/lib/profile-questions";

test("confidence taps are compared with the result, not stored as a trait", () => {
  assert.equal(calibration(true, "sure"), "matched");
  assert.equal(calibration(true, "unsure"), "underconfident");
  assert.equal(calibration(true, "guess"), "underconfident");
  assert.equal(calibration(false, "sure"), "overconfident");
  assert.equal(calibration(false, "guess"), "matched");
  assert.equal(calibration(true, null), null);
});

test("only known confidence values are accepted", () => {
  assert.equal(parseConfidence("sure"), "sure");
  assert.equal(parseConfidence("very"), null);
  assert.equal(parseConfidence(null), null);
});

test("a fresh test is right at 80%", () => {
  assert.equal(isRight(1, 1), true);
  assert.equal(isRight(3, 4), false);
  assert.equal(isRight(4, 5), true);
  assert.equal(isRight(0, 0), false);
});

test("two 'not really' ratings in a row for the preferred type suggest a switch", () => {
  const r = (type: "worked_example" | "mind_map", usefulness: string | null) => ({ type, usefulness });
  assert.equal(shouldSuggestSwitch([r("worked_example", "not_really"), r("worked_example", "not_really")], "worked_example"), true);
  assert.equal(shouldSuggestSwitch([r("worked_example", "not_really"), r("worked_example", "a_lot")], "worked_example"), false);
  assert.equal(shouldSuggestSwitch([r("worked_example", "not_really")], "worked_example"), false);
  // Unrated activities and other types don't count.
  assert.equal(shouldSuggestSwitch([r("worked_example", "not_really"), r("mind_map", "a_lot"), r("worked_example", null), r("worked_example", "not_really")], "worked_example"), true);
  assert.equal(shouldSuggestSwitch([r("mind_map", "not_really"), r("mind_map", "not_really")], "worked_example"), false);
  assert.equal(shouldSuggestSwitch([r("worked_example", "not_really"), r("worked_example", "not_really")], null), false);
});

test("a changed activity says what changed and why", () => {
  assert.equal(changedReason("worked_example", "mind_map", "after you updated your check-in"), "Changed after you updated your check-in: mind maps instead of worked examples.");
});

test("skipped check-in questions leave no trait and no guess", () => {
  const a = cleanCheckin({ habit: "reread", stuck: "skip", timing: "skip", minutes: "skip", goal: "skip" });
  assert.deepEqual(a, { habit: "reread" });
  const p = profileFromCheckin(a);
  assert.deepEqual(p.traits, ["Reread my slides or notes"]);
  assert.equal(p.preferred, "worked_example");
});
