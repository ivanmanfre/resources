import assert from "node:assert/strict";
import { test } from "node:test";
import score from "./assessment-score.js"; // CJS default import

test("safeEval computes arithmetic from ctx", () => {
  assert.equal(score.safeEval("(a + b) / 2", { a: 100, b: 0 }), 50);
});

test("safeEval rejects non-whitelisted expressions", () => {
  assert.equal(score.safeEval("window.location", { window: 1 }), null);
});

test("normalizeAnswer: likert maps value/max to 0-100", () => {
  assert.equal(score.normalizeAnswer({ type: "likert", max_score: 5 }, 4), 80);
});

test("normalizeAnswer: number uses normalize_formula", () => {
  assert.equal(score.normalizeAnswer({ type: "number", normalize_formula: "Math.min(100, x*8)" }, 6), 48);
});

test("computeResult: demo-shaped data yields non-zero overall + computed outputs", () => {
  const data = {
    slug: "t",
    categories: [
      { id: "c1", questions: [{ id: "q1", type: "likert", max_score: 5 }], scoring_formula: "q1_score" }
    ],
    computed_outputs: [{ id: "leak", label: "Leak", format: "currency", formula: "q1_score * 10" }],
    tier_thresholds: { low: 40, mid: 70 }
  };
  const res = score.computeResult(data, { q1: 4 }); // likert 4/5 => 80
  assert.equal(res.overall, 80);
  assert.equal(res.per_category.c1.score, 80);
  assert.equal(res.computed.leak.value, 800);
});

test("normalizeAnswer: legacy untyped question scores by option index", () => {
  // Legacy shape: no `type`; answers carry `score`; raw is the chosen index.
  const q = { max_score: 5, answers: [{ label: "a", score: 1 }, { label: "b", score: 3 }, { label: "c", score: 5 }] };
  assert.equal(score.normalizeAnswer(q, 2), 100); // index 2 => score 5 => 5/5 => 100
  assert.equal(score.normalizeAnswer(q, 0), 20);  // score 1 => 1/5 => 20
});

test("normalizeAnswer: legacy question derives max from option max when max_score absent", () => {
  const q = { answers: [{ label: "a", score: 0 }, { label: "b", score: 3 }] };
  assert.equal(score.normalizeAnswer(q, 1), 100); // score 3, optMax 3 => 100
});

test("computeResult: a legacy-shaped LM yields non-zero overall (regression guard for the 0/100 bug)", () => {
  const data = {
    slug: "legacy", categories: [
      { id: "c1", name: "C1", questions: [{ id: "q1", max_score: 5, answers: [{ label: "lo", score: 1 }, { label: "hi", score: 5 }] }] }
    ], tier_thresholds: { low: 40, mid: 70 }
  };
  const res = score.computeResult(data, { q1: 1 }); // index 1 => score 5 => 100
  assert.equal(res.overall, 100);
  assert.ok(res.per_category.c1, "category must be populated, not empty");
});
