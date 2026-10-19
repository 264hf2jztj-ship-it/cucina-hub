"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./photos-core.js");
const owner = "00000000-0000-4000-8000-000000000001";
const session = "00000000-0000-4000-8000-000000000002";
const id = "00000000-0000-4000-8000-000000000003";
const file = { name: "brace.jpg", type: "image/jpeg", size: 512 };
const args = { owner, session, file, kind: "setup", caption: "Brace ai lati" };

function mock({ uploadError = null, rpcError = null, registered = null, lookupError = null, removeError = null } = {}) {
  const calls = [];
  const storage = {
    async upload(...values) { calls.push(["upload", ...values]); return { error: uploadError }; },
    async remove(paths) { calls.push(["remove", paths]); return { error: removeError }; }
  };
  const query = { select() { return this; }, eq() { return this; }, async maybeSingle() { calls.push(["reconcile"]); return { data: registered, error: lookupError }; } };
  return { calls, storage: { from: bucket => { assert.equal(bucket, "recipe-images"); return storage; } }, from: table => { assert.equal(table, "weber_session_photos"); return query; }, async rpc(name, values) { calls.push(["rpc", name, values]); return { error: rpcError }; } };
}

test("foto: limita dimensioni e formati, inclusi HEIC senza MIME", () => {
  assert.equal(core.mimeFor(file), "image/jpeg");
  assert.equal(core.mimeFor({ name: "foto.HEIC", type: "", size: 100 }), "image/heic");
  for (const value of [null, { ...file, size: 0 }, { ...file, size: core.MAX_BYTES + 1 }, { ...file, type: "image/svg+xml" }, { ...file, type: "text/plain" }]) assert.throws(() => core.mimeFor(value));
  assert.throws(() => core.metadata("unknown"));
  assert.throws(() => core.metadata("setup", "x".repeat(1001)));
});

test("foto: percorso UUID privato e coerente con il MIME", () => {
  assert.equal(core.objectPath(owner, session, id, "image/jpeg"), `${owner}/weber/${session}/photos/${id}.jpg`);
  assert.throws(() => core.objectPath("../user", session, id, "image/jpeg"));
});

test("foto: upload poi registrazione atomica, senza sovrascrittura", async () => {
  const client = mock();
  assert.equal(await core.uploadPhoto(client, args, id), id);
  assert.deepEqual(client.calls.map(call => call[0]), ["upload", "rpc"]);
  assert.equal(client.calls[0][3].upsert, false);
  assert.equal(client.calls[1][1], "register_weber_photo");
  assert.equal(client.calls[1][2].p_session_id, session);
});

test("foto: un upload rifiutato non crea metadati né elimina altri file", async () => {
  const client = mock({ uploadError: new Error("upload denied") });
  await assert.rejects(core.uploadPhoto(client, args, id), /upload denied/);
  assert.deepEqual(client.calls.map(call => call[0]), ["upload"]);
});

test("foto: una registrazione fallita elimina solo l'oggetto appena caricato", async () => {
  const client = mock({ rpcError: new Error("registration failed") });
  await assert.rejects(core.uploadPhoto(client, args, id), /registration failed/);
  assert.deepEqual(client.calls.map(call => call[0]), ["upload", "rpc", "reconcile", "remove"]);
  assert.deepEqual(client.calls[3][1], [core.objectPath(owner, session, id, "image/jpeg")]);
});

test("foto: un errore di rete dopo il commit non cancella una foto registrata", async () => {
  const client = mock({ rpcError: new Error("network"), registered: { id } });
  assert.equal(await core.uploadPhoto(client, args, id), id);
  assert.equal(client.calls.some(call => call[0] === "remove"), false);
});

test("foto: pulizia incerta conserva il percorso e permette il recupero", async () => {
  for (const failure of [{ lookupError: new Error("network") }, { removeError: new Error("storage unavailable") }]) {
    const client = mock({ rpcError: new Error("DB"), ...failure });
    let pending;
    await assert.rejects(core.uploadPhoto(client, args, id), error => { pending = error.cleanup; return Boolean(pending); });
    const recovery = mock();
    await core.retryCleanup(recovery, pending);
    assert.deepEqual(recovery.calls.map(call => call[0]), ["reconcile", "remove"]);
    const committed = mock({ registered: { id } });
    await core.retryCleanup(committed, pending);
    assert.deepEqual(committed.calls.map(call => call[0]), ["reconcile"]);
  }
});

const photo = { id, storage_file_id: id, file: { bucket_name: core.BUCKET, object_path: core.objectPath(owner, session, id, "image/jpeg"), mime_type: "image/jpeg" } };
test("foto: cancellazione Storage prima della pulizia atomica del registro", async () => {
  const client = mock();
  await core.removePhoto(client, photo, owner, session);
  assert.deepEqual(client.calls.map(call => call[0]), ["remove", "rpc"]);
  assert.equal(client.calls[1][1], "unregister_weber_photo");
});

test("foto: se Storage rifiuta la cancellazione i metadati restano intatti", async () => {
  const client = mock({ removeError: new Error("storage denied") });
  await assert.rejects(core.removePhoto(client, photo, owner, session), /storage denied/);
  assert.deepEqual(client.calls.map(call => call[0]), ["remove"]);
  await assert.rejects(core.removePhoto(client, photo, session, owner), /non corrisponde/);
});

test("foto: se la pulizia DB fallisce l'utente può ripeterla senza perdere il riferimento", async () => {
  const client = mock({ rpcError: new Error("DB unavailable") });
  await assert.rejects(core.removePhoto(client, photo, owner, session), /nuovamente Elimina/);
});

test("foto: eccezioni di rete durante upload e pulizia conservano i dati di recupero", async () => {
  const client = mock();
  client.storage.from = () => ({ upload: async () => { throw new Error("offline"); } });
  await assert.rejects(core.uploadPhoto(client, args, id), error => error.cleanup?.id === id);
  const failed = mock({ rpcError: new Error("DB") });
  failed.storage.from = () => ({ upload: async () => ({ error: null }), remove: async () => { throw new Error("offline"); } });
  await assert.rejects(core.uploadPhoto(failed, args, id), error => error.cleanup?.id === id);
});
