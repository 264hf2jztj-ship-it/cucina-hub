"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./diary-core.js");

test("i preset contengono solo setup e non ereditano risultati o identità della prova", () => {
  const session = { id: "session-1", title: "Indiretta", cooking_method: "indirect", fuel_type: "briquettes", fuel_amount: 50, fuel_unit: "pieces", vent_bottom_percent: 0, rating: 5, recipe_id: "r1", result_notes: "Buono", food_core_temp_c: 75, cooked_at: "2026-10-01" };
  const now = new Date("2026-10-18T10:00:00Z");
  const preset = core.configurationPayload(session, "owner-1", now);
  assert.equal(preset.vent_bottom_percent, 0);
  assert.equal(preset.owner_user_id, "owner-1");
  for (const field of ["id", "recipe_id", "rating", "result_notes", "food_core_temp_c", "cooked_at", "duration_minutes", "peak_grate_temp_c"]) assert.equal(field in preset, false);
  const copy = core.setupValues(preset);
  preset.fuel_amount = 20;
  assert.equal(copy.fuel_amount, 50, "il setup copiato è indipendente dal preset");
  assert.equal(session.fuel_amount, 50, "la prova sorgente non cambia");
});

test("i preset accettano valori opzionali vuoti e rifiutano valori non validi", () => {
  const setup = { title: "Diretta", cooking_method: "direct", fuel_type: "charcoal" };
  assert.equal(core.configurationPayload(setup, "owner").fuel_amount, null);
  for (const invalid of [{ fuel_amount: 0, fuel_unit: "kg" }, { vent_bottom_percent: 101 }, { target_grate_temp_c: 80.5 }, { fuel_amount: "abc", fuel_unit: "kg" }, { fuel_amount: 1, fuel_unit: "litri" }]) {
    assert.throws(() => core.configurationPayload({ ...setup, ...invalid }, "owner"));
  }
});

const base = {
  title: "Pollo indiretto",
  cooked_at: "2026-09-21T12:30",
  status: "completed",
  cooking_method: "indirect",
  fuel_type: "briquettes",
  fuel_amount: "50",
  fuel_unit: "pieces",
  vent_bottom_percent: "50",
  vent_top_percent: "100",
  rating: "4"
};

test("valida campi obbligatori, coppia combustibile e prese d'aria", () => {
  assert.deepEqual(core.validate(base), []);
  assert.match(core.validate({})[0], /titolo/i);
  assert.match(core.validate({ ...base, fuel_unit: "" }).join(" "), /insieme/i);
  assert.match(core.validate({ ...base, vent_top_percent: 110 }).join(" "), /0 e 100/i);
  assert.match(core.validate({ ...base, target_grate_temp_c: 500 }).join(" "), /40 e 450/i);
  assert.match(core.validate({ ...base, duration_minutes: 0 }).join(" "), /maggiore di zero/i);
});

test("costruisce un payload tipizzato e owner-scoped", () => {
  const now = new Date("2026-09-21T10:00:00Z");
  const value = core.payload({ ...base, recipe_id: "recipe-1", target_grate_temp_c: "180" }, "user-1", now);
  assert.equal(value.owner_user_id, "user-1");
  assert.equal(value.fuel_amount, 50);
  assert.equal(value.target_grate_temp_c, 180);
  assert.equal(value.updated_at, now.toISOString());
});

test("filtra e riepiloga le sessioni", () => {
  const rows = [
    { ...base, title: "Pollo", status: "completed", rating: 4, recipe_title: "Pollo intero" },
    { ...base, title: "Verdure", status: "planned", rating: null }
  ];
  assert.equal(core.filter(rows, { status: "completed" }).length, 1);
  assert.equal(core.filter(rows, { query: "intero" }).length, 1);
  assert.deepEqual(core.summary(rows), { total: 2, planned: 1, active: 0, completed: 1, averageRating: "4.0" });
});
