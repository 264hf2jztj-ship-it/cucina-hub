"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "lab.css"), "utf8");
const js = fs.readFileSync(path.join(__dirname, "lab.js"), "utf8");
const home = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const categories = JSON.parse(fs.readFileSync(path.join(__dirname, "../categorie.json"), "utf8"));

const doughCategory = categories.categorie.find(category => category.id === "pizza-impasti");
assert.ok(doughCategory);
assert.equal(doughCategory.stato, "attiva");
assert.equal(doughCategory.href, "fermentation/index.html?v=1");
assert.equal(doughCategory.etichetta_stato, "Operativa");

assert.match(home, /href="fermentation\/index\.html\?v=1"[^>]*><span>🍕<\/span> Pizza e impasti<\/a>/i);
assert.match(home, /app\.js\?v=17/i);
assert.match(app, /category\.href/);
assert.match(app, /category\.etichetta_stato/);

for (const stateId of ["pageStatus", "authGate", "doughLabWorkspace"]) {
  assert.match(html, new RegExp(`id=["']${stateId}["']`));
}

for (const destination of [
  "baking-wizard.html?v=22",
  "baking-sessions.html?v=9",
  "baking-session-history.html?v=5",
  "fermentation-learning.html?v=2",
  "environment-profiles.html?v=1",
  "flour-profiles.html?v=1",
  "dough-profiles.html?v=1"
]) {
  assert.match(html, new RegExp(destination.replace(/[.?]/g, "\\$&")));
}

assert.match(html, /OPERATIVO/);
assert.match(html, /AI Fermentation Assistant resta separata/);
assert.doesNotMatch(html, /href="fermentation-assistant\.html/i);
assert.match(js, /client\.auth\.getSession\(\)/);
assert.match(js, /workspace\.hidden = false/);
assert.match(css, /min-height:\s*48px/i);
assert.match(css, /@media \(max-width: 760px\)/i);
assert.match(css, /grid-template-columns:\s*repeat\(4,\s*minmax/i);

async function renderAuthenticationState(authenticated) {
  const elements = new Map([
    ["#pageStatus", { textContent: "", className: "" }],
    ["#authGate", { hidden: true }],
    ["#doughLabWorkspace", { hidden: true }]
  ]);
  const sandbox = {
    window: {
      cucinaHubSupabase: {
        auth: {
          async getSession() {
            return {
              data: { session: authenticated ? { user: { id: "user-1" } } : null },
              error: null
            };
          }
        }
      }
    },
    document: {
      querySelector(selector) {
        return elements.get(selector) ?? null;
      }
    }
  };

  vm.runInNewContext(js, sandbox, { filename: "lab.js" });
  await new Promise(resolve => setImmediate(resolve));
  return elements;
}

(async () => {
  const authenticated = await renderAuthenticationState(true);
  assert.equal(authenticated.get("#authGate").hidden, true);
  assert.equal(authenticated.get("#doughLabWorkspace").hidden, false);
  assert.equal(authenticated.get("#pageStatus").textContent, "Laboratorio pronto.");

  const anonymous = await renderAuthenticationState(false);
  assert.equal(anonymous.get("#authGate").hidden, false);
  assert.equal(anonymous.get("#doughLabWorkspace").hidden, true);
  assert.match(anonymous.get("#pageStatus").textContent, /Accedi dalla Dashboard/);

  console.log("Laboratorio impasti: Dashboard, collegamenti e accesso verificati.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
