"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./compare-core.js");
const row = (key, a, b) => core.rows(a, b).find(row => row.key === key);

test("confronto: null, vuoti e valori non numerici non diventano zero", () => {
  for (const value of [null, undefined, "", " ", "abc", NaN, Infinity, false]) {
    const r = row("rating", { rating: value }, { rating: 4 });
    assert.equal(r.a, "Non registrato");
    assert.equal(r.delta, "Dati mancanti");
  }
  assert.equal(row("vent_top_percent", { vent_top_percent: 0 }, { vent_top_percent: 25 }).delta, "+25 punti percentuali");
});
test("confronto: normalizza i numeri e calcola B meno A senza giudizi", () => {
  const equal = row("target_grate_temp_c", { target_grate_temp_c: "180.00" }, { target_grate_temp_c: 180 });
  assert.equal(equal.different, false);
  assert.equal(equal.delta, "0 °C");
  assert.equal(row("duration_minutes", { duration_minutes: 60 }, { duration_minutes: 45 }).delta, "-15 min");
  assert.equal(row("rating", { rating: 3 }, { rating: 4 }).delta, "+1 punti");
  assert.equal(row("food_core_temp_c", { food_core_temp_c: "72.1" }, { food_core_temp_c: 72.2 }).delta, "+0,1 °C");
});
test("confronto: quantità combustibile solo con stessa unità e tipo", () => {
  const a = { fuel_amount: 1, fuel_unit: "kg", fuel_type: "charcoal" };
  assert.equal(row("fuel_amount", a, { ...a, fuel_amount: 2 }).delta, "+1 kg");
  for (const b of [{ ...a, fuel_unit: "g" }, { ...a, fuel_type: "briquettes" }, { ...a, fuel_unit: null }, { ...a, fuel_type: null }]) {
    const r = row("fuel_amount", a, b);
    assert.match(r.delta, /Non confrontabile/);
    assert.equal(r.different, true);
  }
  assert.equal(row("fuel_amount", a, { ...a, fuel_amount: null }).delta, "Dati mancanti");
});
test("confronto: etichette italiane, note e ricette non inventano dati", () => {
  assert.equal(row("cooking_method", { cooking_method: "snake" }, { cooking_method: "indirect" }).a, "Snake");
  assert.equal(row("result_notes", { result_notes: " " }, { result_notes: "Succoso" }).a, "Non registrato");
  assert.equal(row("recipe_id", { recipe_id: "r", recipe: { code: "R1", title: "Pollo" } }, {}).a, "R1 · Pollo");
  assert.match(row("recipe_id", { recipe_id: "r" }, {}).a, /dettagli non disponibili/);
});
test("confronto: avvisa di prove incomplete e ricette diverse o mancanti", () => {
  assert.equal(core.warnings({ status: "completed", recipe_id: "r" }, { status: "completed", recipe_id: "r" }).length, 1);
  assert.match(core.warnings({}, {}).join(" "), /non è conclusa/);
  assert.match(core.warnings({}, {}).join(" "), /non collegata/);
  assert.match(core.warnings({ recipe_id: "a" }, { recipe_id: "b" }).join(" "), /ricette collegate sono diverse/);
  assert.match(core.warnings({}, {})[0], /non dimostra cause/);
});
