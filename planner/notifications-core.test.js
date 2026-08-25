const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./notifications-core.js");

const NOW = new Date("2026-08-25T18:00:00");

function meal(overrides = {}) {
  return {
    id: "meal-1",
    recipe_id: "recipe-1",
    planned_date: "2026-08-25",
    planned_time: "20:00",
    meal_slot: "dinner",
    updated_at: "2026-08-25T10:00:00Z",
    planned_meal_items: [],
    ...overrides
  };
}

function task(overrides = {}) {
  return {
    id: "task-1",
    title: "Taglia le verdure",
    scheduled_date: "2026-08-25",
    scheduled_time: "18:15",
    status: "todo",
    updated_at: "2026-08-25T09:00:00Z",
    ...overrides
  };
}

test("buildNotifications derives meal and Meal Prep reminders", () => {
  const notifications = core.buildNotifications({
    meals: [meal()],
    tasks: [task()],
    recipes: [{ id: "recipe-1", code: "R-1", title: "Pollo al forno" }],
    now: NOW
  });
  assert.equal(notifications.length, 2);
  assert.equal(notifications[0].source_type, "meal_prep_task");
  assert.equal(notifications[0].due, true);
  assert.equal(notifications[0].href, "workspace.html?v=14&section=meal-prep&week=2026-08-25");
  assert.equal(notifications[1].title, "R-1 — Pollo al forno");
  assert.equal(notifications[1].due, false);
  assert.equal(notifications[1].href, "workspace.html?v=14&section=meal-plan&week=2026-08-25&date=2026-08-25");
});

test("items without a time and completed prep tasks do not create reminders", () => {
  const notifications = core.buildNotifications({
    meals: [meal({ planned_time: null })],
    tasks: [task({ status: "done" })],
    now: NOW
  });
  assert.deepEqual(notifications, []);
});

test("a receipt is valid only for the current source revision", () => {
  const baseState = {
    source_type: "planned_meal",
    source_id: "meal-1",
    source_updated_at: "2026-08-25T10:00:00Z",
    status: "read"
  };
  const read = core.buildNotifications({ meals: [meal()], states: [baseState], now: NOW });
  assert.equal(read[0].status, "read");
  const rescheduled = core.buildNotifications({
    meals: [meal({ updated_at: "2026-08-25T11:00:00Z" })],
    states: [baseState],
    now: NOW
  });
  assert.equal(rescheduled[0].status, "unread");
});

test("disabled categories are excluded and lead times are configurable", () => {
  const notifications = core.buildNotifications({
    meals: [meal()],
    tasks: [task()],
    preferences: {
      meals_enabled: false,
      meal_prep_enabled: true,
      meal_prep_lead_minutes: 0
    },
    now: NOW
  });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].source_type, "meal_prep_task");
  assert.equal(notifications[0].remind_at.getTime(), notifications[0].event_at.getTime());
});

test("grouping, unread count and state payload are stable", () => {
  const notifications = core.buildNotifications({ meals: [meal()], tasks: [task()], now: NOW });
  const groups = core.groupNotifications(notifications);
  assert.equal(groups.due.length, 1);
  assert.equal(groups.upcoming.length, 1);
  assert.equal(core.unreadCount(notifications), 1);
  assert.deepEqual(
    core.statePayload(notifications[0], "read", new Date("2026-08-25T18:01:00Z")),
    {
      source_type: "meal_prep_task",
      source_id: "task-1",
      source_updated_at: "2026-08-25T09:00:00Z",
      status: "read",
      read_at: "2026-08-25T18:01:00.000Z",
      dismissed_at: null
    }
  );
});
