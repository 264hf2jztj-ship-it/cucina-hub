"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const core = require("./diary-core.js");

const setup = { id: "preset-1", title: "Indiretta base", cooking_method: "indirect", fuel_type: "briquettes", fuel_amount: 50, fuel_unit: "pieces", vent_bottom_percent: 0, vent_top_percent: 100, target_grate_temp_c: 180 };
const settle = () => new Promise(resolve => setImmediate(resolve));

function harness() {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) {
      const field = { hidden: false };
      elements.set(selector, { value: "", textContent: "", innerHTML: "", hidden: false, disabled: false, open: false,
        closest: () => field, showModal() { this.open = true; }, close() { this.open = false; },
        reset() { for (const el of elements.values()) el.value = ""; }
      });
    }
    return elements.get(selector);
  };
  const db = { recipes: [], weber_cook_sessions: [], weber_cook_configurations: [{ ...setup }] };
  const writes = [];
  const client = { from(table) {
    let operation = "select", data, id;
    const query = {
      select() { return this; }, eq(key, value) { if (key === "id") id = value; return this; },
      is() { return this; }, order() { return this; }, single() { return this; },
      insert(value) { operation = "insert"; data = value; return this; },
      update(value) { operation = "update"; data = value; return this; },
      delete() { operation = "delete"; return this; },
      then(resolve) {
        if (operation !== "select") writes.push({ table, operation, data });
        if (operation === "insert") db[table].push({ id: "new-id", ...data });
        if (operation === "update") Object.assign(db[table].find(row => row.id === id), data);
        if (operation === "delete") db[table] = db[table].filter(row => row.id !== id);
        return Promise.resolve({ data: db[table], error: null }).then(resolve);
      }
    };
    return query;
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve("./diary.js"), "utf8"), {
    window: { cucinaHubSupabase: client, CucinaHubWeberDiaryCore: core, CucinaHubAuthGuard: { requireAdministrator: async () => ({ authorized: true, user: { id: "owner-1" } }) } },
    document: { querySelector: element }, Intl, Date, confirm: () => true
  });
  return { element, db, writes };
}

test("usare un preset apre una nuova sessione indipendente e salva solo alla conferma", async () => {
  const { element, db, writes } = harness();
  await settle();
  element("#configurationList").onclick({ target: { closest: () => ({ dataset: { configurationAction: "use", id: "preset-1" } }) } });
  assert.equal(element("#sessionId").value, "");
  assert.equal(element("#ventBottom").value, 0);
  assert.equal(element("#rating").value, "");
  assert.equal(element("#recipeId").value, "");
  assert.equal(element("#cookedAt").disabled, false);
  assert.equal(writes.length, 0);
  await element("#sessionForm").onsubmit({ preventDefault() {} });
  assert.equal(writes[0].table, "weber_cook_sessions");
  assert.equal(writes[0].operation, "insert");
  assert.equal(writes[0].data.fuel_amount, 50);
  db.weber_cook_configurations[0].fuel_amount = 10;
  assert.equal(db.weber_cook_sessions[0].fuel_amount, 50);
});

test("modificare ed eliminare una configurazione non scrive nelle sessioni", async () => {
  const { element, writes } = harness();
  await settle();
  const click = action => element("#configurationList").onclick({ target: { closest: () => ({ dataset: { configurationAction: action, id: "preset-1" } }) } });
  click("edit");
  assert.equal(element("#cookedAt").disabled, true);
  element("#fuelAmount").value = "40";
  await element("#sessionForm").onsubmit({ preventDefault() {} });
  assert.equal(writes[0].table, "weber_cook_configurations");
  assert.equal(writes[0].operation, "update");
  assert.equal("cooked_at" in writes[0].data, false);
  click("delete");
  await settle();
  assert.equal(writes[1].operation, "delete");
  assert.ok(writes.every(write => write.table === "weber_cook_configurations"));
});
