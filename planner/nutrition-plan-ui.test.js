"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const core = require("./nutrition-plan-core.js");
const html = fs.readFileSync("planner/nutrition.html", "utf8");
const script = fs.readFileSync("planner/nutrition-plan.js", "utf8");
const fixture = JSON.parse(fs.readFileSync("planner/test-fixtures/nutrition-plan-v1-valid.json", "utf8"));

function harness({ authorized = true, empty = false, failed = false, invalid = false, modified = false } = {}) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { hidden: false, innerHTML: "", textContent: "", events: {}, classList: { toggle() {} }, replaceChildren() { this.innerHTML = ""; }, addEventListener(event, callback) { this.events[event] = callback; }, setAttribute() {} });
    return nodes.get(id);
  };
  const buttons = ["today", "week", "shopping"].map(view => ({ ...node(view), dataset: { view } }));
  const calls = [];
  const packet = structuredClone(fixture);
  if (invalid) packet.days.pop();
  packet.days[0].meals[0].title = '<img src=x onerror="alert(1)">';
  const tableData = {
    planner_menu_packages: empty ? [] : [{ id: "p1", import_status: "confirmed", period_start: "2026-10-12", period_end: "2026-10-18", source_external_id: packet.plan.external_id, source_revision: 1 }],
    nutrition_plan_weeks: [{ planner_menu_package_id: "p1", source_payload: packet }],
    recipes: [{ code: "COUS-SALMONE-001", id: "recipe-1" }],
    planned_meals: [{ is_user_modified: modified, planned_meal_items: [] }]
  };
  let authCallback;
  const client = {
    auth: { onAuthStateChange(callback) { authCallback = callback; } },
    from(table) {
      const call = { table, filters: [] }; calls.push(call);
      const query = { select() { return query; }, eq(key, value) { call.filters.push([key, value]); return query; }, in(key, value) { call.filters.push([key, value]); return query; }, then(resolve) { return Promise.resolve({ data: tableData[table], error: failed ? { code: "NETWORK" } : null }).then(resolve); } };
      return query;
    }
  };
  const context = {
    window: { CucinaHubNutritionGuidance: require("./nutrition-guidance.js"), cucinaHubSupabase: client, CucinaHubNutritionPlanCore: { ...core, today: () => "2026-10-12", monday: value => core.monday(value || "2026-10-12") }, CucinaHubAuthGuard: { async requireAdministrator() { return { authorized, user: authorized ? { id: "owner" } : null }; } }, setTimeout },
    document: { getElementById: node, querySelectorAll: selector => selector === "[data-view]" ? buttons : [], addEventListener() {}, hidden: false },
    location: { search: "?week=2026-10-12", href: "https://example.test/planner/nutrition.html?week=2026-10-12" },
    history: { replaceState() {} }, navigator: { onLine: true }, URLSearchParams, URL, Intl, Date, setTimeout
  };
  vm.runInNewContext(script, context);
  return { node, buttons, calls, signOut: () => authCallback("SIGNED_OUT") };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
test("letture private, Oggi, alternative, ricette e spesa senza scritture", async () => {
  const app = harness({ modified: true }); await flush();
  assert.equal(app.node("nutritionPlan").hidden, false);
  for (const call of app.calls) assert.ok(call.filters.some(([key, value]) => key === "owner_user_id" && value === "owner"));
  assert.match(app.node("nutritionContent").innerHTML, /&lt;img/);
  assert.doesNotMatch(app.node("nutritionContent").innerHTML, /<img/);
  assert.match(app.node("nutritionContent").innerHTML, /Pre-workout|Pre-workout/i);
  assert.match(app.node("nutritionContent").innerHTML, /Alternative \(1\)/);
  assert.match(app.node("nutritionContent").innerHTML, /recipe=recipe-1/);
  assert.match(app.node("nutritionMessage").textContent, /modificati nel Planner/);
  app.buttons[2].events.click();
  assert.match(app.node("nutritionContent").innerHTML, /Lista della spesa/);
  app.buttons[1].events.click();
  assert.equal((app.node("nutritionContent").innerHTML.match(/class="hub-panel nutrition-day"/g) || []).length, 7);
  app.signOut();
  assert.equal(app.node("nutritionPlan").hidden, true);
  assert.equal(app.node("nutritionContent").innerHTML, "");
});
test("assenza piano, invalidità, errori rete e accesso negato sono distinti", async () => {
  const empty = harness({ empty: true }); await flush();
  assert.match(empty.node("nutritionMessage").textContent, /Nessun piano/);
  const invalid = harness({ invalid: true }); await flush();
  assert.match(invalid.node("nutritionMessage").textContent, /non validi/);
  const failed = harness({ failed: true }); await flush();
  assert.equal(failed.node("nutritionRetry").hidden, false);
  const signedOut = harness({ authorized: false }); await flush();
  assert.equal(signedOut.calls.length, 0);
  assert.equal(signedOut.node("nutritionAuth").hidden, false);
});
test("integrazione dashboard, navigazione, accessibilità e shell offline senza dati privati", () => {
  assert.match(html, /auth-guard\.js\?v=1/);
  assert.match(html, /page-navigation\.js\?v=1/);
  assert.match(html, /aria-pressed="true"/);
  assert.doesNotMatch(script, /localStorage|indexedDB|\.insert\(|\.update\(|\.delete\(/);
  assert.match(fs.readFileSync("app.js", "utf8"), /"Piano Alimentare"[\s\S]*planner\/nutrition\.html/);
  const sw = fs.readFileSync("sw.js", "utf8");
  for (const asset of ["nutrition.html", "nutrition-plan.js", "nutrition-plan-core.js", "nutrition-plan-contract.js", "nutrition-plan.css"]) assert.ok(sw.includes(asset));
  assert.match(fs.readFileSync("planner/nutrition-plan.css", "utf8"), /min-height: 48px/);
});
