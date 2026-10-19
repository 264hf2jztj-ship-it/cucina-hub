"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const core = require("./photos-core.js");
const session = "00000000-0000-4000-8000-000000000002";
const settle = () => new Promise(resolve => setImmediate(resolve));

function harness({ authorized = true, failReload = false } = {}) {
  const nodes = new Map();
  const $ = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { value: "", hidden: true, className: "", textContent: "", innerHTML: "", querySelectorAll: () => [] });
    return nodes.get(selector);
  };
  let reads = 0, requests = 0;
  const uploads = [];
  const client = { from(table) {
    requests++;
    const q = { select() { return this; }, eq() { return this; }, order() { return this; }, single() { return this; }, then(resolve) {
      if (table === "weber_cook_sessions") return Promise.resolve({ data: { title: "Prova reale" } }).then(resolve);
      reads++;
      return Promise.resolve(failReload && reads > 1 ? { error: new Error("reload failed") } : { data: [] }).then(resolve);
    } };
    return q;
  } };
  const api = { ...core, async uploadPhoto(client, args) { uploads.push(args); return "new-photo"; } };
  vm.runInNewContext(fs.readFileSync(require.resolve("./photos.js"), "utf8"), {
    window: { cucinaHubSupabase: client, CucinaHubWeberPhotos: api, location: { search: `?session=${session}` }, CucinaHubAuthGuard: { requireAdministrator: async () => ({ authorized, user: { id: "owner-1" } }) } },
    document: { querySelector: $, querySelectorAll: () => [] }, URLSearchParams, Date, confirm: () => true
  });
  return { $, uploads, requests: () => requests };
}

test("galleria: accesso negato non legge dati personali", async () => {
  const h = harness({ authorized: false });
  await settle();
  assert.equal(h.requests(), 0);
  assert.equal(h.$("#photoWorkspace").hidden, true);
  assert.equal(h.$("#authGate").hidden, false);
});

test("galleria: carica solo alla conferma, ricarica e cancella la selezione", async () => {
  const h = harness();
  await settle();
  assert.equal(h.$("#photoWorkspace").hidden, false);
  h.$("#photoKind").value = "setup";
  h.$("#photoLibrary").onchange({ target: { files: [{ name: "brace.jpg", type: "image/jpeg", size: 100 }] } });
  assert.equal(h.uploads.length, 0);
  await h.$("#photoForm").onsubmit({ preventDefault() {} });
  assert.equal(h.uploads.length, 1);
  assert.equal(h.uploads[0].session, session);
  assert.equal(h.$("#selectedFile").textContent, "Nessuna foto selezionata.");
  assert.match(h.$("#photoStatus").textContent, /Foto salvata/);
});

test("galleria: errore di refresh dopo il salvataggio non propone di ricaricare il file", async () => {
  const h = harness({ failReload: true });
  await settle();
  h.$("#photoKind").value = "result";
  h.$("#photoLibrary").onchange({ target: { files: [{ name: "risultato.jpg", type: "image/jpeg", size: 100 }] } });
  await h.$("#photoForm").onsubmit({ preventDefault() {} });
  assert.match(h.$("#photoStatus").textContent, /Foto salvata, ma galleria non aggiornata/);
  assert.equal(h.uploads.length, 1);
});
