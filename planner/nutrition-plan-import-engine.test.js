"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const menuEngine = require("./menu-plan-import-engine.js");
const importEngine = require("./nutrition-plan-import-engine.js");

(async () => {
  const fixture = JSON.parse(fs.readFileSync(
    path.join(__dirname, "test-fixtures/nutrition-plan-v1-valid.json"),
    "utf8"
  ));

  const mapped = importEngine.toMenuPlan(fixture);
  assert.equal(mapped.contract, "cucina-hub.menu-plan");
  assert.equal(mapped.menu.external_id, fixture.plan.external_id);
  assert.equal(mapped.menu.period_start, fixture.plan.week_start);
  assert.equal(mapped.menu.period_end, fixture.plan.week_end);
  assert.equal(mapped.days.length, 7);
  assert.equal(mapped.days.flatMap(day => day.meals).length, 11);
  assert.equal(mapped.days.flatMap(day => day.meals).flatMap(meal => meal.items).length, 27);
  assert.equal(menuEngine.validatePacket(mapped).valid, true);

  const preWorkout = mapped.days[0].meals.find(meal => meal.slot === "pre_workout");
  assert.ok(preWorkout);
  assert.equal(preWorkout.time, "16:30");
  assert.deepEqual(preWorkout.items.map(item => item.key), ["np-d1-m3-c1", "np-d1-m3-c2"]);

  const recipeMeal = mapped.days[0].meals.find(meal => meal.key === "2026-10-12-lunch");
  assert.deepEqual(recipeMeal.items, [{
    key: "np-d1-m2-r",
    type: "recipe",
    recipe_code: "COUS-SALMONE-001",
    label: "Cous cous con salmone, avocado e barbabietola"
  }]);
  assert.equal(Object.hasOwn(recipeMeal, "alternatives"), false);
  assert.ok(recipeMeal.items.every(item => item.key.length < 40));

  const prepared = await importEngine.prepareImport(fixture);
  assert.deepEqual(prepared.menu_packet, mapped);
  assert.equal(JSON.parse(prepared.nutrition_canonical_payload).contract, "cucina-hub.nutrition-plan");
  assert.match(prepared.nutrition_payload_hash, /^[0-9a-f]{64}$/);

  const repeated = await importEngine.prepareImport(structuredClone(fixture));
  assert.equal(repeated.nutrition_payload_hash, prepared.nutrition_payload_hash);
  assert.equal(repeated.nutrition_canonical_payload, prepared.nutrition_canonical_payload);

  const changedGoal = structuredClone(fixture);
  changedGoal.goal.summary = "Obiettivo nutrizionale aggiornato senza modificare i pasti.";
  const changedPrepared = await importEngine.prepareImport(changedGoal);
  assert.notEqual(changedPrepared.nutrition_payload_hash, prepared.nutrition_payload_hash);
  assert.deepEqual(changedPrepared.menu_packet, prepared.menu_packet);

  const invalid = structuredClone(fixture);
  invalid.days[0].meals[0].components = [];
  assert.throws(
    () => importEngine.toMenuPlan(invalid),
    error => error.code === "nutrition_plan_contract_invalid"
      && error.issues.some(issue => issue.code === "empty_meal")
  );

  console.log("Nutrition plan import engine: 24 controlli superati.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
