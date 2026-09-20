"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { canUseBrowserBack } = require("./page-navigation.js");

const operationalPages = [
  "ai/index.html",
  "analytics/index.html",
  "appliances/open.html",
  "chef/index.html",
  "courses/detail.html",
  "experiments/index.html",
  "fermentation/baking-session-history.html",
  "fermentation/baking-sessions.html",
  "fermentation/baking-wizard.html",
  "fermentation/dough-profiles.html",
  "fermentation/environment-profiles.html",
  "fermentation/fermentation-assistant.html",
  "fermentation/fermentation-diary.html",
  "fermentation/fermentation-learning.html",
  "fermentation/flour-profiles.html",
  "fermentation/index.html",
  "knowledge/graph.html",
  "knowledge/index.html",
  "knowledge/rag.html",
  "knowledge/search.html",
  "knowledge/tags.html",
  "learning/index.html",
  "library/reader.html",
  "planner/ai.html",
  "planner/calendar.html",
  "planner/index.html",
  "planner/notifications.html",
  "planner/workspace.html",
  "versions/index.html",
  "workflow-engine/guided-session.html"
];

test("browser back is allowed only for another Cucina Hub page", () => {
  const current = "https://example.test/cucina-hub/fermentation/baking-wizard.html";
  const dashboard = "https://example.test/cucina-hub/index.html?v=24";

  assert.equal(canUseBrowserBack("https://example.test/cucina-hub/fermentation/index.html", current, dashboard, 3), true);
  assert.equal(canUseBrowserBack("https://external.test/page", current, dashboard, 3), false);
  assert.equal(canUseBrowserBack("https://example.test/cucina-hub-evil/page", current, dashboard, 3), false);
  assert.equal(canUseBrowserBack(current, current, dashboard, 3), false);
  assert.equal(canUseBrowserBack("https://example.test/cucina-hub/index.html", current, dashboard, 1), false);
});

test("every operational page loads the shared navigation control", () => {
  for (const page of operationalPages) {
    const html = fs.readFileSync(page, "utf8");
    assert.match(html, /\.\.\/page-navigation\.js\?v=1/, `${page}: navigazione condivisa assente`);
  }
});

test("the shared navigation stays available in the offline shell", () => {
  const worker = fs.readFileSync("sw.js", "utf8");
  assert.match(worker, /const CACHE_NAME = "cucina-hub-v\d+";/);
  assert.match(worker, /"\.\/page-navigation\.js"/);
});
