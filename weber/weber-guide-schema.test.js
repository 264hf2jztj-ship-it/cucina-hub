"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const guide = JSON.parse(fs.readFileSync(path.join(root, "weber-guide.json"), "utf8"));
const categories = JSON.parse(fs.readFileSync(path.join(root, "categorie.json"), "utf8")).categorie;
const appliances = JSON.parse(fs.readFileSync(path.join(root, "elettrodomestici.json"), "utf8")).elettrodomestici;
const recipes = JSON.parse(fs.readFileSync(path.join(root, "ricette.json"), "utf8")).ricette;
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
const worker = fs.readFileSync(path.join(root, "sw.js"), "utf8");

const expectedSections = [
  "fondamentali",
  "accensione",
  "metodi",
  "affumicatura",
  "combustibile",
  "sicurezza",
  "ricette"
];

test("la guida Weber espone le sette aree del primo MVP", () => {
  assert.deepEqual(guide.navigazione.map(section => section.id), expectedSections);
  assert.equal(new Set(guide.navigazione.map(section => section.id)).size, expectedSections.length);
  assert.equal(guide.fondamentali.principi.length, 3);
  assert.equal(guide.accensione.sequenza.length, 6);
  assert.equal(guide.metodi.length, 2);
  assert.equal(guide.sicurezza.regole.length, 6);
});

test("il profilo Weber 57 cm conserva fonte e riferimenti senza pubblicare il PDF", () => {
  assert.equal(guide.meta.fonte, "Weber - La cucina al barbecue");
  assert.equal(guide.meta.pagine_fonte, "11-22");
  assert.equal(guide.combustibile.riferimento_57_cm.aggiunta_oraria_per_lato, "9");
  assert.doesNotMatch(worker, /Weber - La cucina al barbecue - \[BBQ\] - C\.pdf/);
  assert.equal(Object.hasOwn(guide, "ricette"), false, "La guida non deve duplicare ricette");
});

test("categoria, apparecchio e ricettario condividono l'identità Weber", () => {
  const category = categories.find(item => item.id === "barbecue");
  const appliance = appliances.find(item => item.id === "weber-kettle-57");
  assert.equal(category?.vista, "weber");
  assert.equal(category?.stato, "attiva");
  assert.equal(appliance?.sezione, "barbecue");
  assert.deepEqual(recipes.filter(recipe => recipe.sezioni?.includes("barbecue")), []);
});

test("la home collega il modulo Weber e riusa il ricettario centrale", () => {
  assert.match(home, /data-view="weber"/);
  assert.match(home, /app\.js\?v=26/);
  assert.match(app, /weberGuide:\s*"weber-guide\.json"/);
  assert.match(app, /weber:\s*renderWeberHub/);
  assert.match(app, /data-weber-section/);
  assert.match(app, /data-weber-index/);
  assert.match(app, /state\.recipes\.filter\(recipe => recipe\.sezioni\?\.includes\("barbecue"\)\)/);
  assert.match(app, /class="hurom-topic-card weber-topic-card"/);
  assert.match(worker, /"\.\/weber-guide\.json"/);
});
