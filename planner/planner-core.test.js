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

assert.equal(core.startOfWeek("2026-08-11"), "2026-08-10");
assert.equal(core.startOfWeek("2026-08-16"), "2026-08-10");
assert.equal(core.startOfWeek("2027-01-01"), "2026-12-28");
assert.equal(core.startOfWeek("not-a-date"), null);
assert.equal(core.addDays("2026-12-31", 1), "2027-01-01");
assert.equal(core.addDays("2026-08-11", 1.5), null);

const weeklyEntries = [
  ...entries,
  { id: "outside", planned_date: "2026-08-17", meal_slot: "lunch", planned_time: "12:30" }
];
const week = core.weekForDate("2026-08-12", weeklyEntries);
assert.equal(week.startDate, "2026-08-10");
assert.equal(week.endDate, "2026-08-16");
assert.equal(week.days.length, 7);
assert.deepEqual(week.days.map(day => day.date), [
  "2026-08-10",
  "2026-08-11",
  "2026-08-12",
  "2026-08-13",
  "2026-08-14",
  "2026-08-15",
  "2026-08-16"
]);
assert.deepEqual(week.entries.map(entry => entry.id), ["lunch", "breakfast", "dinner"]);
assert.equal(week.days[2].entries[0].id, "lunch");
assert.deepEqual(core.weekForDate("invalid", entries), {
  startDate: null,
  endDate: null,
  days: [],
  entries: []
});

console.log("Planner Core: 26 controlli superati.");
