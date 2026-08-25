"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./planner-hub-core.js");

test("mealLabel prefers the linked recipe and falls back to ordered meal items", () => {
  const recipes = new Map([["recipe-1", { code: "R-1", title: "Pollo al forno" }]]);
  assert.equal(core.mealLabel({ recipe_id: "recipe-1" }, recipes), "R-1 — Pollo al forno");
  assert.equal(
    core.mealLabel({ planned_meal_items: [
      { position: 2, label: "Insalata" },
      { position: 1, label: "Riso" },
      { position: 3, label: "Frutta" }
    ] }),
    "Riso · Insalata +1"
  );
  assert.equal(core.mealLabel({}), "Pasto pianificato");
});

test("mealsByDate groups meals and orders timed meals first", () => {
  const grouped = core.mealsByDate([
    { id: "late", planned_date: "2026-08-25", planned_time: null, meal_slot: "dinner" },
    { id: "lunch", planned_date: "2026-08-25", planned_time: "13:00", meal_slot: "lunch" },
    { id: "other-day", planned_date: "2026-08-26", planned_time: "08:00", meal_slot: "breakfast" }
  ]);
  assert.deepEqual(grouped.get("2026-08-25").map(item => item.id), ["lunch", "late"]);
  assert.equal(grouped.get("2026-08-26")[0].id, "other-day");
});

test("moduleHref preserves the selected section, week and optional date", () => {
  assert.equal(
    core.moduleHref("meal-plan", "2026-08-25", { date: "2026-08-27" }),
    "workspace.html?v=14&section=meal-plan&week=2026-08-25&date=2026-08-27"
  );
});

test("counts reports only active shopping rows, unfinished prep and pending packages", () => {
  assert.deepEqual(core.counts({
    meals: [{}, {}],
    tasks: [{ status: "todo" }, { status: "in_progress" }, { status: "done" }],
    shopping: [
      { is_checked: false, is_excluded: false },
      { is_checked: true, is_excluded: false },
      { is_checked: false, is_excluded: true }
    ],
    packages: [{ status: "pending" }, { status: "cancelled" }]
  }), {
    meals: 2,
    prep: 3,
    prepTodo: 2,
    shopping: 1,
    packages: 1
  });
});
