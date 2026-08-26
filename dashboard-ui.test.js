"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const index = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const auth = fs.readFileSync("auth.js", "utf8");
const dashboard = fs.readFileSync("dashboard.js", "utf8");
const css = fs.readFileSync("dashboard.css", "utf8");
const serviceWorker = fs.readFileSync("sw.js", "utf8");

test("home loads the Dashboard Core assets after the authenticated Supabase client", () => {
  assert.match(index, /dashboard-core\.js\?v=1/i);
  assert.match(index, /dashboard\.css\?v=1/i);
  assert.match(index, /planner\/notifications-core\.js\?v=2[\s\S]*dashboard\.js\?v=1/i);
  assert.match(serviceWorker, /cucina-hub-v18/i);
  assert.match(serviceWorker, /dashboard-core\.js/);
});

test("dashboard renders the operational metrics, agenda and quick actions", () => {
  for (const id of [
    "dashboardNextMeal",
    "dashboardDataStatus",
    "dashboardMealMetric",
    "dashboardPrepMetric",
    "dashboardShoppingMetric",
    "dashboardNotificationMetric",
    "dashboardAgenda"
  ]) assert.match(app, new RegExp(`\\"${id}\\"`));

  for (const label of ["Planner Hub", "Lista spesa", "Meal Prep", "Notifiche", "Laboratorio", "Ricerca"]) {
    assert.match(app, new RegExp(`\\"${label}\\"`, "i"));
  }
});

test("authenticated and view-rendered events refresh the private summary", () => {
  assert.match(auth, /cucina-hub:authenticated/);
  assert.match(app, /cucina-hub:view-rendered/);
  assert.match(dashboard, /client\.auth\.getSession\(\)/);
  assert.match(dashboard, /\.from\("planned_meals"\)/);
  assert.match(dashboard, /\.from\("meal_prep_tasks"\)/);
  assert.match(dashboard, /\.from\("shopping_list_items"\)/);
  assert.match(dashboard, /\.from\("planner_notification_states"\)/);
  assert.match(dashboard, /\.eq\("owner_user_id", user\.id\)/);
});

test("touch targets and mobile action layout are explicit", () => {
  assert.match(css, /min-height:\s*76px/i);
  assert.match(css, /@media \(max-width:\s*600px\)/i);
  assert.match(css, /dashboard-action-grid\s*\{\s*grid-template-columns:\s*1fr/i);
});
