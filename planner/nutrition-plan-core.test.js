"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const core = require("./nutrition-plan-core.js");
const fixture = JSON.parse(fs.readFileSync("planner/test-fixtures/nutrition-plan-v1-valid.json", "utf8"));
const packages = [{ id: "p1", import_status: "confirmed", period_start: "2026-10-12", period_end: "2026-10-18", source_external_id: fixture.plan.external_id, source_revision: 1 }];
const rows = [{ planner_menu_package_id: "p1", source_payload: fixture }];
test("Oggi segue Roma anche a mezzanotte e al cambio di ora", () => {
  assert.equal(core.today(new Date("2026-10-12T22:30:00Z")), "2026-10-13");
  assert.equal(core.today(new Date("2026-10-25T23:30:00Z")), "2026-10-26");
  assert.equal(core.monday("2026-10-18"), "2026-10-12");
  assert.equal(core.monday("2026-10-19"), "2026-10-19");
  assert.equal(core.realDate("2026-02-30"), false);
  assert.equal(core.addDays("2026-12-28", 7), "2027-01-04");
});
test("solo un piano valido e attivo della settimana può essere mostrato", () => {
  assert.equal(core.selectPlan(packages, rows, "2026-10-12").status, "ready");
  assert.equal(core.selectPlan(packages, rows, "2026-10-19").status, "empty");
  assert.equal(core.selectPlan([{ ...packages[0], import_status: "superseded" }], rows, "2026-10-12").status, "empty");
  assert.equal(core.selectPlan([...packages, { ...packages[0], id: "p2" }], [...rows, { ...rows[0], planner_menu_package_id: "p2" }], "2026-10-12").status, "ambiguous");
  const invalid = structuredClone(rows);
  invalid[0].source_payload.days.pop();
  assert.equal(core.selectPlan(packages, invalid, "2026-10-12").status, "invalid");
  assert.equal(core.selectPlan([{ ...packages[0], source_revision: 2 }], rows, "2026-10-12").status, "invalid");
});
test("ricette esistenti, mancanti e ambigue e quantità leggibili", () => {
  const ref = { code: "ABC" };
  assert.equal(core.recipeHref(ref, [{ code: "abc", id: "id with space" }]), "../index.html?view=recipes&recipe=id%20with%20space");
  assert.equal(core.recipeHref(ref, []), null);
  assert.equal(core.recipeHref(ref, [{ code: "ABC", id: "1" }, { code: "abc", id: "2" }]), null);
  assert.equal(core.quantity({ quantity: 2, unit: "piece" }), "2 pz");
  assert.equal(core.quantity({ name: "Pane" }), "");
});
