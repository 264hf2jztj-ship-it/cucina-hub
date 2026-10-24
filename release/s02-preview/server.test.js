"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { createPreviewServer, adaptHtml, assertPrivatePort, verifyCodespaces, PAGES, ASSETS } = require("./server.cjs");
const root = path.resolve(__dirname, "../..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });

test("preview privacy refuses absent, organization and public ports", () => {
  for (const ports of [[], null, [{ sourcePort: 8787, visibility: "public" }], [{ sourcePort: 8787, visibility: "org" }], [{ sourcePort: 9000, visibility: "private" }]]) assert.throws(() => assertPrivatePort(ports, 8787));
  assert.doesNotThrow(() => assertPrivatePort([{ sourcePort: 8787, visibility: "private" }], 8787));
});
test("Codespaces check uses configured gh authentication without printing credentials", () => {
  assert.throws(() => verifyCodespaces(8787, {}), /Codespace/);
  const env = { CODESPACES: "true", CODESPACE_NAME: "synthetic-space" };
  verifyCodespaces(8787, env, (cmd, args) => {
    assert.equal(cmd, "gh"); assert.deepEqual(args, ["codespace", "ports", "--codespace", "synthetic-space", "--json", "sourcePort,visibility"]);
    return JSON.stringify([{ sourcePort: 8787, visibility: "private" }]);
  });
  assert.throws(() => verifyCodespaces(8787, env, () => { throw new Error("SENSITIVE_TOKEN"); }), error => !error.message.includes("SENSITIVE_TOKEN"));
});

test("HTTP harness serves only isolated allowlisted resources and committed application bytes", async t => {
  const { server, meta } = createPreviewServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const get = pathname => fetch(origin + pathname);
  const control = await get("/preview/");
  assert.equal(control.status, 200);
  assert.match(control.headers.get("content-security-policy"), /connect-src 'self'/);
  assert.match(await control.text(), /servizi SIMULATI/);
  for (const file of PAGES) {
    const result = await get(`/app/${file}?v=999`);
    assert.equal(result.status, 200, file);
    assert.match(result.headers.get("content-security-policy"), /connect-src 'none'/);
    assert.match(result.headers.get("content-security-policy"), /worker-src 'none'/);
    assert.match(result.headers.get("content-security-policy"), /form-action 'none'/);
    assert.equal(result.headers.get("cache-control"), "no-store");
    const text = await result.text();
    assert.equal(text, adaptHtml(git("show", `HEAD:${file}`)));
    assert.doesNotMatch(text, /<script[^>]+src="https?:/i);
    assert.ok(text.indexOf("/__test/mock.js") < text.indexOf("auth-guard.js"));
  }
  for (const file of ASSETS) {
    const result = await get(`/app/${file}`);
    assert.equal(result.status, 200, file);
    assert.equal(await result.text(), git("show", `HEAD:${file}`));
  }
  const config = await (await get("/app/supabase-config.js")).text();
  assert.match(config, /synthetic\.invalid/); assert.doesNotMatch(config, /supabase\.co|eyJ|sb_secret|service_role/);
  for (const pathname of ["/app/sw.js", "/app/.env", "/app/.git/config", "/app/supabase/functions/chef-assistant/main.ts", "/app/knowledge/rag.html", "/__test/../../supabase-config.js", "/api/proxy?url=https://example.invalid"]) assert.equal((await get(pathname)).status, 404, pathname);
  assert.equal((await fetch(origin + "/preview/", { method: "POST", body: "synthetic" })).status, 405);
  const servedMeta = await (await get("/__test/meta.json")).json();
  assert.equal(servedMeta.commit, git("rev-parse", "HEAD").trim());
  assert.equal(servedMeta.browserTestCompleted, false);
  assert.equal(servedMeta.cacheName, "cucina-hub-v57");
  assert.equal(Object.keys(meta.applicationHashes).length, PAGES.length + ASSETS.length);
});

function mockFixture() {
  const window = {}, callbacks = new Map();
  const document = { addEventListener: (name, fn) => callbacks.set(name, fn) };
  window.addEventListener = (name, fn) => callbacks.set(name, fn);
  Object.defineProperty(window, "localStorage", { get() { throw new Error("Persistence not allowed"); } });
  const context = vm.createContext({ window, parent: window, location: { origin: "https://isolated.invalid" }, navigator: {}, document, Response, setTimeout, BroadcastChannel: undefined });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "mock.js"), "utf8"), context);
  return { window, client: window.supabase.createClient(), api: window.__S02Test };
}
test("mock Auth has synthetic identities, revocation without Auth event and no personal persistence", async () => {
  const { client, api } = mockFixture();
  assert.equal((await client.auth.getSession()).data.session, null);
  const observed = [];
  client.auth.onAuthStateChange(event => observed.push(event));
  api.apply({ account: "A", role: "admin" }, "SIGNED_IN");
  const before = (await client.auth.getSession()).data.session;
  assert.match(before.access_token, /^SYNTHETIC_NOT_A_JWT/);
  assert.equal((await client.auth.getUser(before.access_token)).error, null);
  api.apply({ account: "A", role: "member", expires: before.expires_at }, null);
  assert.equal(observed.filter(e => e === "SIGNED_IN").length, 1);
  const profile = await client.from("profiles").select("role").eq("id", before.user.id).single();
  assert.equal(profile.data.role, "member");
  assert.equal((await client.auth.getSession()).data.session.access_token, before.access_token);
});
test("mock denies real fetch, XHR and sockets before any network transport", async () => {
  const { window } = mockFixture();
  await assert.rejects(window.fetch("https://synthetic-project.supabase.co"), /disabilitate/);
  assert.throws(() => new window.XMLHttpRequest(), /disabilitate/);
  assert.throws(() => new window.WebSocket(), /disabilitate/);
  assert.throws(() => new window.EventSource(), /disabilitate/);
});
test("mock can release a previous account response after logout, without calling a provider", async () => {
  const { client, api } = mockFixture();
  api.apply({ account: "A", role: "admin" }, "SIGNED_IN"); api.hold(true);
  let completed = false;
  const pending = client.functions.invoke("chef-assistant", { body: { question: "synthetic" } }).then(r => { completed = true; return r; });
  assert.equal(api.snapshot().pending, 1); assert.equal(completed, false);
  api.apply({ account: null }, "SIGNED_OUT"); api.release();
  assert.match((await pending).data.response.answer, /S02_PRIVATE_A/);
  assert.equal((await client.auth.getSession()).data.session, null);
});
test("mock Planner response validates with the actual unchanged Planner core", async () => {
  const { client, api } = mockFixture();
  api.apply({ account: "A", role: "admin" }, "SIGNED_IN");
  const result = await client.functions.invoke("planner-assistant", { body: { prompt: "synthetic", period_start: "2026-10-23", period_end: "2026-10-23" } });
  const core = require("../../planner/planner-ai-core.js");
  assert.equal(core.validateGeneratedResponse(result.data).valid, true);
  assert.equal(api.snapshot().calls.includes("planner-menu-preview"), false);
});
test("preview scripts parse and keep cache/backend validation explicitly NOT TESTED", () => {
  for (const file of ["mock.js", "control.js"]) new vm.Script(fs.readFileSync(path.join(__dirname, file), "utf8"));
  const control = fs.readFileSync(path.join(__dirname, "control.js"), "utf8");
  assert.match(control, /status: "NOT TESTED"/); assert.match(control, /PARTIALLY VERIFIED/);
  assert.match(control, /cache Safari dopo distribuzione NOT TESTED/);
  assert.doesNotMatch(control, /localStorage|sessionStorage|indexedDB/);
});

test("control waits for the new iframe document before inspecting a same-page reload", async () => {
  const source = fs.readFileSync(path.join(__dirname, "control.js"), "utf8");
  const openSource = source.slice(source.indexOf("  async function open("), source.indexOf("  function submit()"));
  const oldDocument = { readyState: "complete" };
  let currentDocument = oldDocument, currentApi = {}, checks = 0, assigned;
  const location = { pathname: "/app/chef/index.html", search: "?s02Run=previous" };
  const frame = { hidden: true, contentWindow: { location } };
  Object.defineProperty(frame, "src", { set(value) { assigned = value; } });
  const context = vm.createContext({ frame, window: {}, modules: { chef: { path: "chef/index.html" } },
    selectedModule: "chef", sequence: 0, setState() {}, doc: () => currentDocument, api: () => currentApi,
    stateAllowed: () => true, allowed: () => true, denied: () => false, URLSearchParams,
    until: async predicate => {
      if (++checks !== 1) { assert.equal(predicate(), true); return; }
      // Setting src does not synchronously replace a same-origin iframe's DOM.
      assert.equal(assigned, "/app/chef/index.html?s02Run=1");
      assert.equal(predicate(), false, "must not inspect the previous complete document");
      currentDocument = { readyState: "complete" };
      assert.equal(predicate(), false, "must not accept a document for another navigation");
      location.search = "?s02Run=1";
      currentDocument.readyState = "loading";
      assert.equal(predicate(), false, "must wait for page scripts to finish loading");
      currentDocument.readyState = "complete"; currentApi = undefined;
      assert.equal(!!predicate(), false, "must wait for the new mock bootstrap");
      currentApi = {};
      assert.equal(predicate(), true);
    }
  });
  await vm.runInContext(`(${openSource})( { account: 'A', role: 'admin' } )`, context);
  assert.equal(checks, 2);
});
