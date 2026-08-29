"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const index = read("index.html");
const dashboardShortcut = read("dashboard-ai-shortcut.js");
const chef = read("chef/index.html");
const planner = read("planner/ai.html");
const rag = read("knowledge/rag.html");
const fermentationProvider = read("fermentation/assistant-provider-ui.js");

test("dashboard operativa espone solo la scorciatoia Assistente AI", () => {
  assert.match(index, /dashboard-ai-shortcut\.js\?v=1/);
  assert.match(dashboardShortcut, /href="ai\/index\.html\?v=2"/);
  assert.match(dashboardShortcut, /<strong>Assistente AI<\/strong>/);
  assert.doesNotMatch(dashboardShortcut, /fermentation-assistant\.html/);
});

test("le sezioni AI permettono di tornare all'Assistente AI Hub", () => {
  assert.match(chef, /href="\.\.\/ai\/index\.html\?v=2"/);
  assert.match(planner, /href="\.\.\/ai\/index\.html\?v=2"/);
  assert.match(rag, /href="\.\.\/ai\/index\.html\?v=2"/);
  assert.match(fermentationProvider, /href = "\.\.\/ai\/index\.html\?v=2"/);
  assert.match(fermentationProvider, /data\.aiHubLink = "true"/);
});

test("il menu principale instrada direttamente all'AI Hub", () => {
  assert.match(index, /href="ai\/index\.html\?v=2"[^>]*><span>✨<\/span> Assistente AI<\/a>/);
});
