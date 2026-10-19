"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./learning-core.js");
const trial = (id, changes = {}) => ({ id, title: id, status: "completed", recipe_id: "r1", recipe: { code: "R1", title: "Pollo" }, cooking_method: "indirect", fuel_type: "briquettes", cooked_at: "2026-10-19T10:00:00Z", ...changes });

test("Learning Weber: media solo da voti validi di prove concluse, vuoti distinti da zero", () => {
  const rows = [trial("a", { rating: 4 }), trial("b", { rating: "2" }), ...[null, undefined, "", " ", 0, 6, 1.5, false, "abc"].map((rating, i) => trial(`x${i}`, { rating })), trial("active", { status: "active", rating: 5 }), trial("planned", { status: "planned", rating: 5 }), trial("cancelled", { status: "cancelled", rating: 5 })];
  const m = core.analyze(rows);
  assert.equal(m.rated, 2);
  assert.equal(m.average, 3);
  assert.equal(m.completed, 11);
  assert.equal(m.other, 3);
  assert.equal(m.gaps.find(gap => gap.key === "rating").count, 9);
  assert.equal(core.analyze([]).average, null);
  assert.equal(core.analyze([trial("no-rating")]).groups[0].highest, null);
});
test("Learning Weber: raggruppa per ID ricetta, metodo e combustibile senza mescolare ricette omonime", () => {
  const m = core.analyze([trial("a", { rating: 4 }), trial("b", { rating: 2 }), trial("c", { recipe_id: "r2", rating: 5 }), trial("d", { cooking_method: "direct", rating: 1 }), trial("e", { fuel_type: "charcoal", rating: 3 })]);
  assert.equal(m.groups.length, 4);
  const g = m.groups.find(group => group.sessions.length === 2);
  assert.equal(g.rated, 2);
  assert.equal(g.average, 3);
  assert.equal(g.highest, 4);
  assert.equal(g.best[0].id, "a");
  assert.equal(g.method, "Indiretta");
});
test("Learning Weber: ricette non collegate restano prove separate e non propongono confronti", () => {
  const m = core.analyze([trial("a", { recipe_id: null, recipe: null, rating: 1 }), trial("b", { recipe_id: null, recipe: null, rating: 5 })]);
  assert.equal(m.groups.length, 2);
  assert.ok(m.groups.every(group => group.pair === null));
  assert.equal(core.analyze([trial("a", { cooking_method: null }), trial("b", { cooking_method: null })]).groups[0].pair, null);
});
test("Learning Weber: filtri combinati e filtro senza ricetta hanno denominatori corretti", () => {
  const rows = [trial("a", { rating: 4 }), trial("b", { fuel_type: "charcoal", rating: 2 }), trial("c", { recipe_id: null, recipe: null })];
  const m = core.analyze(rows, { recipe: "r1", method: "indirect", fuel: "briquettes" });
  assert.equal(m.total, 1); assert.equal(m.average, 4);
  assert.equal(core.analyze(rows, { recipe: core.NONE }).total, 1);
  assert.equal(core.analyze(rows, { method: "snake" }).completed, 0);
});
test("Learning Weber: parità esplicite e coppia delle due prove concluse più recenti, input immutato", () => {
  const rows = [trial("old", { rating: 5, cooked_at: "2026-10-01" }), trial("latest", { rating: 5, cooked_at: "2026-10-19" }), trial("middle", { rating: 3, cooked_at: "2026-10-18" }), trial("active", { rating: 5, status: "active", cooked_at: "2026-10-20" })];
  const before = JSON.stringify(rows);
  const g = core.analyze(rows).groups[0];
  assert.equal(g.best.length, 2); assert.equal(g.best[0].id, "latest");
  assert.deepEqual(g.pair, ["latest", "middle"]);
  assert.equal(JSON.stringify(rows), before);
});
test("Learning Weber: completezza su sole prove concluse e setup conserva prese a zero", () => {
  const complete = trial("a", { rating: 3, target_grate_temp_c: 160, peak_grate_temp_c: 180, duration_minutes: 90, result_notes: "Buono" });
  const m = core.analyze([complete, trial("planned", { status: "planned" })]);
  assert.ok(m.gaps.every(gap => gap.count === 0));
  assert.equal(m.incomplete.length, 0);
  assert.match(core.setupLabel({ vent_bottom_percent: 0, vent_top_percent: null }), /inferiore: 0 %; superiore: non registrata/);
  assert.match(core.recipeLabel({ recipe_id: "r1" }), /dettagli non disponibili/);
});
