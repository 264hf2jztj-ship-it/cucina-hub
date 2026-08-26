"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./dashboard-core.js");

const NOW = new Date("2026-08-26T15:00:00");

test("date helpers preserve local calendar dates and Monday week starts", () => {
  assert.equal(core.dateValue(NOW), "2026-08-26");
  assert.equal(core.mondayFor("2026-08-26"), "2026-08-24");
  assert.equal(core.addDays("2026-08-31", 1), "2026-09-01");
});

test("mealTitle uses recipe data and then ordered meal items", () => {
  const recipes = new Map([["r1", { code: "R-1", title: "Pollo al forno" }]]);
  assert.equal(core.mealTitle({ recipe_id: "r1" }, recipes), "R-1 — Pollo al forno");
  assert.equal(core.mealTitle({ planned_meal_items: [
    { position: 2, label: "Verdure" },
    { position: 1, label: "Riso" }
  ] }), "Riso · Verdure");
});

test("summary derives operational counts and skips meals whose time already passed", () => {
  const result = core.summary({
    now: NOW,
    recipes: [{ id: "r1", code: "R-1", title: "Cena" }],
    meals: [
      { id: "past", recipe_id: "r1", planned_date: "2026-08-26", planned_time: "12:00" },
      { id: "next", recipe_id: "r1", planned_date: "2026-08-26", planned_time: "20:00" },
      { id: "tomorrow", recipe_id: "r1", planned_date: "2026-08-27", planned_time: null }
    ],
    tasks: [
      { id: "overdue", title: "Marina", scheduled_date: "2026-08-25", status: "todo" },
      { id: "done", title: "Taglia", scheduled_date: "2026-08-26", status: "done" }
    ],
    shopping: [
      { is_checked: false, is_excluded: false },
      { is_checked: true, is_excluded: false }
    ],
    notifications: [
      { due: true, unread: true, status: "unread" },
      { due: true, unread: false, status: "read" }
    ]
  });
  assert.equal(result.todayMeals, 2);
  assert.equal(result.prepDue, 1);
  assert.equal(result.shoppingOpen, 1);
  assert.equal(result.notificationsUnread, 1);
  assert.equal(result.nextMeal.id, "next");
  assert.equal(result.agenda.some(item => item.id === "meal:past"), false);
  assert.equal(result.agenda[0].id, "prep:overdue");
  assert.equal(result.agenda[0].overdue, true);
});

test("planner links route directly to the selected module and date", () => {
  assert.equal(
    core.plannerHref("meal-plan", "2026-08-26", "2026-08-27"),
    "planner/workspace.html?v=14&section=meal-plan&week=2026-08-26&date=2026-08-27"
  );
});
