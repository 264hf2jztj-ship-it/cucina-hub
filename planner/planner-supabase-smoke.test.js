"use strict";

const assert = require("node:assert/strict");
const core = require("./planner-core.js");

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
    { id: "recipe-1", owner_user_id: "user-1", code: "RC-1", title: "Pollo al forno" }
  ],
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

function queryFor(table) {
  const query = {
    select() { return query; },
    eq() { return query; },
    gte() { return query; },
    lte() { return query; },
    order() { return query; },
    then(resolve, reject) {
      return Promise.resolve({
        data: database[table] ?? [],
        error: table === "planned_meals" ? plannedMealsError : null
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

  const initialRange = elements.get("#weekRange").textContent;
  elements.get("#nextWeek").listeners.click();
  await settle();
  assert.notEqual(elements.get("#weekRange").textContent, initialRange);
  assert.equal(elements.get("#weekMealCount").textContent, "0");
  assert.equal(elements.get("#weekEmptySummary").hidden, false);

  elements.get("#currentWeek").listeners.click();
  await settle();
  assert.equal(elements.get("#weekRange").textContent, initialRange);
  assert.equal(elements.get("#weekMealCount").textContent, "1");

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
