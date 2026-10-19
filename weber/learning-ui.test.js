"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const core = require("./learning-core.js");
const settle = () => new Promise(resolve => setImmediate(resolve));
const rows = [
  { id: "00000000-0000-4000-8000-000000000001", title: "Prima <script>", recipe_id: "r1", recipe: { title: "Pollo <b>" }, status: "completed", rating: 4, cooking_method: "indirect", fuel_type: "briquettes", cooked_at: "2026-10-18" },
  { id: "00000000-0000-4000-8000-000000000002", title: "Seconda", recipe_id: "r1", recipe: { title: "Pollo <b>" }, status: "completed", rating: null, cooking_method: "indirect", fuel_type: "briquettes", cooked_at: "2026-10-19" },
  { id: "third", title: "Pianificata", status: "planned", rating: 5, cooking_method: "direct", fuel_type: "charcoal", cooked_at: "2026-10-20" }
];
function harness({ authorized = true, respond = () => ({ data: rows, count: 600 }) } = {}) {
  const nodes = new Map(), reads = [];
  const $ = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { value: "", hidden: true, disabled: false, innerHTML: "", textContent: "" });
    return nodes.get(selector);
  };
  const client = { from(table) {
    const read = { table, filters: [], orders: [] };
    return { select(columns, options) { read.columns = columns; read.options = options; return this; }, eq(key, value) { read.filters.push([key, value]); return this; }, order(key, options) { read.orders.push([key, options]); return this; }, limit(value) { read.limit = value; return this; }, then(resolve, reject) { reads.push(read); return Promise.resolve(respond(read, reads.length)).then(resolve, reject); } };
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve("./learning.js"), "utf8"), {
    window: { cucinaHubSupabase: client, CucinaHubWeberLearning: core, CucinaHubAuthGuard: { requireAdministrator: async () => ({ authorized, user: { id: "owner" } }) } },
    document: { querySelector: $ }, Date, encodeURIComponent
  });
  return { $, reads };
}
test("Learning Weber UI: accesso negato non legge lo storico", async () => {
  const h = harness({ authorized: false }); await settle();
  assert.equal(h.reads.length, 0);
  assert.equal(h.$("#authGate").hidden, false);
  assert.equal(h.$("#weberLearningWorkspace").hidden, true);
});
test("Learning Weber UI: owner, limite e conteggio espliciti; voti e link coerenti", async () => {
  const h = harness(); await settle();
  assert.deepEqual(h.reads[0].filters, [["owner_user_id", "owner"]]);
  assert.equal(h.reads[0].table, "weber_cook_sessions");
  assert.equal(h.reads[0].limit, 500);
  assert.equal(h.reads[0].options.count, "exact");
  assert.match(h.$("#learningScope").textContent, /600 prove.*3 più recenti/);
  assert.equal(h.$("#learningRated").textContent, 1);
  assert.equal(h.$("#learningUnrated").textContent, 1);
  assert.equal(h.$("#learningAverage").textContent, "4");
  assert.match(h.$("#learningGroups").innerHTML, /Una sola valutazione/);
  assert.match(h.$("#learningGroups").innerHTML, /compare.html\?v=2&amp;a=00000000-0000-4000-8000-000000000001&amp;b=00000000-0000-4000-8000-000000000002/);
  assert.match(h.$("#learningGroups").innerHTML, /Pollo &lt;b&gt;/);
  assert.doesNotMatch(h.$("#learningGroups").innerHTML, /<script>/);
});
test("Learning Weber UI: filtri locali, nessun risultato e reset aggiornano tutti i conteggi", async () => {
  const h = harness(); await settle();
  h.$("#learningFuel").value = "charcoal"; h.$("#learningFuel").onchange();
  assert.equal(h.$("#learningCompleted").textContent, 0);
  assert.equal(h.$("#learningAverage").textContent, "—");
  assert.doesNotMatch(h.$("#learningGroups").innerHTML, /Voto più alto/);
  h.$("#learningRecipe").value = "absent"; h.$("#learningRecipe").onchange();
  assert.match(h.$("#learningSummary").textContent, /Nessuna prova corrisponde/);
  h.$("#resetLearningFilters").onclick();
  assert.equal(h.$("#learningTotal").textContent, 3);
  assert.equal(h.reads.length, 1);
});
test("Learning Weber UI: errore di aggiornamento nasconde le vecchie medie, retry recupera", async () => {
  const h = harness({ respond: (read, call) => call === 2 ? { error: new Error("offline") } : { data: rows } });
  await settle(); await h.$("#reloadLearning").onclick();
  assert.equal(h.$("#weberLearningResults").hidden, true);
  assert.match(h.$("#weberLearningStatus").textContent, /Impossibile caricare/);
  h.$("#learningFuel").onchange();
  assert.equal(h.$("#weberLearningResults").hidden, true);
  await h.$("#reloadLearning").onclick();
  assert.equal(h.$("#weberLearningResults").hidden, false);
});
test("Learning Weber UI: storico vuoto distinto da errore e risposte obsolete ignorate", async () => {
  let finish;
  const h = harness({ respond: (read, call) => call === 2 ? new Promise(resolve => { finish = resolve; }) : { data: [], count: 0 } });
  await settle();
  assert.match(h.$("#weberLearningStatus").textContent, /storico Weber è vuoto/);
  assert.equal(h.$("#learningAverage").textContent, "—");
  const pending = h.$("#reloadLearning").onclick(); await settle();
  await h.$("#reloadLearning").onclick();
  finish({ data: rows }); await pending;
  assert.equal(h.$("#learningTotal").textContent, 0);
  assert.equal(h.$("#reloadLearning").disabled, false);
});
