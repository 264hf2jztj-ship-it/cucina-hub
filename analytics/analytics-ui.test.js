"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("analytics/index.html", "utf8");
const js = fs.readFileSync("analytics/analytics.js", "utf8");
const css = fs.readFileSync("analytics/analytics.css", "utf8");
const home = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

test("Analytics offers bounded periods and dedicated assets", () => {
  for (const days of [30, 90, 365]) assert.match(html, new RegExp(`value=["']${days}["']`));
  assert.match(html, /analytics-core\.js\?v=1/);
  assert.match(html, /analytics\.js\?v=1/);
  assert.match(html, /analytics\.css\?v=1/);
});

test("Analytics is authenticated and scopes all four sources to the owner", () => {
  assert.match(html, /auth-guard\.js\?v=1/);
  assert.match(js, /CucinaHubAuthGuard\.requireAdministrator\(client\)/);
  for (const table of ["planned_meals", "meal_prep_tasks", "baking_sessions", "recipes"]) assert.match(js, new RegExp(`\\.from\\(\\"${table}\\"\\)`));
  assert.equal((js.match(/\.eq\("owner_user_id", user\.id\)/g) || []).length, 4);
  assert.match(js, /\.gte\("planned_date", queryStart\)/);
  assert.match(js, /\.lte\("planned_date", range\.end\)/);
});

test("navigation, Dashboard and offline shell expose Analytics", () => {
  assert.match(home, /href="analytics\/index\.html\?v=1"[^>]*>.*Analytics/s);
  assert.match(app, /"Analytics"[\s\S]*"analytics\/index\.html\?v=1"/);
  assert.match(sw, /const CACHE_NAME = "cucina-hub-v\d+";/);
  assert.match(sw, /analytics\/index\.html/);
  assert.match(sw, /analytics\/analytics-core\.js/);
});

test("Analytics remains descriptive and touch-first", () => {
  assert.match(html, /Analytics ≠ Learning/);
  assert.match(html, /non produce relazioni di causa-effetto/);
  assert.match(css, /min-height:48px/);
  assert.match(css, /@media\(max-width:600px\)/);
});
