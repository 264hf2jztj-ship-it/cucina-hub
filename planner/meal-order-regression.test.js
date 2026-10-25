const test = require("node:test");
const assert = require("node:assert/strict");
const calendar = require("./calendar-core.js");
const hub = require("./planner-hub-core.js");
const dashboard = require("../dashboard-core.js");
test("calendario, hub e dashboard ordinano i pasti senza orario prima di cena", () => {
  const expected = ["breakfast", "morning_snack", "lunch", "pre_workout", "post_workout", "afternoon_snack", "dinner", "other", "unknown"];
  const meals = [...expected].reverse().map(slot => ({ id: slot, planned_date: "2026-10-26", meal_slot: slot, planned_time: null }));
  const original = structuredClone(meals);
  const tasks = [{ id: "prep-late", scheduled_date: "2026-10-26", scheduled_time: "18:00" }, { id: "prep-early", scheduled_date: "2026-10-26", scheduled_time: "08:00" }];
  const events = calendar.groupEvents(meals, tasks).get("2026-10-26");
  assert.deepEqual(calendar.filterEvents(events, "meals").map(item => item.id), expected);
  assert.deepEqual(calendar.filterEvents(events, "prep").map(item => item.id), ["prep-early", "prep-late"]);
  assert.deepEqual(hub.mealsByDate(meals).get("2026-10-26").map(item => item.id), expected);
  assert.deepEqual(dashboard.agendaItems({ meals, now: new Date("2026-10-26T06:00:00"), limit: 20 }).map(item => item.id), expected.map(id => `meal:${id}`));
  assert.deepEqual(meals, original);
  assert.equal(calendar.mealSlotLabel("post_workout"), "Post-workout");
});
test("a parità di fascia il calendario usa l'orario e separa le date", () => {
  const meals = [
    { id: "late", planned_date: "2026-10-26", meal_slot: "breakfast", planned_time: "09:00" },
    { id: "tomorrow", planned_date: "2026-10-27", meal_slot: "breakfast" },
    { id: "early", planned_date: "2026-10-26", meal_slot: "breakfast", planned_time: "07:00" }
  ];
  assert.deepEqual(calendar.groupEvents(meals).get("2026-10-26").map(item => item.id), ["early", "late"]);
  assert.deepEqual(hub.mealsByDate(meals).get("2026-10-26").map(item => item.id), ["early", "late"]);
});
