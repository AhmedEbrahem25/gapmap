import { test } from "node:test";
import assert from "node:assert/strict";
import { ARMS, BKT, activityReward, armStats, betaSample, bktStep, bktTrace, pickArm, pickReason, rng, type Outcome } from "../src/lib/adaptive";

test("knowledge tracing rises after right answers and falls after wrong ones", () => {
  const up = bktStep(0.3, 1);
  const down = bktStep(0.3, 0);
  assert.ok(up > 0.3 && up < 1);
  assert.ok(down < 0.3);
  // Partial marks land in between.
  const half = bktStep(0.3, 0.5);
  assert.ok(half > down && half < up);
});

test("a trace is replayed in date order, whatever order the rows come in", () => {
  const rows = [
    { label: "Fresh test", date: "2026-11-28", score: 3, max: 3 },
    { label: "Quiz", date: "2026-10-12", score: 0, max: 3 },
  ];
  const t = bktTrace(rows);
  assert.deepEqual(t.steps.map((s) => s.label), ["Quiz", "Fresh test"]);
  assert.equal(t.steps[0]!.before, BKT.init);
  assert.equal(t.p, t.steps[1]!.after);
  assert.ok(t.steps[1]!.after > t.steps[1]!.before);
});

test("an activity is scored by the next test on the concept, else by the student's rating", () => {
  const a = { createdDay: "2026-11-20", usefulness: "not_really" as const };
  assert.equal(activityReward(a, [{ date: "2026-11-21", score: 3, max: 3 }]), 1);
  assert.equal(activityReward(a, [{ date: "2026-11-21", score: 1, max: 3 }]), 0);
  // Tests from before the activity don't count; the rating does.
  assert.equal(activityReward(a, [{ date: "2026-11-10", score: 3, max: 3 }]), 0);
  assert.equal(activityReward({ ...a, usefulness: "a_little" }, []), 0.5);
  assert.equal(activityReward({ ...a, usefulness: null }, []), null);
});

test("with no evidence of their own, a student gets the best-supported type", () => {
  const cls: Outcome[] = [
    ...Array(8).fill({ type: "experiment", reward: 1 }),
    ...Array(8).fill({ type: "mind_map", reward: 0 }),
  ];
  const p = pickArm(armStats([], cls, null), "seed");
  assert.equal(p.type, "experiment");
  assert.equal(p.explored, false);
  assert.match(pickReason(p, null), /class's results/);
});

test("the check-in gives its type a head start, which a strong class record can still beat", () => {
  assert.equal(pickArm(armStats([], [], "mind_map"), "s").type, "mind_map");
  const cls: Outcome[] = Array(20).fill({ type: "experiment", reward: 1 });
  assert.equal(pickArm(armStats([], cls, "mind_map"), "s").type, "experiment");
});

test("a student's own results soon outweigh the class's", () => {
  const cls: Outcome[] = Array(12).fill({ type: "experiment", reward: 1 });
  const own: Outcome[] = [...Array(4).fill({ type: "experiment", reward: 0 }), ...Array(4).fill({ type: "worked_example", reward: 1 })];
  const stats = armStats(own, cls, null);
  const best = [...stats].sort((a, b) => b.mean - a.mean)[0]!;
  assert.equal(best.type, "worked_example");
  // Thompson sampling mostly follows the evidence but still tries the others now and then.
  const picks = Array.from({ length: 400 }, (_, i) => pickArm(stats, `s${i}`).type);
  const share = picks.filter((t) => t === "worked_example").length / picks.length;
  assert.ok(share > 0.5, `worked_example picked ${share}`);
  assert.ok(share < 1, "never explores");
});

test("the same evidence and seed give the same pick", () => {
  const stats = armStats([{ type: "try_first", reward: 1 }], [], null);
  assert.equal(pickArm(stats, "abc").type, pickArm(stats, "abc").type);
  assert.deepEqual(ARMS.length, stats.length);
});

test("Beta samples have the right mean", () => {
  const r = rng("beta");
  const n = 4000;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += betaSample(3, 1.5, r);
  assert.ok(Math.abs(sum / n - 3 / 4.5) < 0.02, `mean ${sum / n}`);
});
