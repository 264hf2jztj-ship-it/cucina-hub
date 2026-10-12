"use strict";

(function (root, factory) {
  const nutritionContract = typeof module === "object" && module.exports
    ? require("./nutrition-plan-contract.js")
    : root.CucinaHubNutritionPlanContract;
  const menuEngine = typeof module === "object" && module.exports
    ? require("./menu-plan-import-engine.js")
    : root.CucinaHubMenuPlanImportEngine;
  const api = factory(nutritionContract, menuEngine);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CucinaHubNutritionPlanImportEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (nutritionContract, menuEngine) {
  if (!nutritionContract || !menuEngine) {
    throw new Error("nutrition_plan_import_dependencies_missing");
  }

  function copyPresent(target, source, fields) {
    fields.forEach(field => {
      if (source[field] !== undefined && source[field] !== null) target[field] = source[field];
    });
    return target;
  }

  function componentItem(component, dayIndex, mealIndex, componentIndex) {
    return copyPresent({
      key: `np-d${dayIndex + 1}-m${mealIndex + 1}-c${componentIndex + 1}`,
      type: "food",
      label: component.name
    }, component, ["quantity", "unit", "note"]);
  }

  function recipeItem(meal, dayIndex, mealIndex) {
    return {
      key: `np-d${dayIndex + 1}-m${mealIndex + 1}-r`,
      type: "recipe",
      recipe_code: meal.recipe_ref.code,
      label: meal.title
    };
  }

  function toMenuPlan(packet) {
    const validation = nutritionContract.validatePacket(packet);
    if (!validation.valid) {
      const error = new Error("nutrition_plan_contract_invalid");
      error.code = "nutrition_plan_contract_invalid";
      error.issues = validation.errors;
      throw error;
    }

    const nutrition = validation.normalizedPacket;
    const menuPacket = {
      contract: menuEngine.CONTRACT,
      version: menuEngine.VERSION,
      menu: {
        external_id: nutrition.plan.external_id,
        revision: nutrition.plan.revision,
        title: nutrition.plan.title,
        period_start: nutrition.plan.week_start,
        period_end: nutrition.plan.week_end,
        source: { ...nutrition.plan.source }
      },
      days: nutrition.days.map((day, dayIndex) => ({
        date: day.date,
        meals: day.meals.map((meal, mealIndex) => {
          const items = [];
          if (meal.recipe_ref) items.push(recipeItem(meal, dayIndex, mealIndex));
          meal.components.forEach((component, componentIndex) => {
            items.push(componentItem(component, dayIndex, mealIndex, componentIndex));
          });

          return copyPresent({
            key: meal.key,
            slot: meal.slot,
            items
          }, meal, ["time", "note"]);
        })
      })),
      guardrails: {
        preview_only: true,
        automatic_save: false,
        requires_user_confirmation: true
      }
    };

    const menuValidation = menuEngine.validatePacket(menuPacket);
    if (!menuValidation.valid) {
      const error = new Error("nutrition_plan_projection_invalid");
      error.code = "nutrition_plan_projection_invalid";
      error.issues = menuValidation.errors;
      throw error;
    }
    return menuValidation.normalizedPacket;
  }

  async function prepareImport(packet) {
    const nutritionValidation = nutritionContract.validatePacket(packet);
    if (!nutritionValidation.valid) {
      const error = new Error("nutrition_plan_contract_invalid");
      error.code = "nutrition_plan_contract_invalid";
      error.issues = nutritionValidation.errors;
      throw error;
    }

    const nutritionPacket = nutritionValidation.normalizedPacket;
    const menuPacket = toMenuPlan(nutritionPacket);
    const nutritionHash = await nutritionContract.computePayloadHash(nutritionPacket);

    return {
      nutrition_packet: nutritionPacket,
      nutrition_canonical_payload: nutritionContract.canonicalStringify(nutritionPacket),
      nutrition_payload_hash: nutritionHash,
      menu_packet: menuPacket
    };
  }

  return Object.freeze({ prepareImport, toMenuPlan });
});
