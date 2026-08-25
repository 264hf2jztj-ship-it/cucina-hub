"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = name => fs.readFileSync(path.join(__dirname, name), "utf8");
const hub = read("index.html");
const workspace = read("workspace.html");
const css = read("planner-hub.css");
const js = read("planner-hub.js");
const plannerJs = read("planner.js");
const home = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

test("Planner Hub exposes one weekly summary and the five requested entry cards", () => {
  for (const id of [
    "hubWeekGrid",
    "hubWeekRange",
    "hubPreviousWeek",
    "hubCurrentWeek",
    "hubNextWeek",
    "shoppingModule",
    "prepModule",
    "mealModule"
  ]) assert.match(hub, new RegExp(`id=["']${id}["']`));

  for (const label of ["Lista spesa", "Notifiche", "Menu Package", "Meal Prep", "Pianifica pasto"]) {
    assert.match(hub, new RegExp(`>${label}<`, "i"));
  }

  assert.match(hub, /workspace\.html\?v=14&amp;section=shopping-list/i);
  assert.match(hub, /notifications\.html\?v=2/i);
  assert.match(hub, /workspace\.html\?v=14&amp;section=menu-package/i);
  assert.match(hub, /workspace\.html\?v=14&amp;section=meal-prep/i);
  assert.match(hub, /workspace\.html\?v=14&amp;section=meal-plan/i);
});

test("Hub identifiers are unique and assets are versioned", () => {
  const ids = [...hub.matchAll(/\sid=["']([^"']+)["']/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(hub, /planner-hub\.css\?v=1/i);
  assert.match(hub, /planner-hub-core\.js\?v=1/i);
  assert.match(hub, /planner-hub\.js\?v=1/i);
  assert.match(home, /planner\/index\.html\?v=14/i);
});

test("weekly summary is touch-first and loads only the selected week", () => {
  assert.match(css, /min-height:\s*48px/i);
  assert.match(css, /overflow-x:\s*auto/i);
  assert.match(css, /@media \(max-width:\s*720px\)/i);
  assert.match(js, /\.gte\("planned_date",\s*week\.startDate\)/i);
  assert.match(js, /\.lte\("planned_date",\s*week\.endDate\)/i);
  assert.match(js, /function updateLinks\(\)/i);
  assert.match(js, /history\.replaceState/i);
});

test("operational workspace contains routed, isolated modules", () => {
  for (const section of ["meal-plan", "shopping-list", "meal-prep", "menu-package"]) {
    assert.match(workspace, new RegExp(`data-planner-module=["']${section}["']`));
    assert.match(plannerJs, new RegExp(`${section.replace("-", "\\-")}`));
  }
  assert.match(workspace, /id="backPlannerHub"[^>]+href="index\.html\?v=14"/i);
  assert.match(plannerJs, /function applyWorkspaceSection\(\)/i);
  assert.match(plannerJs, /panel\.hidden = panel\.dataset\.plannerModule !== activeWorkspaceSection/i);
});
