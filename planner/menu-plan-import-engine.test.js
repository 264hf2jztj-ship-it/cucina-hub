"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const engine = require("./menu-plan-import-engine.js");

function packet(overrides = {}) {
  return {
    contract: "cucina-hub.menu-plan",
    version: 1,
    menu: {
      external_id: "diet-plan-2026-08-17",
      revision: 1,
      title: "Menu 17–30 agosto 2026",
      period_start: "2026-08-17",
      period_end: "2026-08-30",
      source: {
        type: "chatgpt_project",
        label: "Allenamento e Dieta",
        generated_at: "2026-08-16T18:30:00+02:00"
      }
    },
    days: [
      {
        date: "2026-08-17",
        meals: [
          {
            key: "2026-08-17-breakfast",
            slot: "breakfast",
            time: "07:00",
            servings: 1,
            items: [
              { key: "juice", type: "recipe", recipe_code: "RC-003", label: "Good Boy" },
              { key: "yogurt", type: "food", label: "Yogurt greco", quantity: 170, unit: "g" },
              {
                key: "salad",
                type: "preparation",
                label: "Insalata veloce",
                quantity: 1,
                unit: "portion",
                ingredients: [{ name: "Insalata mista", quantity: 120, unit: "g" }],
                procedure: ["Condisci subito prima di servire."]
              }
            ]
          }
        ]
      }
    ],
    guardrails: {
      preview_only: true,
      automatic_save: false,
      requires_user_confirmation: true
    },
    ...overrides
  };
}

const validPacket = packet();
const pureJson = JSON.stringify(validPacket);
assert.equal(engine.parse(pureJson).sourceFormat, "json");
assert.equal(engine.parse(`\n\`\`\`json\n${pureJson}\n\`\`\`\n`).sourceFormat, "markdown_json");
assert.equal(engine.parse(validPacket).sourceFormat, "object");

for (const invalidWrapper of [
  `Testo prima\n\`\`\`json\n${pureJson}\n\`\`\``,
  `\`\`\`\n${pureJson}\n\`\`\``,
  `\`\`\`json\n${pureJson}\n\`\`\`\n\`\`\`json\n{}\n\`\`\``
]) {
  assert.throws(() => engine.parse(invalidWrapper), error => error.code === "invalid_markdown_wrapper");
}
assert.throws(() => engine.parse("{oops"), error => error.code === "invalid_json");
assert.throws(() => engine.parse("[]"), error => error.code === "invalid_root");

const validation = engine.validatePacket(validPacket);
assert.equal(validation.valid, true);
assert.equal(engine.normalizeUnit(" G "), "g");
assert.equal(engine.normalizeUnit("cucchiaio"), "cucchiaio");
const unitsPacket = structuredClone(validPacket);
unitsPacket.days[0].meals[0].items[1].unit = " G ";
assert.equal(engine.validatePacket(unitsPacket).normalizedPacket.days[0].meals[0].items[1].unit, "g");
assert.deepEqual(validation.summary, {
  days: 1,
  meals: 1,
  items: 3,
  recipes: 1,
  foods: 1,
  preparations: 1
});

const unsafe = structuredClone(validPacket);
unsafe.guardrails = { preview_only: false, automatic_save: true, requires_user_confirmation: false };
assert.deepEqual(
  engine.validatePacket(unsafe).errors.map(error => error.code),
  ["guardrail_preview_only", "guardrail_automatic_save", "guardrail_user_confirmation"]
);

const badContract = structuredClone(validPacket);
badContract.contract = "other";
badContract.version = 2;
badContract.owner_user_id = "must-not-be-here";
const badContractCodes = engine.validatePacket(badContract).errors.map(error => error.code);
for (const code of ["unsupported_contract", "unsupported_version", "owner_user_id_forbidden"]) {
  assert.ok(badContractCodes.includes(code));
}

const unexpected = structuredClone(validPacket);
unexpected.guardrails.write_now = true;
unexpected.days[0].meals[0].items[1].recipe_code = "NOT-ALLOWED";
assert.equal(engine.validatePacket(unexpected).errors.filter(error => error.code === "unexpected_field").length, 2);

const badStructure = structuredClone(validPacket);
badStructure.menu.period_end = "2026-08-16";
badStructure.days[0].date = "2026-08-31";
badStructure.days.push(structuredClone(badStructure.days[0]));
badStructure.days[1].meals[0].key = badStructure.days[0].meals[0].key;
badStructure.days[0].meals[0].slot = "brunch";
badStructure.days[0].meals[0].items[1].key = "juice";
badStructure.days[0].meals[0].items[1].quantity = 0;
delete badStructure.days[0].meals[0].items[1].unit;
const badStructureCodes = engine.validatePacket(badStructure).errors.map(error => error.code);
for (const code of [
  "invalid_period",
  "day_outside_period",
  "duplicate_day_date",
  "duplicate_meal_key",
  "unsupported_meal_slot",
  "duplicate_item_key",
  "invalid_quantity",
  "missing_unit"
]) {
  assert.ok(badStructureCodes.includes(code), `Controllo mancante: ${code}`);
}

const badUnit = structuredClone(validPacket);
delete badUnit.days[0].meals[0].items[1].quantity;
badUnit.days[0].meals[0].items[1].unit = "";
assert.ok(engine.validatePacket(badUnit).errors.some(error => error.code === "invalid_unit"));

const badTimestamp = structuredClone(validPacket);
badTimestamp.menu.source.generated_at = "2026-02-30T18:30:00+02:00";
assert.ok(engine.validatePacket(badTimestamp).errors.some(error => error.code === "invalid_generated_at"));

const badRecipe = structuredClone(validPacket);
badRecipe.days[0].meals[0].items[0].ingredients = [{ name: "Pera" }];
badRecipe.days[0].meals[0].items[0].procedure = ["Estrai"];
badRecipe.days[0].meals[0].items[0].quantity = 1;
badRecipe.days[0].meals[0].items[0].unit = "portion";
const badRecipeCodes = engine.validatePacket(badRecipe).errors.map(error => error.code);
for (const code of ["recipe_embeds_ingredients", "recipe_embeds_procedure", "recipe_embeds_quantity"]) {
  assert.ok(badRecipeCodes.includes(code));
}

assert.equal(engine.isHuromRecipeCode("rc-003"), true);
assert.equal(engine.isHuromRecipeCode("EXP-004"), true);
assert.equal(engine.isHuromRecipeCode("RC-1"), false);
assert.equal(engine.isHuromRecipeCode("POLLO-001"), false);

const recipes = [
  { id: "recipe-good-boy", code: "RC-003", title: "Good Boy" },
  { id: "recipe-other", code: "OTHER-001", title: "Altra ricetta" }
];
const resolved = engine.resolveRecipeCodes(validPacket, recipes);
assert.equal(resolved.complete, true);
assert.equal(resolved.resolved[0].recipe_id, "recipe-good-boy");
assert.equal(resolved.resolved[0].is_hurom_reference, true);

const missing = engine.resolveRecipeCodes(validPacket, []);
assert.equal(missing.complete, false);
assert.equal(missing.missing[0].status, "missing_library_reference");
assert.equal(missing.missing[0].conflict.code, "missing_library_reference");

const ambiguous = engine.resolveRecipeCodes(validPacket, [
  { id: "recipe-1", code: "rc-003", title: "Uno" },
  { id: "recipe-2", code: "RC-003", title: "Due" }
]);
assert.equal(ambiguous.complete, false);
assert.equal(ambiguous.ambiguous[0].status, "ambiguous_library_reference");
assert.equal(ambiguous.ambiguous[0].candidates.length, 2);

const analysis = engine.analyze(`\`\`\`json\n${pureJson}\n\`\`\``, recipes);
assert.equal(analysis.valid, true);
assert.equal(analysis.stage, "library_resolution");
assert.equal(analysis.sourceFormat, "markdown_json");

const invalidAnalysis = engine.analyze("not-json", recipes);
assert.equal(invalidAnalysis.valid, false);
assert.equal(invalidAnalysis.stage, "parsing");
assert.equal(invalidAnalysis.errors[0].code, "invalid_json");

const publicFixture = fs.readFileSync(
  path.join(__dirname, "test-fixtures/menu-plan-v1-valid.json"),
  "utf8"
);
const fixtureResult = engine.analyze(publicFixture, recipes);
assert.equal(fixtureResult.valid, true);
assert.deepEqual(fixtureResult.summary, {
  days: 2,
  meals: 2,
  items: 3,
  recipes: 1,
  foods: 1,
  preparations: 1
});

console.log("Menu plan import engine: controlli contrattuali superati.");
