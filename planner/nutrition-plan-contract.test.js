"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const contract = require("./nutrition-plan-contract.js");

const fixturePath = path.join(__dirname, "test-fixtures/nutrition-plan-v1-valid.json");
const validPacket = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

(async () => {
  const validation = contract.validatePacket(validPacket);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors, null, 2));
  assert.deepEqual(validation.summary, {
    days: 7,
    workouts: 5,
    meals: 11,
    recipe_references: 1,
    components: 26,
    alternatives: 1,
    shopping_items: 18
  });
  assert.ok(contract.MEAL_SLOTS.includes("pre_workout"));
  assert.ok(contract.MEAL_SLOTS.includes("post_workout"));

  const normalizedUnits = structuredClone(validPacket);
  normalizedUnits.days[0].meals[0].components[0].unit = " G ";
  assert.equal(contract.validatePacket(normalizedUnits).normalizedPacket.days[0].meals[0].components[0].unit, "g");
  assert.equal(validPacket.days[0].meals[0].components[0].unit, "g", "La validazione non deve mutare l'input.");

  const unsafeIdentity = structuredClone(validPacket);
  unsafeIdentity.owner_user_id = "forbidden";
  unsafeIdentity.plan.extra = true;
  const unsafeCodes = contract.validatePacket(unsafeIdentity).errors.map(error => error.code);
  assert.ok(unsafeCodes.includes("owner_user_id_forbidden"));
  assert.ok(unsafeCodes.includes("unexpected_field"));

  const malformedCollections = structuredClone(validPacket);
  malformedCollections.days = {};
  malformedCollections.shopping_list.categories = {};
  assert.doesNotThrow(() => contract.validatePacket(malformedCollections));
  assert.ok(contract.validatePacket(malformedCollections).errors.some(error => error.code === "invalid_days"));
  assert.ok(contract.validatePacket(malformedCollections).errors.some(error => error.code === "invalid_shopping_categories"));

  const invalidWeek = structuredClone(validPacket);
  invalidWeek.plan.week_start = "2026-10-13";
  invalidWeek.plan.week_end = "2026-10-20";
  invalidWeek.days.pop();
  const invalidWeekCodes = contract.validatePacket(invalidWeek).errors.map(error => error.code);
  assert.ok(invalidWeekCodes.includes("week_start_not_monday"));
  assert.ok(invalidWeekCodes.includes("invalid_week_range"));
  assert.ok(invalidWeekCodes.includes("invalid_day_count"));
  assert.ok(invalidWeekCodes.includes("missing_week_day"));

  const duplicateDay = structuredClone(validPacket);
  duplicateDay.days[6].date = duplicateDay.days[5].date;
  const duplicateDayCodes = contract.validatePacket(duplicateDay).errors.map(error => error.code);
  assert.ok(duplicateDayCodes.includes("duplicate_day_date"));
  assert.ok(duplicateDayCodes.includes("missing_week_day"));

  const invalidMetrics = structuredClone(validPacket);
  invalidMetrics.check_in.weight_kg = 0;
  invalidMetrics.check_in.waist_cm = 500;
  invalidMetrics.check_in.body_fat_percent = 90;
  invalidMetrics.goal.protein_target_g = { min: 140, max: 120 };
  const metricCodes = contract.validatePacket(invalidMetrics).errors.map(error => error.code);
  assert.equal(metricCodes.filter(code => code === "number_out_of_range").length, 3);
  assert.ok(metricCodes.includes("invalid_protein_range"));

  const restWithTraining = structuredClone(validPacket);
  restWithTraining.days[2].training = { name: "Allenamento inatteso" };
  assert.ok(contract.validatePacket(restWithTraining).errors.some(error => error.code === "rest_day_has_training"));

  const trainingMissing = structuredClone(validPacket);
  trainingMissing.days[0].training = null;
  assert.ok(contract.validatePacket(trainingMissing).errors.some(error => error.code === "missing_training"));

  const mealWithoutContent = structuredClone(validPacket);
  mealWithoutContent.days[0].meals[0].components = [];
  assert.ok(contract.validatePacket(mealWithoutContent).errors.some(error => error.code === "empty_meal"));

  const recipeOnlyMeal = structuredClone(validPacket);
  recipeOnlyMeal.days[0].meals[0].components = [];
  recipeOnlyMeal.days[0].meals[0].recipe_ref = { code: "BREAKFAST-001" };
  assert.equal(contract.validatePacket(recipeOnlyMeal).valid, true);

  const duplicateMeal = structuredClone(validPacket);
  duplicateMeal.days[1].meals[0].key = duplicateMeal.days[0].meals[0].key;
  assert.ok(contract.validatePacket(duplicateMeal).errors.some(error => error.code === "duplicate_meal_key"));

  const invalidPublication = structuredClone(validPacket);
  invalidPublication.publication = {
    mode: "always",
    on_conflict: "overwrite",
    preserve_current_on_error: false
  };
  assert.deepEqual(
    contract.validatePacket(invalidPublication).errors.map(error => error.code),
    ["invalid_publication_mode", "invalid_conflict_policy", "invalid_error_policy"]
  );

  const duplicateShopping = structuredClone(validPacket);
  duplicateShopping.shopping_list.categories[1].items.push({ name: "Salmone", quantity: 100, unit: "g" });
  const duplicateShoppingResult = contract.validatePacket(duplicateShopping);
  assert.equal(duplicateShoppingResult.valid, true);
  assert.ok(duplicateShoppingResult.warnings.some(warning => warning.code === "duplicate_shopping_item"));

  const reordered = {
    publication: structuredClone(validPacket.publication),
    shopping_list: structuredClone(validPacket.shopping_list),
    days: structuredClone(validPacket.days),
    goal: structuredClone(validPacket.goal),
    check_in: structuredClone(validPacket.check_in),
    plan: structuredClone(validPacket.plan),
    version: validPacket.version,
    contract: validPacket.contract
  };
  const canonicalHash = await contract.computePayloadHash(validPacket);
  assert.match(canonicalHash, /^[0-9a-f]{64}$/);
  assert.equal(await contract.computePayloadHash(reordered), canonicalHash);

  const equivalentUnits = structuredClone(validPacket);
  equivalentUnits.days[0].meals[0].components[0].unit = " G ";
  assert.equal(await contract.computePayloadHash(equivalentUnits), canonicalHash);

  const changed = structuredClone(validPacket);
  changed.check_in.weight_kg = 63.1;
  assert.notEqual(await contract.computePayloadHash(changed), canonicalHash);

  console.log("nutrition-plan-contract.test.js: OK");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
