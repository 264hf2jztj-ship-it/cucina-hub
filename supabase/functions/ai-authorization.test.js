"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");
const { createHmac, timingSafeEqual } = require("node:crypto");

const functions = ["fermentation-assistant", "chef-assistant", "planner-assistant"];
const base = "https://synthetic-project.invalid";
const adminId = "00000000-0000-4000-8000-000000000001";
const viewerId = "00000000-0000-4000-8000-000000000002";
const signingKey = "local-synthetic-signing-key";

// Only the mock Auth service verifies these test JWTs. Production delegates
// verification to Supabase Auth; no claims decoded by the application are trusted.
function token(overrides = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: `${base}/auth/v1`, aud: "authenticated", role: "authenticated",
    sub: adminId, exp: Math.floor(Date.now() / 1000) + 3600,
    session_id: "00000000-0000-4000-8000-000000000003", is_anonymous: false,
    ...overrides
  })).toString("base64url");
  const signature = createHmac("sha256", signingKey).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
function verifySyntheticToken(value) {
  const [header, payload, signature] = value.split(".");
  const expected = createHmac("sha256", signingKey).update(`${header}.${payload}`).digest();
  const actual = Buffer.from(signature || "", "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  const claims = JSON.parse(Buffer.from(payload, "base64url"));
  if (claims.exp <= Date.now() / 1000 || claims.iss !== `${base}/auth/v1` ||
      claims.role !== "authenticated" || !claims.sub) return null;
  return claims;
}
const adminToken = token();
const bearer = value => `Bearer ${value}`;
const bodies = {
  "fermentation-assistant": { packet: {
    schema: "cucina-hub.fermentation-assistant.request", version: 1,
    task: { mode: "preview_only" }, sources: [],
    guardrails: { automatic_writes: false, requires_user_confirmation: true }
  } },
  "chef-assistant": { question: "Come preparo una pasta semplice?" },
  "planner-assistant": {
    prompt: "Menu semplice", period_start: "2026-10-22", period_end: "2026-10-22", servings: 2
  }
};
function providerOutput(slug) {
  if (slug === "fermentation-assistant") return {
    schema: "cucina-hub.fermentation-assistant.response", version: 1,
    state: "preview", automatic_writes: false, requires_user_confirmation: true
  };
  if (slug === "chef-assistant") return {
    schema: "cucina-hub.chef-assistant.response", version: 1,
    answer: "Risposta sintetica di prova.", evidence_mode: "general",
    source_usage: [], assumptions: [], cautions: []
  };
  return { title: "Menu sintetico", days: [{ date: "2026-10-22", meals: [{
    slot: "lunch", time: null, servings: 2,
    items: [{ type: "recipe", recipe_code: "SYNTHETIC-RECIPE" }]
  }] }] };
}

function harness(slug, settings = {}) {
  const state = { profileRole: "admin", providerConfigured: true, ...settings };
  const calls = [];
  const logs = [];
  let handler;
  const env = {
    SUPABASE_URL: base, SUPABASE_ANON_KEY: "synthetic-public-api-key",
    OPENAI_API_KEY: state.providerConfigured ? "synthetic-provider-key" : undefined,
    ...state.env
  };
  async function fetchMock(input, options = {}) {
    const url = new URL(String(input));
    const headers = new Headers(options.headers);
    calls.push({ url, headers, method: options.method || "GET", body: options.body });
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
    if (url.origin === base) {
      assert.equal(headers.get("apikey"), env.SUPABASE_ANON_KEY);
      if (url.pathname === "/auth/v1/user") {
        if (state.authThrows) throw new Error("SENSITIVE_UPSTREAM_DETAIL");
        if (state.authStatus) return json({ message: "SENSITIVE_UPSTREAM_DETAIL" }, state.authStatus);
        if (state.badAuthJson) return new Response("invalid json");
        const claims = verifySyntheticToken((headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
        if (!claims) return json({ message: "SENSITIVE_UPSTREAM_DETAIL" }, 401);
        return json({ id: claims.sub, role: claims.role, is_anonymous: claims.is_anonymous,
          user_metadata: claims.user_metadata, app_metadata: claims.app_metadata });
      }
      if (url.pathname === "/rest/v1/profiles") {
        assert.equal(url.searchParams.get("select"), "role");
        const claims = verifySyntheticToken(headers.get("authorization").replace(/^Bearer\s+/i, ""));
        assert.equal(url.searchParams.get("id"), `eq.${claims.sub}`);
        assert.equal(url.searchParams.get("limit"), "1");
        if (state.profileThrows) throw new Error("SENSITIVE_UPSTREAM_DETAIL");
        if (state.profileStatus) return json({ message: "SENSITIVE_UPSTREAM_DETAIL" }, state.profileStatus);
        if (state.badProfileJson) return new Response("invalid json");
        if (state.badProfileShape) return json({ role: "admin" });
        // A non-admin profile is normally invisible under the current RLS.
        return json(state.profileRole === null ? [] : [{ role: state.profileRole }]);
      }
      if (url.pathname === "/rest/v1/rpc/search_rag_sources") return json([]);
      if (url.pathname === "/rest/v1/recipes") return json([{ code: "SYNTHETIC-RECIPE", title: "Ricetta sintetica" }]);
      if (url.pathname === "/rest/v1/planned_meals") return json([]);
    }
    if (url.href === "https://api.openai.com/v1/responses") {
      assert.equal(headers.get("authorization"), "Bearer synthetic-provider-key");
      assert.equal(JSON.parse(options.body).store, false);
      return json({ output_text: JSON.stringify(providerOutput(slug)), model: "synthetic-model" });
    }
    throw new Error(`Unexpected outbound request: ${url.pathname}`);
  }
  const context = vm.createContext({
    Deno: { env: { get: name => env[name] }, serve: fn => { handler = fn; } },
    fetch: fetchMock, Request, Response, Headers, URL, AbortController, AbortSignal,
    DOMException, TextEncoder, setTimeout, clearTimeout,
    console: { error: (...args) => logs.push(args) }
  });
  const modules = new Map();
  function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file);
    let source = stripTypeScriptTypes(fs.readFileSync(file, "utf8"));
    const bindings = {};
    source = source.replace(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["'];?/g, (_, names, relative) => {
      assert.ok(relative.startsWith("."), "No external dependencies in the isolated handler harness");
      const dependency = load(path.resolve(path.dirname(file), relative));
      for (const name of names.split(",").map(name => name.trim()).filter(Boolean)) bindings[name] = dependency[name];
      return "";
    });
    const exported = [...source.matchAll(/^export\s+(?:async\s+)?(?:function|const)\s+(\w+)/gm)].map(match => match[1]);
    source = source.replace(/^export\s+/gm, "");
    const factory = new vm.Script(`(function(${Object.keys(bindings).join(",")}) {\n${source}\nreturn {${exported.join(",")}};\n})`, { filename: file }).runInContext(context);
    const result = factory(...Object.values(bindings));
    modules.set(file, result);
    return result;
  }
  load(path.join(__dirname, slug, "main.ts"));
  assert.equal(typeof handler, "function");
  return {
    state, calls, logs,
    async invoke(authorization, route = "health", overrides = {}) {
      const headers = { "content-type": "application/json", apikey: "synthetic-publishable-key", ...overrides.headers };
      if (authorization !== undefined) headers.authorization = authorization;
      const body = route === "health" ? { action: "health" } : bodies[slug];
      return handler(new Request(`https://edge.invalid/${slug}`, {
        method: overrides.method || "POST", headers,
        body: overrides.method === "OPTIONS" ? undefined : overrides.body ?? JSON.stringify(body)
      }));
    }
  };
}
function personalCalls(h) {
  return h.calls.filter(call => !["/auth/v1/user", "/rest/v1/profiles"].includes(call.url.pathname));
}
async function assertDenied(h, response, expectedStatus) {
  assert.equal(response.status, expectedStatus);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const text = await response.text();
  assert.doesNotMatch(text, /configured|model|synthetic-|SENSITIVE_UPSTREAM_DETAIL|admin.*@|00000000-/);
  assert.equal(personalCalls(h).length, 0, "No personal retrieval, staging or provider on a denial");
  assert.equal(h.logs.length, 0, "Authorization failures do not log upstream payloads or credentials");
}

const denials = [
  ["missing Authorization / publishable apikey alone", undefined, {}, 401],
  ["publishable key as Bearer", "sb_publishable_synthetic", {}, 401],
  ["legacy anon key without user session", token({ role: "anon", sub: undefined }), {}, 401],
  ["malformed JWT", "not-a-jwt", {}, 401],
  ["JWT with invalid signature", `${adminToken.slice(0, -4)}AAAA`, {}, 401],
  ["expired JWT", token({ exp: Math.floor(Date.now() / 1000) - 60 }), {}, 401],
  ["valid non-admin user", token({ sub: viewerId }), { profileRole: "viewer" }, 403],
  ["non-admin profile invisible under RLS", token({ sub: viewerId }), { profileRole: null }, 403],
  ["admin revoked while JWT remains valid", adminToken, { profileRole: "viewer" }, 403],
  ["forged admin metadata", token({ sub: viewerId, user_metadata: { role: "admin" }, app_metadata: { role: "admin" } }), { profileRole: null }, 403],
  ["anonymous Auth user even with an admin profile", token({ is_anonymous: true }), {}, 401],
  ["service role key is not a user session", token({ role: "service_role", sub: undefined }), {}, 401]
];
for (const slug of functions) {
  for (const route of ["health", "generate"]) {
    for (const [label, value, settings, status] of denials) {
      test(`${slug}: denies ${route}: ${label} before private retrieval/provider`, async () => {
        const h = harness(slug, settings);
        await assertDenied(h, await h.invoke(value === undefined ? undefined : bearer(value), route), status);
      });
    }
    for (const [label, settings] of [
      ["Auth outage", { authStatus: 503 }], ["Auth network failure", { authThrows: true }],
      ["invalid Auth JSON", { badAuthJson: true }], ["profile outage", { profileStatus: 500 }],
      ["profile network failure", { profileThrows: true }], ["invalid profile JSON", { badProfileJson: true }],
      ["invalid profile shape", { badProfileShape: true }], ["missing Supabase config", { env: { SUPABASE_URL: undefined } }]
    ]) {
      test(`${slug}: ${route} fails closed on ${label}`, async () => {
        const h = harness(slug, settings);
        await assertDenied(h, await h.invoke(bearer(adminToken), route), 503);
      });
    }
  }
  test(`${slug}: authorized admin health works without configuring the provider`, async () => {
    const h = harness(slug, { providerConfigured: false });
    const response = await h.invoke(bearer(adminToken));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.configured, false);
    assert.equal(body.automatic_writes, false);
    assert.equal(personalCalls(h).length, 0);
    assert.deepEqual(h.calls.map(call => call.url.pathname), ["/auth/v1/user", "/rest/v1/profiles"]);
  });
  test(`${slug}: admin generation with provider absent stays 503 after authorization`, async () => {
    const h = harness(slug, { providerConfigured: false });
    const response = await h.invoke(bearer(adminToken), "generate");
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "provider_not_configured");
    assert.equal(personalCalls(h).length, 0);
    assert.equal(h.calls.length, 2);
  });
  test(`${slug}: authorized generation preserves contracts, caller RLS and no automatic writes`, async () => {
    const h = harness(slug);
    const response = await h.invoke(bearer(adminToken), "generate");
    assert.equal(response.status, 200, await response.clone().text());
    const body = await response.json();
    assert.equal(body.guardrails.automatic_writes, false);
    assert.equal(h.calls.filter(call => call.url.origin === "https://api.openai.com").length, 1);
    assert.deepEqual(h.calls.slice(0, 2).map(call => call.url.pathname), ["/auth/v1/user", "/rest/v1/profiles"]);
    for (const call of h.calls.filter(call => call.url.origin === base)) {
      assert.equal(call.headers.get("authorization"), bearer(adminToken), "Keep the caller JWT, including retrieval");
    }
    if (slug === "planner-assistant") {
      assert.equal(body.packet.contract, "cucina-hub.menu-plan");
      assert.equal(body.packet.guardrails.requires_user_confirmation, true);
      assert.equal(h.calls.filter(call => call.url.pathname === "/rest/v1/recipes").length, 1);
    }
    if (slug !== "fermentation-assistant") {
      assert.equal(h.calls.filter(call => call.url.pathname === "/rest/v1/rpc/search_rag_sources").length, 1);
    }
  });
  test(`${slug}: same JWT stops working after live admin revocation (no role cache)`, async () => {
    const h = harness(slug);
    assert.equal((await h.invoke(bearer(adminToken))).status, 200);
    h.state.profileRole = null;
    await assertDenied(h, await h.invoke(bearer(adminToken), "generate"), 403);
    assert.equal(h.calls.filter(call => call.url.pathname === "/rest/v1/profiles").length, 2);
  });
  test(`${slug}: denied request is rejected before JSON parsing`, async () => {
    const h = harness(slug);
    await assertDenied(h, await h.invoke(undefined, "generate", { body: "invalid json" }), 401);
    assert.equal(h.calls.length, 0);
  });
  test(`${slug}: CORS preflight carries no private data and performs no auth/retrieval/provider calls`, async () => {
    const h = harness(slug);
    const response = await h.invoke(undefined, "health", { method: "OPTIONS" });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "ok");
    assert.equal(h.calls.length, 0);
  });
}

test("verify_jwt is explicitly enabled for each AI function", () => {
  const config = fs.readFileSync(path.join(__dirname, "../config.toml"), "utf8");
  for (const slug of functions) {
    const section = config.match(new RegExp(`\\[functions\\.${slug}\\]([^\\[]*)`));
    assert.ok(section, `${slug} must have an explicit config section`);
    assert.match(section[1], /verify_jwt\s*=\s*true/);
  }
});
