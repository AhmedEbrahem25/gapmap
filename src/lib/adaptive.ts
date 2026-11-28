import type { ActivityType } from "./db/schema";
import { ACTIVITY_LABEL } from "./profile-rules";

/**
 * The adaptive learner model. Pure functions, no AI, no database: every input is a mark or a tap
 * already stored on GapMap's server.
 *
 * - Learner profile: Bayesian Knowledge Tracing (BKT) estimates, per concept, how likely it is that
 *   the student has it now, updated after every marked answer.
 * - Learner plan: a Thompson-sampling bandit learns which activity type helps this student, starting
 *   from the check-in and the class's results, then from the student's own.
 */

/* ───────── Learner profile: Bayesian Knowledge Tracing ───────── */

export type BktParams = { init: number; learn: number; slip: number; guess: number };

/** Textbook starting values (Corbett & Anderson 1995). Refit per course once a pilot has data. */
export const BKT: BktParams = { init: 0.3, learn: 0.15, slip: 0.1, guess: 0.2 };

/** A concept counts as mastered at 95%, the usual BKT bar. */
export const MASTERED = 0.95;

/**
 * One update after an answer that scored `ratio` (0..1). Partial marks mix the right and wrong
 * updates in proportion, then the chance of having learned it since is added.
 */
export function bktStep(p: number, ratio: number, k: BktParams = BKT) {
  const r = Math.min(1, Math.max(0, ratio));
  const right = (p * (1 - k.slip)) / (p * (1 - k.slip) + (1 - p) * k.guess);
  const wrong = (p * k.slip) / (p * k.slip + (1 - p) * (1 - k.guess));
  const seen = r * right + (1 - r) * wrong;
  return seen + (1 - seen) * k.learn;
}

export type Observation = { label: string; date: string; score: number; max: number };
export type MasteryStep = Observation & { before: number; after: number };

/** Runs BKT over a concept's answers in date order. */
export function bktTrace(obs: Observation[], k: BktParams = BKT) {
  let p = k.init;
  const steps: MasteryStep[] = [];
  for (const o of [...obs].sort((a, b) => a.date.localeCompare(b.date))) {
    if (o.max <= 0) continue;
    const after = bktStep(p, o.score / o.max, k);
    steps.push({ ...o, before: p, after });
    p = after;
  }
  return { p, steps };
}

/* ───────── Learner plan: Thompson-sampling bandit ───────── */

/** Arms the bandit chooses between. "Explain it" is kept for students who already understand. */
export const ARMS = ["experiment", "worked_example", "try_first", "mind_map"] as const satisfies readonly ActivityType[];

/** Class results count for a quarter of the student's own, so a student's own record soon decides. */
export const CLASS_WEIGHT = 0.25;
/** Pseudo-successes the check-in's preferred type starts with. */
export const PREFERENCE_BONUS = 2;

export type Outcome = { type: ActivityType; reward: number };
export type ArmStat = { type: ActivityType; own: { wins: number; n: number }; cls: { wins: number; n: number }; alpha: number; beta: number; mean: number };

const RATING_REWARD = { a_lot: 1, a_little: 0.5, not_really: 0 } as const;

/**
 * How well one activity went. The first fresh test or marked answer on the same concept afterwards
 * decides (right at 80%); without one, the student's own rating does; with neither, it doesn't count.
 */
export function activityReward(
  a: { createdDay: string; usefulness: keyof typeof RATING_REWARD | null },
  laterAnswers: { date: string; score: number; max: number }[],
): number | null {
  const next = laterAnswers.filter((x) => x.date >= a.createdDay && x.max > 0).sort((x, y) => x.date.localeCompare(y.date))[0];
  if (next) return next.score / next.max >= 0.8 ? 1 : 0;
  return a.usefulness ? RATING_REWARD[a.usefulness] : null;
}

const tally = (outcomes: Outcome[], type: ActivityType) => {
  const mine = outcomes.filter((o) => o.type === type);
  return { wins: mine.reduce((t, o) => t + o.reward, 0), n: mine.length };
};

export function armStats(own: Outcome[], cls: Outcome[], preferred: ActivityType | null): ArmStat[] {
  return ARMS.map((type) => {
    const o = tally(own, type);
    const c = tally(cls, type);
    const alpha = 1 + o.wins + CLASS_WEIGHT * c.wins + (type === preferred ? PREFERENCE_BONUS : 0);
    const beta = 1 + (o.n - o.wins) + CLASS_WEIGHT * (c.n - c.wins);
    return { type, own: o, cls: c, alpha, beta, mean: alpha / (alpha + beta) };
  });
}

/** Small seeded PRNG, so the same evidence gives the same pick (and pages don't flicker on reload). */
export function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gamma(shape: number, rand: () => number): number {
  if (shape < 1) return gamma(shape + 1, rand) * Math.pow(rand() || 1e-12, 1 / shape);
  // Marsaglia & Tsang (2000).
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      const u1 = rand() || 1e-12;
      const u2 = rand();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rand() || 1e-12;
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}

export const betaSample = (a: number, b: number, rand: () => number) => {
  const x = gamma(a, rand);
  return x / (x + gamma(b, rand));
};

export type Pick = { type: ActivityType; explored: boolean; stats: ArmStat[] };

/**
 * Picks the next activity type. Until the student has rated or been tested after one of their own
 * activities, it takes the best-supported type (check-in plus class). After that it samples each
 * type's Beta posterior, so a type that has only been tried once still gets another chance.
 */
export function pickArm(stats: ArmStat[], seed: string): Pick {
  const best = [...stats].sort((a, b) => b.mean - a.mean)[0]!;
  const ownEvidence = stats.some((s) => s.own.n > 0);
  if (!ownEvidence) return { type: best.type, explored: false, stats };
  const rand = rng(seed);
  const drawn = stats.map((s) => ({ s, x: betaSample(s.alpha, s.beta, rand) })).sort((a, b) => b.x - a.x)[0]!.s;
  return { type: drawn.type, explored: drawn.type !== best.type, stats };
}


const times = (wins: number, n: number) => `${Math.round(wins * 10) / 10} of ${n}`;

/** The one-line reason shown on the activity, from the evidence that decided it. */
export function pickReason(p: Pick, preferred: ActivityType | null) {
  const s = p.stats.find((x) => x.type === p.type)!;
  const label = ACTIVITY_LABEL[p.type];
  if (p.explored) return `${label} haven't been tried much for you yet, so your plan is trying one to see if it suits you.`;
  if (s.own.n) return `${label} have helped you ${times(s.own.wins, s.own.n)} times, so your plan picked one.`;
  const pref = p.type === preferred ? " and your check-in" : "";
  if (s.cls.n) return `Picked from your class's results${pref}: ${label.toLowerCase()} helped ${times(s.cls.wins, s.cls.n)} times. Your own ratings will take over.`;
  return preferred === p.type ? "Chosen from your check-in. Your ratings will tune what comes next." : `${label} are a good first try. Your ratings will tune what comes next.`;
}
