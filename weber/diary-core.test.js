"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./diary-core.js");

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
