"use strict";

const assert = require("node:assert/strict");
const core = require("./planner-core.js");

assert.deepEqual(Object.keys(core.MEAL_SLOTS), [
  "breakfast",
  "morning_snack",
  "lunch",
  "afternoon_snack",
  "dinner",
  "other"
]);

const valid = core.normalizeEntry({
  recipe_id: "recipe-1",
  planned_date: "2026-08-12",
  meal_slot: "dinner",
  planned_time: "20:30",
  servings: "3",
  note: "  Preparare il contorno prima.  "
});
assert.equal(valid.valid, true);
assert.deepEqual(valid.value, {
  recipe_id: "recipe-1",
  planned_date: "2026-08-12",
  meal_slot: "dinner",
  planned_time: "20:30",
  servings: 3,
  note: "Preparare il contorno prima."
});

assert.equal(core.normalizeEntry({
  recipe_id: "",
  planned_date: "2026-02-30",
  meal_slot: "brunch",
  planned_time: "25:00",
  servings: "1.5"
}).errors.length, 5);

assert.equal(core.normalizeEntry({
  recipe_id: "recipe-1",
  planned_date: "2026-08-12",
  meal_slot: "lunch",
  note: "x".repeat(1001)
}).valid, false);

assert.equal(core.normalizeTime("07:05:00"), "07:05");
assert.equal(core.normalizeTime(""), null);
assert.equal(core.isRealDate("2028-02-29"), true);
assert.equal(core.isRealDate("2027-02-29"), false);

const entries = [
  { id: "dinner", planned_date: "2026-08-13", meal_slot: "dinner", planned_time: "20:00" },
  { id: "breakfast", planned_date: "2026-08-13", meal_slot: "breakfast", planned_time: "08:00" },
  { id: "lunch", planned_date: "2026-08-12", meal_slot: "lunch", planned_time: null }
];

assert.deepEqual(core.sortEntries(entries).map(entry => entry.id), ["lunch", "breakfast", "dinner"]);

const groups = core.groupEntriesByDate(entries);
assert.equal(groups.length, 2);
assert.equal(groups[0].date, "2026-08-12");
assert.deepEqual(groups[1].entries.map(entry => entry.id), ["breakfast", "dinner"]);

assert.equal(core.localDateValue(new Date(2026, 7, 11, 23, 30)), "2026-08-11");

console.log("Planner Core: 13 controlli superati.");
