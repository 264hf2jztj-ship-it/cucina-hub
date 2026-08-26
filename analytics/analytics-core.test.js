"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./analytics-core.js");

const NOW = new Date("2026-08-26T15:00:00");

test("periodRange creates current and equally sized previous windows", () => {
  assert.deepEqual(core.periodRange(30, NOW), {
    days: 30,
    start: "2026-07-28",
    end: "2026-08-26",
    previousStart: "2026-06-28",
    previousEnd: "2026-07-27"
  });
  assert.equal(core.periodRange(12, NOW).days, 90);
});

test("summary separates current data from previous-period trends", () => {
  const result = core.summary({
    days: 30,
    now: NOW,
    meals: [
      { planned_date: "2026-08-20", meal_slot: "dinner" },
      { planned_date: "2026-08-21", meal_slot: "dinner" },
      { planned_date: "2026-07-20", meal_slot: "lunch" }
    ],
    prep: [
      { scheduled_date: "2026-08-20", status: "done" },
      { scheduled_date: "2026-08-21", status: "todo" }
    ],
    sessions: [{ status: "completed", completed_at: "2026-08-22T18:00:00Z" }],
    recipes: [
      { status: "certified", created_at: "2026-08-01T10:00:00Z" },
      { status: "experiment", created_at: "2026-06-01T10:00:00Z" }
    ]
  });
  assert.equal(result.metrics.meals.value, 2);
  assert.equal(result.metrics.meals.trend.value, 100);
  assert.equal(result.metrics.prepCompleted.rate, 50);
  assert.equal(result.metrics.sessions.value, 1);
  assert.equal(result.metrics.recipes.value, 1);
  assert.equal(result.library.totalRecipes, 2);
  assert.equal(result.library.certifiedRecipes, 1);
  assert.equal(result.mealSlots[0].label, "Cena");
});

test("weekly series keeps empty weeks and aggregates each source", () => {
  const weeks = core.weeklySeries({
    start: "2026-08-01", end: "2026-08-20",
    meals: [{ planned_date: "2026-08-03" }],
    prep: [{ scheduled_date: "2026-08-04" }],
    sessions: [{ status: "completed", completed_at: "2026-08-12T18:00:00Z" }]
  });
  assert.equal(weeks.length, 4);
  assert.deepEqual(weeks[1], { weekStart: "2026-08-03", meals: 1, prep: 1, sessions: 0 });
  assert.equal(weeks[2].sessions, 1);
});

test("empty analytics remain numerical without inferred conclusions", () => {
  const result = core.summary({ days: 90, now: NOW });
  assert.equal(result.metrics.meals.value, 0);
  assert.equal(result.metrics.prepCompleted.rate, 0);
  assert.equal(result.library.activeDays, 0);
  assert.equal(result.mealSlots.length, 0);
});
