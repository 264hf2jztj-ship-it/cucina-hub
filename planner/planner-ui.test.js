"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "planner.css"), "utf8");
const js = fs.readFileSync(path.join(__dirname, "planner.js"), "utf8");
const home = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

for (const stateId of [
  "pageStatus",
  "authGate",
  "errorPanel",
  "plannerWorkspace",
  "mealList",
  "weekGrid",
  "weekRange",
  "weekMealCount",
  "weekEmptySummary",
  "previousWeek",
  "currentWeek",
  "nextWeek",
  "menuPlanInput",
  "menuPlanFile",
  "menuPlanFileStatus",
  "analyzeMenuPlan",
  "clearMenuPlan",
  "menuPlanResult"
]) {
  assert.match(html, new RegExp(`id=["']${stateId}["']`));
}

for (const fieldId of ["plannedDate", "mealSlot", "plannedTime", "servings", "recipeId", "mealNote"]) {
  assert.match(html, new RegExp(`id=["']${fieldId}["']`));
}

assert.match(html, /aria-live="polite"/i);
assert.match(html, /planner-core\.js\?v=2/i);
assert.match(html, /planner\.css\?v=5/i);
assert.match(html, /menu-plan-import-engine\.js\?v=3/i);
assert.match(html, /planner\.js\?v=5/i);
assert.match(home, /href="planner\/index\.html\?v=5"/i);
assert.match(html, /accept="\.json,\.md,\.txt/i);
assert.match(html, /SOLA ANALISI/i);
assert.match(css, /min-height:\s*48px/i);
assert.match(css, /@media \(max-width: 900px\)/i);
assert.match(css, /grid-template-columns:\s*repeat\(7,\s*minmax/i);
assert.match(css, /overflow-x:\s*auto/i);
assert.match(css, /\.week-day-add/i);
assert.match(css, /\.menu-import-panel/i);
assert.match(css, /\.menu-file-input::file-selector-button/i);
assert.match(css, /\.menu-idempotency/i);
assert.match(css, /\.menu-payload-hash/i);
assert.match(css, /\.menu-conflict-card/i);
assert.match(css, /\.menu-conflict-summary/i);
assert.match(js, /\.from\("recipes"\)/i);
assert.match(js, /\.from\("planned_meals"\)/i);
assert.match(js, /\.gte\("planned_date",\s*week\.startDate\)/i);
assert.match(js, /\.lte\("planned_date",\s*week\.endDate\)/i);
assert.match(js, /\.insert\(payload\)/i);
assert.match(js, /\.update\(payload\)/i);
assert.match(js, /\.delete\(\)/i);
assert.match(js, /client\.auth\.getSession\(\)/i);
assert.match(js, /owner_user_id:\s*state\.ownerUserId/i);
assert.match(js, /core\.weekForDate\(state\.weekAnchor/i);
assert.match(js, /function selectWeek\(anchorDate\)/i);
assert.match(js, /function prepareNewMeal\(plannedDate\)/i);
assert.match(js, /menuPlanEngine\.analyze\(elements\.menuInput\.value,\s*state\.recipes\)/i);
assert.match(js, /menuPlanEngine\.computePayloadHash\(result\.normalizedPacket\)/i);
assert.match(js, /menuPlanEngine\.analyzeIdempotency/i);
assert.match(js, /menuPlanEngine\.analyzeConflicts/i);
assert.match(js, /\.lte\("period_start",\s*packet\.menu\.period_end\)/i);
assert.match(js, /\.gte\("period_end",\s*packet\.menu\.period_start\)/i);
assert.match(js, /file\.size > maxBytes/i);
assert.match(js, /\.from\("planner_menu_packages"\)/i);
assert.match(js, /\.from\("planner_menu_packages"\)[\s\S]{0,180}\.select\(/i);
assert.doesNotMatch(js, /\.from\("planner_menu_packages"\)[\s\S]{0,500}\.(?:insert|update|delete)\(/i);
assert.match(js, /\.from\("planned_meal_items"\)/i);
assert.match(js, /\.from\("planned_meal_items"\)[\s\S]{0,180}\.select\(/i);
assert.doesNotMatch(js, /\.from\("planned_meal_items"\)[\s\S]{0,500}\.(?:insert|update|delete)\(/i);
assert.match(js, /migration 040_planner_core\.sql/i);

console.log("Planner UI settimanale: controlli statici superati.");
