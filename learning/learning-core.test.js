"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./learning-core.js");

test("Learning states distinguish disabled, empty, unevaluated, building and ready histories", () => {
  assert.equal(core.statusFor({ enabled: false }), "disabled");
  assert.equal(core.statusFor({ completedSessions: 0 }), "empty");
  assert.equal(core.statusFor({ completedSessions: 2, evaluatedSessions: 0 }), "needs_evaluations");
  assert.equal(core.statusFor({ completedSessions: 2, evaluatedSessions: 1 }), "building");
  assert.equal(core.statusFor({ completedSessions: 2, evaluatedSessions: 2 }), "ready");
});

test("summary exposes evidence, quality and a reversible next action", () => {
  const model = core.summary({
    completedSessions: 4,
    excludedEvaluations: 1,
    analysis: {
      sample_count: 3,
      confidence: { level: "medium", label: "Media" },
      data_quality: { score: 78 },
      averages: { overall_rating: 4.2 },
      insights: [{ title: "Pattern", text: "Associazione osservata", evidence_count: 3 }],
      methodology: { statement: "Associazioni, non causalità." }
    }
  });
  assert.equal(model.status, "ready");
  assert.equal(model.action.href, "../fermentation/fermentation-learning.html?v=2");
  assert.equal(model.evaluatedSessions, 3);
  assert.equal(model.excludedEvaluations, 1);
  assert.equal(model.qualityScore, 78);
  assert.equal(model.methodology, "Associazioni, non causalità.");
});

test("empty histories direct the user to a real session instead of inventing insights", () => {
  const model = core.summary({ analysis: {}, completedSessions: 0 });
  assert.equal(model.status, "empty");
  assert.equal(model.insights.length, 0);
  assert.equal(model.action.href, "../fermentation/baking-wizard.html?v=22");
});
