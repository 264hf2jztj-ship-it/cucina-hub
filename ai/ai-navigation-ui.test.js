"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const index = read("index.html");
const app = read("app.js");
const chef = read("chef/index.html");
const planner = read("planner/ai.html");
const rag = read("knowledge/rag.html");
const fermentationProvider = read("fermentation/assistant-provider-ui.js");

test("dashboard operativa espone solo la scorciatoia Assistente AI", () => {
  assert.doesNotMatch(index, /dashboard-ai-shortcut\.js/);
  assert.match(index, /app\.js\?v=24/);

  for (const content of [
    "Dashboard personale",
    "dashboardNextMeal",
    "dashboardMealMetric",
    "dashboardAgenda",
    "Azioni rapide",
    "Biblioteca in breve"
  ]) assert.match(app, new RegExp(content));

  const quickActions = app.match(
    /<h3>Azioni rapide<\/h3>[\s\S]*?<div class="dashboard-action-grid">([\s\S]*?)<\/div>\s*<\/section>/
  );
  assert.ok(quickActions, "blocco Azioni rapide non trovato");
  assert.equal((quickActions[1].match(/dashboardAction\(/g) || []).length, 1);
  assert.match(quickActions[1], /"Assistente AI"/);
  assert.match(quickActions[1], /"ai\/index\.html\?v=2"/);
  assert.doesNotMatch(quickActions[1], /fermentation-assistant\.html/);
});

test("le sezioni AI permettono di tornare all'Assistente AI Hub", () => {
  assert.match(chef, /href="\.\.\/ai\/index\.html\?v=2"/);
  assert.match(planner, /href="\.\.\/ai\/index\.html\?v=2"/);
  assert.match(rag, /href="\.\.\/ai\/index\.html\?v=2"/);
  assert.match(fermentationProvider, /href = "\.\.\/ai\/index\.html\?v=2"/);
  assert.match(fermentationProvider, /dataset\.aiHubLink = "true"/);
});

test("il menu principale instrada direttamente all'AI Hub", () => {
  assert.match(index, /href="ai\/index\.html\?v=2"[^>]*><span>✨<\/span> Assistente AI<\/a>/);
});
