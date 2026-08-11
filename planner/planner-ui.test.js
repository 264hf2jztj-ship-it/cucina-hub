"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "planner.css"), "utf8");
const js = fs.readFileSync(path.join(__dirname, "planner.js"), "utf8");
const home = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

for (const stateId of ["pageStatus", "authGate", "errorPanel", "plannerWorkspace", "mealList"]) {
  assert.match(html, new RegExp(`id=["']${stateId}["']`));
}

for (const fieldId of ["plannedDate", "mealSlot", "plannedTime", "servings", "recipeId", "mealNote"]) {
  assert.match(html, new RegExp(`id=["']${fieldId}["']`));
}

assert.match(html, /aria-live="polite"/i);
assert.match(html, /planner-core\.js\?v=1/i);
assert.match(home, /href="planner\/index\.html\?v=1"/i);
assert.match(css, /min-height:\s*48px/i);
assert.match(css, /@media \(max-width: 900px\)/i);
assert.match(js, /\.from\("recipes"\)/i);
assert.match(js, /\.from\("planned_meals"\)/i);
assert.match(js, /\.insert\(payload\)/i);
assert.match(js, /\.update\(payload\)/i);
assert.match(js, /\.delete\(\)/i);
assert.match(js, /client\.auth\.getSession\(\)/i);
assert.match(js, /owner_user_id:\s*state\.ownerUserId/i);
assert.match(js, /migration 040_planner_core\.sql/i);

console.log("Planner UI: 24 controlli statici superati.");
