"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("learning/index.html", "utf8");
const js = fs.readFileSync("learning/learning.js", "utf8");
const css = fs.readFileSync("learning/learning.css", "utf8");
const home = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

test("Learning Hub loads the existing analysis engine and dedicated assets", () => {
  assert.match(html, /fermentation-learning-engine\.js\?v=1/);
  assert.match(html, /learning-core\.js\?v=1/);
  assert.match(html, /learning\.js\?v=1/);
  assert.match(html, /learning\.css\?v=1/);
});

test("Learning Hub is authenticated and scopes every data source to the owner", () => {
  assert.match(js, /client\.auth\.getSession\(\)/);
  assert.match(js, /\.from\("fermentation_learning_preferences"\)/);
  assert.match(js, /\.from\("baking_sessions"\)/);
  assert.match(js, /\.from\("baking_session_evaluations"\)/);
  assert.ok((js.match(/\.eq\("owner_user_id", user\.id\)/g) || []).length >= 3);
});

test("navigation, Dashboard and offline shell expose Learning", () => {
  assert.match(home, /href="learning\/index\.html\?v=1"[^>]*>.*Learning/s);
  assert.match(app, /"Learning"[\s\S]*"learning\/index\.html\?v=1"/);
  assert.match(sw, /cucina-hub-v30/);
  assert.match(sw, /learning\/index\.html/);
  assert.match(sw, /learning\/learning-core\.js/);
});

test("Learning UI declares evidence, reversibility and touch-first layout", () => {
  assert.match(html, /Ogni insight indica quante prove lo sostengono/);
  assert.match(html, /non applica modifiche/i);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /@media \(max-width:\s*600px\)/);
});
