"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const guard = require("../auth-guard.js");

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

function fixture() {
  const listeners = new Map(), timers = new Map();
  let nextTimer = 1, callback;
  const state = { user: "admin-a", role: "admin", sessionError: null, authError: null, profileError: null, calls: [], expires: Math.floor(Date.now() / 1000) + 3600 };
  const document = { visibilityState: "visible", addEventListener: (k, f) => listeners.set(k, f), removeEventListener: k => listeners.delete(k) };
  const host = {
    document,
    addEventListener: (k, f) => listeners.set(k, f), removeEventListener: k => listeners.delete(k),
    setTimeout: (f, delay) => { const id = nextTimer++; timers.set(id, { f, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    setInterval: (f, delay) => { const id = nextTimer++; timers.set(id, { f, delay, interval: true }); return id; },
    clearInterval: id => timers.delete(id)
  };
  const session = () => state.user ? { user: { id: state.user }, access_token: "synthetic-session", expires_at: state.expires } : null;
  const client = {
    auth: {
      getSession: async () => ({ data: { session: session() }, error: state.sessionError }),
      getUser: async () => { state.calls.push("auth"); return { data: { user: state.user ? { id: state.user, is_anonymous: !!state.anonymous } : null }, error: state.authError }; },
      signOut: async () => { throw new Error("AI watcher must not sign out another account"); },
      onAuthStateChange: cb => { callback = cb; return { data: { subscription: { unsubscribe() { callback = null; } } } }; }
    },
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; }, order() { return query; }, in() { return query; },
        async single() { state.calls.push("profiles"); return state.profileWait ? state.profileWait.promise : { data: { role: state.role }, error: state.profileError }; },
        then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); }
      };
      return query;
    },
    functions: { invoke: async (name, options) => { state.calls.push({ name, body: options.body }); return state.reply ? state.reply(name, options) : state.response; } },
    rpc: async () => { state.calls.push("retrieval"); return state.retrievalWait ? state.retrievalWait.promise : { data: [], error: null }; }
  };
  return {
    state, host, client, timers, listeners,
    emit(event, user = state.user) { state.user = user; callback?.(event, session()); },
    async tick(delay) { for (const [id, timer] of [...timers]) if (timer.delay === delay) { if (!timer.interval) timers.delete(id); timer.f(); } await settle(); }
  };
}

test("AI guard validates Auth and current profiles without changing legacy guard behavior", async () => {
  const f = fixture(), changes = [];
  const session = guard.watchAdministrator(f.client, a => changes.push(a), f.host);
  const ticket = await session.start();
  assert.equal(ticket.userId, "admin-a");
  assert.deepEqual(f.state.calls, ["auth", "profiles"]);
  assert.equal(changes.at(-1).authorized, true);
  session.stop();
  assert.equal(f.timers.size, 0);
});

for (const problem of ["missing", "member", "anonymous", "expired", "sessionError", "authError", "profileError"]) {
  test(`AI guard fails closed: ${problem}`, async () => {
    const f = fixture(), changes = [];
    if (problem === "missing") f.state.user = null;
    else if (problem === "member") f.state.role = "member";
    else if (problem === "anonymous") f.state.anonymous = true;
    else if (problem === "expired") f.state.expires = 1;
    else f.state[problem] = new Error("SENSITIVE_AUTH_DETAIL");
    const session = guard.watchAdministrator(f.client, a => changes.push(a), f.host);
    assert.equal(await session.start(), null);
    assert.equal(changes.at(-1).authorized, false);
    assert.doesNotMatch(JSON.stringify(changes), /SENSITIVE_AUTH_DETAIL/);
  });
}

test("role revocation is re-read before commands, completion and on the bounded poll", async () => {
  for (const trigger of ["authorize", "confirm", "poll"]) {
    const f = fixture();
    const session = guard.watchAdministrator(f.client, () => {}, f.host);
    const ticket = await session.start();
    f.state.role = "member";
    if (trigger === "authorize") assert.equal(await session.authorize(), null);
    if (trigger === "confirm") assert.equal(await session.confirm(ticket), false);
    if (trigger === "poll") await f.tick(30000);
    assert.equal(session.isCurrent(ticket), false);
  }
});

test("Auth callback clears synchronously and defers Supabase calls outside the callback", async () => {
  const f = fixture(), changes = [];
  const session = guard.watchAdministrator(f.client, a => changes.push(a), f.host);
  const ticket = await session.start();
  const calls = f.state.calls.length;
  f.emit("SIGNED_OUT", null);
  assert.equal(changes.at(-1).authorized, false);
  assert.equal(session.isCurrent(ticket), false);
  assert.equal(f.state.calls.length, calls);
});

test("an authorization started for the previous account cannot reopen the page", async () => {
  const f = fixture();
  const session = guard.watchAdministrator(f.client, () => {}, f.host);
  await session.start();
  f.state.profileWait = deferred();
  const inFlight = session.authorize();
  await settle();
  f.emit("SIGNED_IN", "admin-b");
  f.state.profileWait.resolve({ data: { role: "admin" }, error: null });
  assert.equal(await inFlight, null);
  f.state.profileWait = null;
  const next = await session.authorize();
  assert.equal(next.userId, "admin-b");
});

test("token refresh for the same account preserves authorized results and tickets", async () => {
  const f = fixture();
  const session = guard.watchAdministrator(f.client, () => {}, f.host);
  const ticket = await session.start();
  f.emit("TOKEN_REFRESHED");
  await f.tick(0);
  assert.equal(session.isCurrent(ticket), true);
});

test("expiry/pagehide clear tickets; background return and bfcache re-read revoked roles", async () => {
  for (const event of ["expiry", "focus", "pageshow", "visibilitychange", "pagehide"]) {
    const f = fixture();
    const session = guard.watchAdministrator(f.client, () => {}, f.host);
    const ticket = await session.start();
    if (event === "expiry") {
      const timer = [...f.timers.values()].find(t => !t.interval && t.delay > 0);
      timer.f();
    } else {
      f.state.role = "member";
      f.listeners.get(event)();
      await f.tick(0);
    }
    assert.equal(session.isCurrent(ticket), false, event);
  }
});

// Small DOM double: run the actual controllers and guard, never call production.
function pageFixture(module) {
  const f = fixture(), nodes = new Map();
  class Element {
    constructor(id = "") { this.id = id; this.value = ""; this.hidden = false; this.disabled = false; this.events = new Map(); this.dataset = {}; this.html = ""; this.text = ""; }
    set innerHTML(value) { this.html = value; this.text = ""; for (const [, id] of value.matchAll(/id="([^"]+)"/g)) nodes.set(id, new Element(id)); for (const [, key] of value.matchAll(/\bdata-([\w-]+)/g)) nodes.set(`[data-${key}]`, new Element()); }
    get innerHTML() { return this.html; }
    set textContent(value) { this.text = value; this.html = ""; }
    get textContent() { return this.text; }
    addEventListener(name, fn) { this.events.set(name, fn); }
    async fire(name) { return this.events.get(name)?.({ preventDefault() {}, target: this }); }
    querySelector(selector) { return document.querySelector(selector); }
    querySelectorAll() { return []; }
    appendChild(node) { if (node.id) nodes.set(node.id, node); }
    insertBefore(node) { this.appendChild(node); }
    scrollIntoView() {}
    click() { return this.fire("click"); }
  }
  const htmlPath = { chef: "chef/index.html", planner: "planner/ai.html", hub: "ai/index.html", fermentation: "fermentation/fermentation-assistant.html" }[module];
  const html = fs.readFileSync(htmlPath, "utf8");
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) nodes.set(id, new Element(id));
  // Static hidden attributes matter to the page, independent of authentication.
  for (const [, id] of html.matchAll(/id="([^"]+)"[^>]*\bhidden/g)) nodes.get(id).hidden = true;
  const document = Object.assign(f.host.document, {
    querySelector(selector) { if (selector === ".head-actions") return new Element(); return nodes.get(selector.replace(/^#/, "")) || null; },
    querySelectorAll(selector) {
      if (selector === "[data-flour]:checked") return [];
      if (selector.includes("assistantWorkspace")) return [...nodes.values()].filter(n => !["status", "assistantAuthGate", "assistantWorkspace"].includes(n.id));
      return [];
    },
    createElement: () => new Element(), head: new Element()
  });
  const window = Object.assign(f.host, {
    cucinaHubSupabase: f.client, CucinaHubAuthGuard: guard, location: { href: "" },
    CucinaHubPlannerAiCore: {
      defaultPeriod: () => ({ period_start: "2026-10-23", period_end: "2026-10-23" }),
      validateRequest: x => ({ valid: true, normalized: x }),
      validateGeneratedResponse: () => ({ valid: true }), summarizePacket: () => ({ days: 1, meals: 1, items: 1, recipes: 0 })
    },
    CucinaHubFermentationAssistantContextEngine: {
      STYLE_LABELS: {}, GOAL_LABELS: {}, validate: () => ({ valid: true }), buildPrompt: () => "synthetic prompt",
      buildRequest: () => ({ readiness: { level: "ready", warnings: [] }, sources: [], retrieval_context: { library: { result_count: 0 } } })
    },
    CucinaHubFermentationLearningEngine: { analyze: () => ({ sample_count: 0, confidence: { label: "synthetic" } }) },
    CucinaHubFermentationAssistantResponseEngine: { buildTechnicalExample: () => ({}), parse: JSON.parse, validate: () => ({ valid: true, metrics: {}, errors: [], warnings: [] }) }
  });
  const context = vm.createContext({ window, document, console, Response, navigator: {}, Date, setTimeout: window.setTimeout, setInterval: window.setInterval, clearInterval: window.clearInterval });
  function run(path) { vm.runInContext(fs.readFileSync(path, "utf8"), context, { filename: path }); }
  return { ...f, nodes, window, run, html, context };
}

const modules = {
  chef: { script: "chef/chef.js", workspace: "workspace", gate: "authGate", command: "chefForm", event: "submit", output: "sourceList" },
  planner: { script: "planner/planner-ai.js", workspace: "plannerAiWorkspace", gate: "plannerAiAuthGate", command: "plannerAiForm", event: "submit", output: "plannerAiResult" },
  hub: { script: "ai/ai-hub.js", workspace: "aiWorkspace", gate: "aiAuthGate" },
  fermentation: { workspace: "assistantWorkspace", gate: "assistantAuthGate", command: "build", event: "click", output: "sources" }
};
async function loadPage(module, settings = {}) {
  const f = pageFixture(module), config = modules[module];
  Object.assign(f.state, settings);
  f.run("auth-guard.js");
  if (config.script) f.run(config.script);
  else {
    vm.runInContext(f.html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], f.context);
    await settle();
    f.run("fermentation/assistant-response-ui.js");
    await settle();
    f.run("fermentation/assistant-provider-ui.js");
  }
  await settle();
  return f;
}

for (const [module, config] of Object.entries(modules)) {
  test(`${module}: initial anonymous/non-admin pages do not open or issue AI requests`, async () => {
    for (const settings of [{ user: null }, { role: "member" }]) {
      const f = await loadPage(module, settings);
      assert.equal(f.nodes.get(config.workspace).hidden, true);
      assert.equal(f.nodes.get(config.gate).hidden, false);
      assert.equal(f.state.calls.some(c => typeof c === "object" || c === "retrieval"), false);
    }
  });
  test(`${module}: admin, logout in same/other tab, account change and private content cleanup`, async () => {
    for (const event of ["SIGNED_OUT", "SIGNED_IN", "TOKEN_REFRESHED"]) {
      const f = await loadPage(module);
      assert.equal(f.nodes.get(config.workspace).hidden, false);
      if (config.output) f.nodes.get(config.output).innerHTML = "SYNTHETIC_PRIVATE_CITATION";
      f.emit(event, event === "SIGNED_IN" ? "admin-b" : null);
      assert.equal(f.nodes.get(config.workspace).hidden, true);
      assert.equal(f.nodes.get(config.gate).hidden, false);
      if (config.output) assert.doesNotMatch(f.nodes.get(config.output).innerHTML, /SYNTHETIC_PRIVATE_CITATION/);
      if (config.command && event !== "SIGNED_IN") {
        await f.nodes.get(config.command).fire(config.event);
        assert.equal(f.state.calls.some(c => typeof c === "object" || c === "retrieval"), false);
      }
    }
  });
  test(`${module}: rejects missing, non-admin and Auth failure`, async () => {
    // The initial admin render must also be removed on the next verification.
    for (const reason of ["missing", "member", "authError"]) {
      const f = await loadPage(module);
      if (reason === "missing") f.state.user = null;
      else if (reason === "member") f.state.role = "member";
      else f.state.authError = new Error("PRIVATE_AUTH_ERROR");
      await f.tick(30000);
      assert.equal(f.nodes.get(config.workspace).hidden, true);
      assert.equal(f.nodes.get(config.gate).hidden, false);
    }
  });
}

const chefResult = { data: { response: { answer: "SYNTHETIC_ANSWER", evidence_mode: "sources" }, citations: [{ source_id: "s1", display_name: "SYNTHETIC_CITATION" }], guardrails: { automatic_writes: false, stored: false } }, error: null };
const plannerResult = { data: { packet: { menu: { title: "SYNTHETIC_MENU" } }, guardrails: {} }, error: null };

for (const module of ["chef", "planner", "fermentation"]) {
  test(`${module}: late result after logout/account change cannot restore previews or controls`, async () => {
    for (const nextUser of [null, "admin-b"]) {
      const f = await loadPage(module), config = modules[module], wait = deferred();
      f.state.reply = () => wait.promise;
      if (module === "chef") f.nodes.get("chefQuestion").value = "Domanda sintetica";
      if (module === "fermentation") f.state.retrievalWait = wait;
      const request = f.nodes.get(config.command).fire(config.event);
      await settle();
      f.emit(nextUser ? "SIGNED_IN" : "SIGNED_OUT", nextUser);
      if (nextUser) await f.tick(0);
      wait.resolve(module === "fermentation" ? { data: [], error: null } : module === "chef" ? chefResult : plannerResult);
      await request;
      assert.doesNotMatch(f.nodes.get(config.output).innerHTML, /SYNTHETIC_(ANSWER|CITATION|MENU)/);
      if (module === "fermentation") assert.equal(f.nodes.get("result").hidden, true);
      if (module === "planner") assert.equal(f.nodes.get("plannerAiStage").hidden, true);
      if (module === "chef") assert.equal(f.nodes.get("answerPanel").hidden, true);
    }
  });
}

test("Chef and Planner retain normal rendering/guardrails; Planner staging remains explicit", async () => {
  const chef = await loadPage("chef");
  chef.state.response = chefResult;
  chef.nodes.get("chefQuestion").value = "Domanda sintetica";
  await chef.nodes.get("chefForm").fire("submit");
  assert.equal(chef.nodes.get("answerPanel").hidden, false);
  assert.match(chef.nodes.get("sourceList").innerHTML, /SYNTHETIC_CITATION/);
  const planner = await loadPage("planner");
  planner.state.response = plannerResult;
  await planner.nodes.get("plannerAiForm").fire("submit");
  assert.match(planner.nodes.get("plannerAiResult").innerHTML, /SYNTHETIC_MENU/);
  assert.equal(planner.nodes.get("plannerAiStage").disabled, false);
  assert.equal(planner.state.calls.filter(c => c.name === "planner-menu-preview").length, 0);
  planner.state.role = "member";
  await planner.nodes.get("plannerAiStage").fire("click");
  assert.equal(planner.state.calls.filter(c => c.name === "planner-menu-preview").length, 0);
});

test("Edge 401/403 clears results; late error text after logout cannot repopulate status", async () => {
  for (const status of [401, 403]) {
    const f = await loadPage("chef");
    f.nodes.get("chefQuestion").value = "Domanda sintetica";
    f.state.response = { data: null, error: { context: new Response(JSON.stringify({ message: "SENSITIVE_DETAIL" }), { status }) } };
    await f.nodes.get("chefForm").fire("submit");
    assert.equal(f.nodes.get("workspace").hidden, true);
    assert.doesNotMatch(f.nodes.get("pageStatus").textContent, /SENSITIVE_DETAIL/);
  }
});

test("Fermentation provider health/generation and local validator refuse unauthenticated commands", async () => {
  const f = await loadPage("fermentation");
  f.emit("SIGNED_OUT", null);
  for (const id of ["checkAssistantProvider", "generateAssistantProposal", "loadTechnicalExample", "validateAssistantResponse", "copyPrompt", "copyPacket"]) {
    await f.nodes.get(id).fire("click");
  }
  assert.equal(f.state.calls.some(c => typeof c === "object"), false);
  assert.equal(f.nodes.get("assistantResponseJson").value, "");
});

test("Fermentation health and provider-not-configured handling preserve an authorized session", async () => {
  const f = await loadPage("fermentation");
  f.state.response = { data: { configured: false, provider: "openai", model: "synthetic-model" }, error: null };
  await f.nodes.get("checkAssistantProvider").fire("click");
  assert.match(f.nodes.get("assistantProviderStatus").textContent, /non è ancora configurata/);
  assert.equal(f.nodes.get("assistantWorkspace").hidden, false);
  f.nodes.get("packet").value = JSON.stringify({ task: { mode: "preview_only" }, sources: [] });
  f.state.response = { error: { context: new Response(JSON.stringify({ error: "provider_not_configured", message: "Provider non configurato." }), { status: 503 }) } };
  await f.nodes.get("generateAssistantProposal").fire("click");
  assert.match(f.nodes.get("assistantProviderStatus").textContent, /Provider non configurato/);
  assert.equal(f.nodes.get("assistantWorkspace").hidden, false);
});

test("Fermentation late provider health and generation responses cannot restore old private contents", async () => {
  for (const id of ["checkAssistantProvider", "generateAssistantProposal"]) {
    for (const nextUser of [null, "admin-b"]) {
      const f = await loadPage("fermentation"), wait = deferred();
      f.nodes.get("packet").value = JSON.stringify({ task: { mode: "preview_only" }, sources: [] });
      f.state.reply = () => wait.promise;
      const request = f.nodes.get(id).fire("click");
      await settle();
      f.emit(nextUser ? "SIGNED_IN" : "SIGNED_OUT", nextUser);
      if (nextUser) await f.tick(0);
      wait.resolve({ data: { configured: true, model: "OLD_MODEL", response: { answer: "OLD_PRIVATE_ANSWER" }, guardrails: { automatic_writes: false, requires_user_confirmation: true } }, error: null });
      await request;
      assert.equal(f.nodes.get("assistantResponseJson").value, "");
      assert.doesNotMatch(f.nodes.get("assistantProviderStatus").textContent, /Provider configurato|Proposta ricevuta/);
    }
  }
});

test("valid focus/token-refresh checks preserve drafts; revoked roles clear them", async () => {
  const f = await loadPage("chef");
  f.nodes.get("chefQuestion").value = "Bozza sintetica";
  f.listeners.get("focus")();
  await f.tick(0);
  assert.equal(f.nodes.get("chefQuestion").value, "Bozza sintetica");
  f.state.role = "member";
  f.listeners.get("focus")();
  await f.tick(0);
  assert.equal(f.nodes.get("chefQuestion").value, "");
});

test("Planner late staging completion never navigates after logout", async () => {
  const f = await loadPage("planner"), wait = deferred();
  f.state.response = plannerResult;
  await f.nodes.get("plannerAiForm").fire("submit");
  f.state.reply = () => wait.promise;
  const stage = f.nodes.get("plannerAiStage").fire("click");
  await settle();
  f.emit("SIGNED_OUT", null);
  wait.resolve({ data: { automatic_writes: false, preview_only: true, requires_user_confirmation: true }, error: null });
  await stage;
  assert.equal(f.window.location.href, "");
  assert.equal(f.nodes.get("plannerAiStage").hidden, true);
});
