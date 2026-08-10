"use strict";

const assert = require("node:assert/strict");
const engine = require("./global-search-engine.js");

class FakeElement {
  constructor({ hidden = false, value = "" } = {}) {
    this.hidden = hidden;
    this.value = value;
    this.textContent = "";
    this.className = "";
    this.options = [];
    this.listeners = {};
    this._innerHTML = "";
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    const options = [...this._innerHTML.matchAll(/<option\s+value="([^"]*)"/g)]
      .map(match => ({ value: match[1] }));
    if (options.length) {
      this.options = options;
      if (!options.some(option => option.value === this.value)) this.value = options[0].value;
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  focus() {}
}

const elements = new Map([
  ["#pageStatus", new FakeElement()],
  ["#authGate", new FakeElement({ hidden: true })],
  ["#searchWorkspace", new FakeElement({ hidden: true })],
  ["#globalQuery", new FakeElement()],
  ["#typeFilter", new FakeElement({ value: "all" })],
  ["#tagFilter", new FakeElement({ value: "all" })],
  ["#resetSearch", new FakeElement()],
  ["#indexedCount", new FakeElement()],
  ["#resultCount", new FakeElement()],
  ["#searchResults", new FakeElement()]
]);

const database = {
  knowledge_objects: [
    { id: "ko-1", owner_user_id: "user-1", title: "Pizza personale", description: "Raccolta" }
  ],
  knowledge_object_links: [
    {
      id: "link-1",
      owner_user_id: "user-1",
      knowledge_object_id: "ko-1",
      recipe_id: "recipe-1"
    }
  ],
  recipes: [
    {
      id: "recipe-1",
      owner_user_id: "user-1",
      code: "RC-1",
      title: "Focaccia",
      description: "Alta idratazione"
    }
  ],
  manuals: [{ id: "manual-1", owner_user_id: "user-1", title: "Manuale forno" }],
  courses: [{ id: "course-1", owner_user_id: "user-1", title: "Corso base" }],
  course_contents: [],
  appliances: [{ id: "appliance-1", owner_user_id: "user-1", name: "Forno" }],
  baking_sessions: [
    {
      id: "session-1",
      owner_user_id: "user-1",
      title: "Prova impasto",
      target_meal_at: "2026-08-10T20:00:00Z"
    }
  ],
  baking_session_notes: [],
  baking_session_evaluations: [],
  ingredients: [{ id: "ingredient-1", owner_user_id: "user-1", name: "Farina forte" }],
  recipe_ingredients: [{ recipe_id: "recipe-1", ingredient_id: "ingredient-1" }],
  tags: [{ id: "tag-1", owner_user_id: "user-1", name: "pizza" }],
  recipe_tags: [{ recipe_id: "recipe-1", tag_id: "tag-1" }],
  tag_links: [],
  appliance_manuals: []
};

function queryFor(table) {
  const response = Promise.resolve({ data: database[table] ?? [], error: null });
  const query = {
    select() { return query; },
    eq() { return query; },
    then(resolve, reject) { return response.then(resolve, reject); }
  };
  return query;
}

global.document = {
  querySelector(selector) {
    return elements.get(selector) ?? null;
  }
};

global.window = {
  CucinaHubGlobalSearchEngine: engine,
  cucinaHubSupabase: {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "user-1" } } },
        error: null
      })
    },
    from: queryFor
  },
  location: { search: "?q=farina" },
  setTimeout,
  clearTimeout
};

(async () => {
  require("./global-search.js");
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(elements.get("#authGate").hidden, true);
  assert.equal(elements.get("#searchWorkspace").hidden, false);
  assert.equal(elements.get("#indexedCount").textContent, "6 contenuti indicizzati");
  assert.equal(elements.get("#resultCount").textContent, "2 risultati");
  assert.match(elements.get("#searchResults").innerHTML, /Focaccia/);
  assert.match(elements.get("#searchResults").innerHTML, /Pizza personale/);
  assert.match(elements.get("#pageStatus").className, /ok/);

  console.log("Global Search UI: smoke test Supabase simulato superato.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
