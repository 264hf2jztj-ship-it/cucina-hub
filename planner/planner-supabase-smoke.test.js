"use strict";

const assert = require("node:assert/strict");
const core = require("./planner-core.js");
const menuPlanEngine = require("./menu-plan-import-engine.js");

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }
}

class FakeElement {
  constructor({ hidden = false, value = "" } = {}) {
    this.hidden = hidden;
    this.value = value;
    this.textContent = "";
    this.className = "";
    this.disabled = false;
    this.listeners = {};
    this.classList = new FakeClassList();
    this._innerHTML = "";
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
  }

  get innerHTML() {
    return this._innerHTML;
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  querySelectorAll() {
    return [];
  }

  setAttribute() {}

  reset() {}

  focus() {}

  scrollIntoView() {}
}

const selectors = [
  "#pageStatus",
  "#authGate",
  "#errorPanel",
  "#errorMessage",
  "#retryLoad",
  "#plannerWorkspace",
  "#weekMealCount",
  "#weekRange",
  "#weekEmptySummary",
  "#weekGrid",
  "#previousWeek",
  "#currentWeek",
  "#nextWeek",
  "#menuPlanInput",
  "#menuPlanFile",
  "#menuPlanFileStatus",
  "#analyzeMenuPlan",
  "#clearMenuPlan",
  "#menuPlanResult",
  "#plannerEditor",
  "#mealForm",
  "#formTitle",
  "#mealId",
  "#plannedDate",
  "#mealSlot",
  "#plannedTime",
  "#servings",
  "#recipeId",
  "#recipeHelp",
  "#mealNote",
  "#saveMeal",
  "#cancelEdit",
  "#mealCount",
  "#mealList"
];

const elements = new Map(selectors.map(selector => [selector, new FakeElement()]));
elements.get("#authGate").hidden = true;
elements.get("#errorPanel").hidden = true;
elements.get("#plannerWorkspace").hidden = true;
elements.get("#cancelEdit").hidden = true;

const database = {
  recipes: [
    { id: "recipe-1", owner_user_id: "user-1", code: "RC-1", title: "Pollo al forno" },
    { id: "recipe-dup-1", owner_user_id: "user-1", code: "DUP-1", title: "Duplicata uno" },
    { id: "recipe-dup-2", owner_user_id: "user-1", code: "dup-1", title: "Duplicata due" }
  ],
  planner_menu_packages: [],
  planned_meal_items: [],
  planned_meals: [
    {
      id: "meal-1",
      owner_user_id: "user-1",
      recipe_id: "recipe-1",
      planned_date: core.localDateValue(),
      meal_slot: "dinner",
      planned_time: "20:00:00",
      servings: 3,
      note: "Preparare le patate",
      created_at: "2026-08-11T18:00:00Z"
    }
  ]
};

let plannedMealsError = null;
let plannerMenuPackagesError = null;
let plannedMealItemsError = null;

function queryFor(table) {
  const query = {
    select() { return query; },
    eq() { return query; },
    in() { return query; },
    gte() { return query; },
    lte() { return query; },
    order() { return query; },
    then(resolve, reject) {
      return Promise.resolve({
        data: database[table] ?? [],
        error: table === "planned_meals"
          ? plannedMealsError
          : table === "planner_menu_packages"
            ? plannerMenuPackagesError
            : table === "planned_meal_items"
              ? plannedMealItemsError
              : null
      }).then(resolve, reject);
    }
  };
  return query;
}

global.document = {
  querySelector(selector) {
    return elements.get(selector) ?? null;
  }
};

global.window = {
  CucinaHubPlannerCore: core,
  CucinaHubMenuPlanImportEngine: menuPlanEngine,
  cucinaHubSupabase: {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "user-1" } } },
        error: null
      })
    },
    from: queryFor
  },
  confirm: () => true,
  setTimeout,
  clearTimeout
};

(async () => {
  require("./planner.js");
  const settle = async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
  };
  await settle();

  assert.equal(elements.get("#authGate").hidden, true);
  assert.equal(elements.get("#errorPanel").hidden, true);
  assert.equal(elements.get("#plannerWorkspace").hidden, false);
  assert.equal(elements.get("#mealCount").textContent, "1");
  assert.equal(elements.get("#weekMealCount").textContent, "1");
  assert.equal(elements.get("#weekEmptySummary").hidden, true);
  assert.ok(elements.get("#weekRange").textContent.length > 0);
  assert.match(elements.get("#recipeId").innerHTML, /Pollo al forno/);
  assert.match(elements.get("#mealList").innerHTML, /Pollo al forno/);
  assert.match(elements.get("#weekGrid").innerHTML, /Pollo al forno/);
  assert.equal((elements.get("#weekGrid").innerHTML.match(/<article class="week-day/g) ?? []).length, 7);
  assert.match(elements.get("#mealList").innerHTML, /20:00/);
  assert.match(elements.get("#mealList").innerHTML, /3 porzioni/);
  assert.match(elements.get("#pageStatus").className, /ok/);

  const smokePacket = {
    contract: "cucina-hub.menu-plan",
    version: 1,
    menu: {
      external_id: "smoke-menu",
      revision: 1,
      period_start: core.localDateValue(),
      period_end: core.localDateValue(),
      source: { type: "manual", label: "Smoke test" }
    },
    days: [{
      date: core.localDateValue(),
      meals: [{
        key: "smoke-breakfast",
        slot: "breakfast",
        items: [{ key: "recipe", type: "recipe", recipe_code: "RC-1" }]
      }]
    }],
    guardrails: { preview_only: true, automatic_save: false, requires_user_confirmation: true }
  };
  elements.get("#menuPlanInput").value = JSON.stringify(smokePacket);
  elements.get("#analyzeMenuPlan").listeners.click();
  await settle();
  assert.match(elements.get("#menuPlanResult").innerHTML, /Analisi tecnica completata/);
  assert.match(elements.get("#menuPlanResult").innerHTML, /RISOLTA/);
  assert.match(elements.get("#menuPlanResult").innerHTML, /NUOVO PACCHETTO/);
  assert.match(elements.get("#menuPlanResult").innerHTML, /SHA-256 del payload normalizzato/);
  assert.match(elements.get("#menuPlanResult").innerHTML, /Nessun conflitto rilevato/);
  assert.doesNotMatch(elements.get("#menuPlanResult").innerHTML, /ingredienti|procedimento/i);

  const manualConflictPacket = structuredClone(smokePacket);
  manualConflictPacket.menu.external_id = "manual-conflict-menu";
  manualConflictPacket.days[0].meals[0].key = "smoke-dinner";
  manualConflictPacket.days[0].meals[0].slot = "dinner";
  elements.get("#menuPlanInput").value = JSON.stringify(manualConflictPacket);
  elements.get("#analyzeMenuPlan").listeners.click();
  await settle();
  assert.match(elements.get("#menuPlanResult").innerHTML, /Conflitti da risolvere/);
  assert.match(elements.get("#menuPlanResult").innerHTML, /PASTO MANUALE/);
  assert.match(elements.get("#menuPlanResult").innerHTML, /existing_manual_meal/);
  assert.match(elements.get("#pageStatus").className, /warning/);

  const normalizedSmokePacket = menuPlanEngine.validatePacket(smokePacket).normalizedPacket;
  const smokeHash = await menuPlanEngine.computePayloadHash(normalizedSmokePacket);
  database.planner_menu_packages.push({
    id: "package-1",
    owner_user_id: "user-1",
    source_type: "manual",
    source_external_id: "smoke-menu",
    source_revision: 1,
    payload_hash: smokeHash,
    import_status: "confirmed"
  });
  elements.get("#menuPlanInput").value = JSON.stringify(smokePacket);
  elements.get("#analyzeMenuPlan").listeners.click();
  await settle();
  assert.match(elements.get("#menuPlanResult").innerHTML, /RETRY BLOCCATO/);
  assert.match(elements.get("#pageStatus").className, /warning/);

  const conflictingPacket = structuredClone(smokePacket);
  conflictingPacket.days[0].meals[0].time = "08:00";
  elements.get("#menuPlanInput").value = JSON.stringify(conflictingPacket);
  elements.get("#analyzeMenuPlan").listeners.click();
  await settle();
  assert.match(elements.get("#menuPlanResult").innerHTML, /CONFLITTO HASH/);
  assert.match(elements.get("#pageStatus").className, /error/);

  plannerMenuPackagesError = { message: "Tabella simulata non disponibile", code: "TEST" };
  const unavailablePacket = structuredClone(smokePacket);
  unavailablePacket.menu.external_id = "unavailable-menu";
  elements.get("#menuPlanInput").value = JSON.stringify(unavailablePacket);
  elements.get("#analyzeMenuPlan").listeners.click();
  await settle();
  assert.match(elements.get("#menuPlanResult").innerHTML, /CONTROLLO NON DISPONIBILE/);
  assert.match(elements.get("#menuPlanResult").innerHTML, /041_planner_menu_packages\.sql/);
  plannerMenuPackagesError = null;

  plannedMealItemsError = { message: "Elementi simulati non disponibili", code: "TEST" };
  const conflictUnavailablePacket = structuredClone(smokePacket);
  conflictUnavailablePacket.menu.external_id = "conflict-unavailable-menu";
  elements.get("#menuPlanInput").value = JSON.stringify(conflictUnavailablePacket);
  elements.get("#analyzeMenuPlan").listeners.click();
  await settle();
  assert.match(elements.get("#menuPlanResult").innerHTML, /Analisi conflitti non disponibile/);
  assert.match(elements.get("#pageStatus").className, /error/);
  plannedMealItemsError = null;

  const revisionPacket = structuredClone(smokePacket);
  revisionPacket.menu.external_id = "protected-menu";
  revisionPacket.menu.revision = 2;
  revisionPacket.days[0].meals[0].key = "protected-breakfast";
  const previousRevisionPacket = structuredClone(revisionPacket);
  previousRevisionPacket.menu.revision = 1;
  database.planner_menu_packages.push({
    id: "protected-package",
    owner_user_id: "user-1",
    title: "Menu protetto",
    period_start: core.localDateValue(),
    period_end: core.localDateValue(),
    source_type: "manual",
    source_external_id: "protected-menu",
    source_revision: 1,
    payload_hash: await menuPlanEngine.computePayloadHash(previousRevisionPacket),
    import_status: "confirmed"
  });
  database.planned_meals.push({
    id: "protected-meal",
    owner_user_id: "user-1",
    recipe_id: "recipe-1",
    menu_package_id: "protected-package",
    source_meal_key: "protected-breakfast",
    planned_date: core.localDateValue(),
    meal_slot: "breakfast",
    planned_time: "07:00:00",
    is_user_modified: true
  });
  database.planned_meal_items.push({
    id: "protected-item",
    owner_user_id: "user-1",
    planned_meal_id: "protected-meal",
    source_item_key: "recipe",
    item_type: "recipe",
    recipe_code: "RC-1",
    label: "Pollo al forno",
    is_user_modified: true
  });
  elements.get("#menuPlanInput").value = JSON.stringify(revisionPacket);
  elements.get("#analyzeMenuPlan").listeners.click();
  await settle();
  assert.match(elements.get("#menuPlanResult").innerHTML, /MENU SOVRAPPOSTO/);
  assert.match(elements.get("#menuPlanResult").innerHTML, /PASTO MODIFICATO/);
  assert.match(elements.get("#menuPlanResult").innerHTML, /ELEMENTO MODIFICATO/);
  assert.match(elements.get("#menuPlanResult").innerHTML, /user_modified_imported_item/);

  const missingPacket = structuredClone(smokePacket);
  missingPacket.days[0].meals[0].items[0].recipe_code = "RC-999";
  elements.get("#menuPlanInput").value = JSON.stringify(missingPacket);
  elements.get("#analyzeMenuPlan").listeners.click();
  await settle();
  assert.match(elements.get("#menuPlanResult").innerHTML, /missing_library_reference/);
  assert.match(elements.get("#pageStatus").className, /error/);

  missingPacket.days[0].meals[0].items[0].recipe_code = "DUP-1";
  elements.get("#menuPlanInput").value = JSON.stringify(missingPacket);
  elements.get("#analyzeMenuPlan").listeners.click();
  await settle();
  assert.match(elements.get("#menuPlanResult").innerHTML, /ambiguous_library_reference/);
  assert.match(elements.get("#menuPlanResult").innerHTML, /Duplicata uno/);
  assert.match(elements.get("#menuPlanResult").innerHTML, /Duplicata due/);

  const initialRange = elements.get("#weekRange").textContent;
  elements.get("#nextWeek").listeners.click();
  await settle();
  assert.notEqual(elements.get("#weekRange").textContent, initialRange);
  assert.equal(elements.get("#weekMealCount").textContent, "0");
  assert.equal(elements.get("#weekEmptySummary").hidden, false);

  elements.get("#currentWeek").listeners.click();
  await settle();
  assert.equal(elements.get("#weekRange").textContent, initialRange);
  assert.equal(elements.get("#weekMealCount").textContent, "2");

  plannedMealsError = { message: "Connessione simulata non disponibile", code: "TEST" };
  elements.get("#previousWeek").listeners.click();
  await settle();
  assert.equal(elements.get("#weekRange").textContent, initialRange);
  assert.match(elements.get("#pageStatus").className, /error/);
  plannedMealsError = null;

  elements.get("#weekGrid").listeners.click({
    target: {
      closest: () => ({ dataset: { action: "add", date: core.localDateValue() } })
    }
  });
  assert.equal(elements.get("#plannedDate").value, core.localDateValue());
  assert.match(elements.get("#formTitle").textContent, /Pianifica per/i);

  elements.get("#weekGrid").listeners.click({
    target: {
      closest: () => ({ dataset: { action: "edit", mealId: "meal-1" } })
    }
  });
  assert.equal(elements.get("#mealId").value, "meal-1");
  assert.equal(elements.get("#formTitle").textContent, "Modifica il pasto");

  console.log("Planner Supabase UI: smoke test simulato superato.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
