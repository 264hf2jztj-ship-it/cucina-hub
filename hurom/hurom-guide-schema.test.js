"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const guide = JSON.parse(fs.readFileSync(path.join(root, "hurom-guide.json"), "utf8"));
const recipes = JSON.parse(fs.readFileSync(path.join(root, "ricette.json"), "utf8")).ricette;
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
const home = fs.readFileSync(path.join(root, "index.html"), "utf8");

const expectedSections = [
  "ricette",
  "guida-operativa",
  "filtri",
  "tabella-rapida",
  "tecniche",
  "faq",
  "ingredienti",
  "obiettivi",
  "stagionalita",
  "polpa",
  "glossario"
];

test("l'indice Hurom espone tutte le undici card richieste", () => {
  const sectionIds = guide.navigazione.map(section => section.id);
  assert.deepEqual(sectionIds, expectedSections);
  assert.equal(new Set(sectionIds).size, expectedSections.length);
});

test("le tabelle e le schede del manuale sono complete", () => {
  assert.equal(guide.guida_operativa.sequenza.length, 6);
  assert.equal(guide.filtri.opzioni.length, 2);
  assert.equal(guide.tabella_rapida.righe.length, 12);
  assert.equal(guide.faq.length, 6);
  assert.equal(guide.ingredienti.length, 20);
  assert.equal(guide.obiettivi.length, 6);
  assert.equal(guide.stagionalita.ingredienti.length, 12);
  assert.equal(guide.polpa.usi.length, 5);
  assert.equal(guide.glossario.length, 8);
});

test("la card ricette riusa il catalogo centrale Hurom", () => {
  const huromRecipes = recipes.filter(recipe => recipe.sezioni?.includes("hurom"));
  assert.equal(huromRecipes.length, 8);
  assert.equal(huromRecipes.filter(recipe => recipe.stato === "certificata").length, 5);
  assert.equal(huromRecipes.filter(recipe => recipe.stato === "da-testare").length, 3);
  assert.equal(Object.hasOwn(guide, "ricette"), false, "La guida non deve duplicare le schede ricetta");
});

test("ogni codice delle ricette per obiettivo esiste nel catalogo", () => {
  const recipeCodes = new Set(recipes.map(recipe => recipe.codice));
  const objectiveCodes = guide.obiettivi.flatMap(objective => objective.ricette);
  assert.deepEqual([...new Set(objectiveCodes)].sort(), [
    "EXP-004",
    "EXP-007",
    "EXP-008",
    "RC-001",
    "RC-002A",
    "RC-002B",
    "RC-003",
    "RC-004"
  ]);
  objectiveCodes.forEach(code => assert.equal(recipeCodes.has(code), true, `Codice mancante: ${code}`));
});

test("la Dashboard collega il nuovo hub con navigazione e layout touch", () => {
  assert.match(app, /hurom:\s*renderHuromHub/);
  assert.match(app, /data-hurom-section/);
  assert.match(app, /data-hurom-index/);
  assert.match(app, /state\.recipes\.filter\(recipe => recipe\.sezioni\?\.includes\("hurom"\)\)/);
  assert.match(css, /\.hurom-topic-card\s*\{/);
  assert.match(css, /\.hurom-back-row \.button\s*\{[^}]*min-height:\s*48px/s);
  assert.match(css, /@media \(max-width:\s*820px\)/);
  assert.match(home, /app\.js\?v=25/);
});
