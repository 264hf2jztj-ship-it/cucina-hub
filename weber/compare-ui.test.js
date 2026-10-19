"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const core = require("./compare-core.js");
const photos = require("./photos-core.js");
const settle = () => new Promise(resolve => setImmediate(resolve));
const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];
const owner = "00000000-0000-4000-8000-000000000003";
const trials = ids.map((id, i) => ({ id, title: i ? "Seconda <script>" : "Prima", cooked_at: "2026-10-19T12:00:00Z", status: "completed", rating: i + 3 }));
const photo = (session, kind = "setup") => ({ id: "photo", session_id: session, storage_file_id: ids[0], photo_kind: kind, caption: "Brace <b>privata</b>", file: { bucket_name: photos.BUCKET, mime_type: "image/jpeg", object_path: photos.objectPath(owner, session, ids[0], "image/jpeg") } });

function harness({ authorized = true, list = trials, query } = {}) {
  const nodes = new Map(), reads = [], signed = [];
  const $ = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { value: selector === "#photoPhase" ? "setup" : "", hidden: true, disabled: false, textContent: "", innerHTML: "", querySelectorAll: () => [] });
    return nodes.get(selector);
  };
  const client = { from(table) {
    const read = { table, filters: [], orders: [] };
    const q = {
      select(columns, options) { read.columns = columns; read.options = options; return this; },
      eq(key, value) { read.filters.push([key, value]); return this; },
      in(key, value) { read.ids = [key, [...value]]; return this; },
      order(key, options) { read.orders.push([key, options]); return this; },
      limit(value) { read.limit = value; return this; },
      then(resolve, reject) {
        reads.push(read);
        const result = query?.(read);
        return Promise.resolve(result === undefined ? { data: table === "weber_cook_sessions" ? (read.ids ? trials : list) : [], count: list.length } : result).then(resolve, reject);
      }
    };
    return q;
  }, storage: { from(bucket) { return { async createSignedUrl(path, seconds) { signed.push({ bucket, path, seconds }); return { data: { signedUrl: "https://example.invalid/private-photo" } }; } }; } } };
  vm.runInNewContext(fs.readFileSync(require.resolve("./compare.js"), "utf8"), {
    window: { cucinaHubSupabase: client, CucinaHubWeberCompare: core, CucinaHubWeberPhotos: photos, CucinaHubAuthGuard: { requireAdministrator: async () => ({ authorized, user: { id: owner } }) } },
    document: { querySelector: $ }, Date, encodeURIComponent
  });
  return { $, reads, signed, compare: () => $("#compareForm").onsubmit({ preventDefault() {} }) };
}
test("confronto UI: accesso negato non esegue letture", async () => {
  const h = harness({ authorized: false }); await settle();
  assert.equal(h.reads.length, 0);
  assert.equal(h.$("#authGate").hidden, false);
  assert.equal(h.$("#compareWorkspace").hidden, true);
});
test("confronto UI: due prove richieste, stesso ID rifiutato senza query", async () => {
  const empty = harness({ list: [trials[0]] }); await settle();
  assert.equal(empty.$("#compareButton").disabled, true);
  assert.match(empty.$("#compareStatus").textContent, /almeno due/);
  const h = harness(); await settle();
  h.$("#trialB").value = ids[0]; await h.compare();
  assert.equal(h.reads.length, 1);
  assert.equal(h.$("#comparison").hidden, true);
  assert.match(h.$("#compareStatus").textContent, /diverse/);
});
test("confronto UI: filtra ogni lettura per proprietario, coppia e fase; firma solo i file validi", async () => {
  const h = harness({ query: read => read.table === "weber_session_photos" ? { data: [photo(read.filters.find(([key]) => key === "session_id")[1])], count: 10 } : undefined });
  await settle(); await h.compare();
  for (const read of h.reads) assert.ok(read.filters.some(([key, value]) => key === "owner_user_id" && value === owner));
  assert.deepEqual(h.reads[1].ids, ["id", ids]);
  assert.equal(h.reads[0].limit, 200);
  for (const read of h.reads.slice(2)) {
    assert.ok(read.filters.some(([key, value]) => key === "session_id" && ids.includes(value)));
    assert.ok(read.filters.some(([key, value]) => key === "photo_kind" && value === "setup"));
    assert.equal(read.limit, 6);
    assert.equal(read.options.count, "exact");
  }
  assert.equal(h.signed.length, 2);
  assert.ok(h.signed.every(signed => signed.seconds === 300 && signed.bucket === "recipe-images"));
  assert.match(h.$("#photosA").innerHTML, /1 foto mostrate su 10/);
  assert.match(h.$("#photosA").innerHTML, /Brace &lt;b&gt;privata/);
  assert.doesNotMatch(h.$("#photosB").innerHTML, /<script>/);
  assert.equal(h.$("#comparison").hidden, false);
  await h.$("#swapTrials").onclick();
  assert.match(h.$("#pairSummary").textContent, /^A: Seconda/);
});
test("confronto UI: errore foto e file fuori percorso non nascondono i parametri", async () => {
  const h = harness({ query: read => {
    if (read.table !== "weber_session_photos") return;
    if (read.filters.some(([, value]) => value === ids[1])) return { error: new Error("denied") };
    return { data: [{ ...photo(ids[0]), file: { bucket_name: "public", object_path: "other-owner/file.jpg" } }] };
  } });
  await settle(); await h.compare();
  assert.equal(h.$("#comparison").hidden, false);
  assert.match(h.$("#photosA").innerHTML, /Anteprima non disponibile/);
  assert.match(h.$("#photosB").innerHTML, /Foto non disponibili/);
  assert.equal(h.signed.length, 0);
});
test("confronto UI: prova eliminata e errore elenco non mostrano risultati obsoleti", async () => {
  let fail = false;
  const h = harness({ query: read => fail ? (read.ids ? { data: [trials[0]] } : { error: new Error("offline") }) : undefined });
  await settle(); await h.compare();
  fail = true;
  await h.compare();
  assert.equal(h.$("#comparison").hidden, true);
  assert.match(h.$("#compareStatus").textContent, /non disponibile/);
  await h.$("#reloadTrials").onclick();
  assert.equal(h.$("#compareButton").disabled, true);
  assert.match(h.$("#compareStatus").textContent, /Impossibile caricare/);
});
test("confronto UI: selezione cambiata invalida una richiesta ancora in corso", async () => {
  let resolvePair;
  const h = harness({ query: read => read.ids ? new Promise(resolve => { resolvePair = resolve; }) : undefined });
  await settle();
  const pending = h.compare(); await settle();
  h.$("#trialB").onchange();
  resolvePair({ data: trials }); await pending;
  assert.equal(h.$("#comparison").hidden, true);
  assert.equal(h.reads.length, 2);
});
test("confronto UI: risposte fotografiche di una vecchia fase non sostituiscono la nuova", async () => {
  const pending = [];
  const h = harness({ query: read => read.table === "weber_session_photos" && read.filters.some(([, value]) => value === "setup") ? new Promise(resolve => pending.push(resolve)) : undefined });
  await settle();
  const comparison = h.compare(); await settle();
  h.$("#photoPhase").value = "result";
  await h.$("#photoPhase").onchange();
  const latest = h.$("#photosA").innerHTML;
  pending.forEach(resolve => resolve({ data: [photo(ids[0])] })); await comparison;
  assert.equal(h.$("#photosA").innerHTML, latest);
  assert.equal(h.signed.length, 0);
});
test("confronto UI: elenco ricaricabile e vuoto, nessuna foto dichiarata quando la lettura riesce vuota", async () => {
  const h = harness(); await settle(); await h.compare();
  assert.match(h.$("#photosA").innerHTML, /Nessuna foto registrata/);
  await h.$("#reloadTrials").onclick();
  assert.equal(h.$("#comparison").hidden, true);
  assert.equal(h.$("#compareButton").disabled, false);
});
