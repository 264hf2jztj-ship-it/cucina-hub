"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const js = fs.readFileSync(path.join(root, "ai-hub.js"), "utf8");

test("AI Hub espone i tre assistenti e le fonti", () => {
  assert.match(html, /data-assistant="chef"/);
  assert.match(html, /data-assistant="fermentation"/);
  assert.match(html, /data-assistant="planner"/);
  assert.match(html, /data-assistant="sources"/);
});

test("AI Hub mantiene espliciti i confini di sicurezza", () => {
  assert.match(html, /non applicano modifiche automatiche/i);
  assert.match(html, /Generazione reale/);
  assert.match(html, /Chat interna conversazionale/);
  assert.match(html, /non duplica dati/i);
});

test("AI Hub richiede una sessione prima di mostrare il workspace", () => {
  assert.match(js, /client\.auth\.getSession\(\)/);
  assert.match(js, /if \(!data\.session\?\.user\)/);
  assert.match(js, /workspace\.hidden = false/);
});
