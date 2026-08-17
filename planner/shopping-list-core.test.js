"use strict";

const assert = require("node:assert/strict");
const shoppingList = require("./shopping-list-core.js");

const valid = shoppingList.normalizeManualItem({
  name: "  Limoni biologici  ",
  quantity: "4,5",
  unit: "pz",
  category: "produce",
  note: "Non trattati"
});

assert.equal(valid.valid, true);
assert.equal(valid.value.name, "Limoni biologici");
assert.equal(valid.value.normalized_name, "limoni biologici");
assert.equal(valid.value.quantity, 4.5);
assert.equal(valid.value.source_type, "manual");
assert.equal(valid.value.is_checked, false);

const incompleteQuantity = shoppingList.normalizeManualItem({
  name: "Farina",
  quantity: "1",
  category: "pantry"
});
assert.equal(incompleteQuantity.valid, false);
assert.match(incompleteQuantity.errors.join(" "), /compilate insieme/i);

const invalidCategory = shoppingList.normalizeManualItem({
  name: "Carta forno",
  category: "not-valid"
});
assert.equal(invalidCategory.valid, false);
assert.match(invalidCategory.errors.join(" "), /categoria valida/i);

assert.equal(shoppingList.normalizeName("Crème brûlée!"), "creme brulee");

const items = [
  { id: "checked", name: "Latte", category: "dairy", source_type: "manual", is_checked: true, is_excluded: false },
  { id: "produce-b", name: "Zucchine", category: "produce", source_type: "planner_recipe", is_checked: false, is_excluded: false },
  { id: "excluded", name: "Pane", category: "bakery", source_type: "planner_food", is_checked: false, is_excluded: true },
  { id: "produce-a", name: "Limoni", category: "produce", source_type: "manual", is_checked: false, is_excluded: false }
];

assert.deepEqual(shoppingList.sortItems(items).map(item => item.id), [
  "produce-a",
  "produce-b",
  "checked",
  "excluded"
]);
assert.deepEqual(shoppingList.filterItems(items, "active").map(item => item.id), ["produce-b", "produce-a"]);
assert.deepEqual(
  shoppingList.groupItemsByCategory(items, "all").map(group => [group.category, group.items.length]),
  [["produce", 2], ["dairy", 1], ["bakery", 1]]
);
assert.deepEqual(shoppingList.summarizeItems(items), {
  total: 4,
  active: 2,
  checked: 1,
  excluded: 1,
  manual: 2,
  generated: 2
});
assert.equal(shoppingList.formatQuantity({ quantity: 1.5, unit: "kg" }), "1,5 kg");
assert.equal(shoppingList.formatQuantity({ quantity: null, quantity_text: "quanto basta" }), "quanto basta");

console.log("Lista spesa Core: test logici superati.");
