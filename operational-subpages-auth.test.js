"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const protectedPages = [
  "appliances/detail.html",
  "courses/detail.html",
  "fermentation/baking-session-history.html",
  "fermentation/baking-sessions.html",
  "fermentation/baking-wizard.html",
  "fermentation/dough-profiles.html",
  "fermentation/environment-profiles.html",
  "fermentation/fermentation-assistant.html",
  "fermentation/fermentation-diary.html",
  "fermentation/fermentation-learning.html",
  "fermentation/flour-profiles.html",
  "workflow-engine/guided-session.html"
];

const protectedEnhancements = [
  "fermentation/diary-notes.js",
  "fermentation/diary-photos.js",
  "fermentation/history-photos.js",
  "workflow-engine/guided-session-notes.js",
  "workflow-engine/photo-diary-v2.js"
];

test("le sottopagine operative verificano il ruolo amministratore", () => {
  for (const page of protectedPages) {
    const html = fs.readFileSync(page, "utf8");
    assert.match(html, /<script src="\.\.\/auth-guard\.js\?v=1"><\/script>/, `${page} deve caricare il guard condiviso`);
    assert.match(html, /CucinaHubAuthGuard\.requireAdministrator\([^)]+\)/, `${page} deve verificare il ruolo amministratore`);
    assert.doesNotMatch(html, /\.auth\.getSession\(\)/, `${page} non deve sostituire il guard con una lettura diretta della sessione`);
  }
});

test("le estensioni operative riusano il controllo amministratore", () => {
  for (const modulePath of protectedEnhancements) {
    const source = fs.readFileSync(modulePath, "utf8");
    assert.match(source, /CucinaHubAuthGuard\.requireAdministrator\(client\)/, `${modulePath} deve verificare il ruolo amministratore`);
    assert.doesNotMatch(source, /\.auth\.getSession\(\)/, `${modulePath} non deve leggere direttamente la sessione`);
  }

  const client = fs.readFileSync("supabase-client.js", "utf8");
  assert.match(client, /DOMContentLoaded[\s\S]*loadPageModules/);
});

test("il wrapper della scheda elettrodomestico riusa il guard del contenuto protetto", () => {
  const html = fs.readFileSync("appliances/open.html", "utf8");
  assert.match(html, /frame\.contentWindow\.CucinaHubAuthGuard\.requireAdministrator\(client\)/);
  assert.doesNotMatch(html, /\.auth\.getSession\(\)/);
});

test("il lettore locale resta disponibile senza autenticazione server", () => {
  const html = fs.readFileSync("library/reader.html", "utf8");
  assert.doesNotMatch(html, /auth-guard\.js/);
  assert.doesNotMatch(html, /cucinaHubSupabase/);
});
