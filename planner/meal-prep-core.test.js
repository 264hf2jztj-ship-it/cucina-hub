"use strict";

const assert = require("node:assert/strict");
const mealPrep = require("./meal-prep-core.js");

const meal = {
  id: "meal-1",
  planned_date: "2026-08-18",
  planned_meal_items: [{ id: "item-1" }, { id: "item-2" }]
};

const valid = mealPrep.normalizeTask({
  planned_meal_id: "meal-1",
  planned_meal_item_id: "item-1",
  task_type: "prepare",
  title: "Taglia le verdure",
  scheduled_date: "2026-08-17",
  scheduled_time: "18:30:00",
  servings: "2",
  quantity: "350,5",
  unit: "g",
  storage_method: "refrigerator",
  storage_note: "Contenitore ermetico",
  note: "Tenere separate le foglie",
  status: "todo"
}, meal);

assert.equal(valid.valid, true);
assert.equal(valid.value.scheduled_time, "18:30");
assert.equal(valid.value.quantity, 350.5);
assert.equal(valid.value.servings, 2);

const afterMeal = mealPrep.normalizeTask({
  planned_meal_id: "meal-1",
  task_type: "cook",
  title: "Cuoci il riso",
  scheduled_date: "2026-08-19",
  storage_method: "none",
  status: "todo"
}, meal);
assert.equal(afterMeal.valid, false);
assert.match(afterMeal.errors.join(" "), /successiva al pasto/i);

const mismatchedItem = mealPrep.normalizeTask({
  planned_meal_id: "meal-1",
  planned_meal_item_id: "item-other",
  task_type: "prepare",
  title: "Prepara",
  scheduled_date: "2026-08-18",
  storage_method: "none",
  status: "todo"
}, meal);
assert.equal(mismatchedItem.valid, false);
assert.match(mismatchedItem.errors.join(" "), /non appartiene al pasto/i);

const incompleteQuantity = mealPrep.normalizeTask({
  planned_meal_id: "meal-1",
  task_type: "portion",
  title: "Porziona",
  scheduled_date: "2026-08-18",
  quantity: "2",
  storage_method: "freezer",
  status: "in_progress"
}, meal);
assert.equal(incompleteQuantity.valid, false);
assert.match(incompleteQuantity.errors.join(" "), /compilate insieme/i);

const tasks = [
  { id: "done", scheduled_date: "2026-08-17", scheduled_time: "09:00", status: "done", task_type: "store", title: "C" },
  { id: "later", scheduled_date: "2026-08-18", scheduled_time: null, status: "todo", task_type: "prepare", title: "D" },
  { id: "progress", scheduled_date: "2026-08-17", scheduled_time: "08:00", status: "in_progress", task_type: "cook", title: "B" },
  { id: "todo", scheduled_date: "2026-08-17", scheduled_time: "18:00", status: "todo", task_type: "prepare", title: "A" }
];

assert.deepEqual(mealPrep.sortTasks(tasks).map(task => task.id), ["todo", "progress", "done", "later"]);
assert.deepEqual(mealPrep.groupTasksByDate(tasks).map(group => [group.date, group.tasks.length]), [
  ["2026-08-17", 3],
  ["2026-08-18", 1]
]);
assert.deepEqual(mealPrep.summarizeTasks(tasks), { total: 4, todo: 2, in_progress: 1, done: 1 });
assert.equal(mealPrep.defaultScheduledDate(meal), "2026-08-17");

console.log("Meal Prep Core: test logici superati.");
