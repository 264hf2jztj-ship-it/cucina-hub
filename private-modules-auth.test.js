"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const modules = [
  ["Pizza e impasti", "fermentation/index.html", "fermentation/lab.js"],
  ["Learning", "learning/index.html", "learning/learning.js"],
  ["Analytics", "analytics/index.html", "analytics/analytics.js"],
  ["Esperimenti", "experiments/index.html", "experiments/experiments.js"],
  ["Versioni", "versions/index.html", "versions/versions.js"],
  ["Knowledge", "knowledge/index.html", "knowledge/knowledge-objects.js"],
  ["Ricerca globale", "knowledge/search.html", "knowledge/global-search.js"],
  ["Knowledge Graph", "knowledge/graph.html", "knowledge/knowledge-graph.js"],
  ["Tag Engine", "knowledge/tags.html", "knowledge/tag-engine.js"]
];

test("every primary private module uses the shared administrator guard", () => {
  for (const [name, htmlPath, scriptPath] of modules) {
    const html = fs.readFileSync(htmlPath, "utf8");
    const script = fs.readFileSync(scriptPath, "utf8");

    assert.match(html, /auth-guard\.js\?v=1/, `${name}: auth-guard non caricato`);
    assert.match(
      script,
      /CucinaHubAuthGuard\.requireAdministrator\(client\)/,
      `${name}: controllo amministratore non applicato`
    );
    assert.doesNotMatch(
      script,
      /client\.auth\.getSession\(\)/,
      `${name}: controllo sessione locale non deve sostituire il guard condiviso`
    );
  }
});

test("the shared guard stays available in the offline app shell", () => {
  const worker = fs.readFileSync("sw.js", "utf8");
  assert.match(worker, /const CACHE_NAME = "cucina-hub-v43";/);
  assert.match(worker, /"\.\/auth-guard\.js"/);
});
