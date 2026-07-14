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
