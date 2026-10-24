"use strict";
(() => {
  const copy = value => JSON.parse(JSON.stringify(value));
  const IDS = { A: "00000000-0000-4000-8000-000000000001", B: "00000000-0000-4000-8000-000000000002" };
  const cleanState = input => ({ account: ["A", "B"].includes(input?.account) ? input.account : null,
    role: input?.role === "admin" ? "admin" : "member", authError: input?.authError === true,
    expires: Number.isFinite(input?.expires) ? input.expires : Math.floor(Date.now() / 1000) + 3600 });
  let initial = {};
  try { if (parent !== window && parent.location.origin === location.origin) initial = parent.__S02PreviewState; } catch {}
  let state = cleanState(initial), held = false, nextError = 0;
  const subscribers = new Set(), pending = [], calls = [], issues = [];
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("cucina-s02-synthetic-preview") : null;
  const session = () => state.account ? { user: { id: IDS[state.account], is_anonymous: false }, access_token: `SYNTHETIC_NOT_A_JWT_${state.account}`, expires_at: state.expires } : null;
  const marker = account => `S02_PRIVATE_${account || "NONE"}`;
  function report(type, details = {}) { if (parent !== window) parent.postMessage({ s02: true, type, ...details }, location.origin); }
  function apply(input, event) {
    state = cleanState(input);
    if (event) for (const callback of subscribers) callback(event, copy(session()));
    report("state", { account: state.account, role: state.role });
  }
  channel?.addEventListener("message", event => {
    if (event.data?.s02State) apply(event.data.state, event.data.event);
  });
  function denied() { issues.push("network_blocked"); report("network_blocked"); throw new Error("Preview: connessioni di rete applicative disabilitate."); }
  window.fetch = async () => denied();
  window.XMLHttpRequest = class { constructor() { denied(); } };
  window.WebSocket = class { constructor() { denied(); } };
  window.EventSource = class { constructor() { denied(); } };
  try { navigator.sendBeacon = () => { denied(); }; } catch {}
  window.open = () => { report("navigation_blocked"); return null; };
  document.addEventListener("click", event => {
    const link = event.target.closest?.("a");
    if (!link) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith("/app/")) { event.preventDefault(); event.stopImmediatePropagation(); report("navigation_blocked"); }
  }, true);
  window.addEventListener("error", () => { issues.push("script_error"); report("script_error"); }, true);
  window.addEventListener("unhandledrejection", () => { issues.push("unhandled_rejection"); report("script_error"); });
  document.addEventListener("securitypolicyviolation", () => { issues.push("csp_blocked"); report("network_blocked"); });
  function rows(table) {
    const label = marker(state.account);
    if (table === "fermentation_environment_profiles") return [{ id: "synthetic-env", name: `${label} Ambiente sintetico`, room_temperature_c: 22, relative_humidity_percent: 55, fridge_temperature_c: 4, is_default: true }];
    if (table === "flour_profiles") return [{ id: "synthetic-flour", brand: label, name: "Farina sintetica", flour_type: "0", strength_w: 280, protein_percent: 12, is_default: true }];
    return [];
  }
  function answer(name, body, account) {
    const label = marker(account);
    if (body?.action === "health") return { ok: true, configured: true, provider: "SIMULATED", model: "synthetic-no-provider", automatic_writes: false };
    if (name === "chef-assistant") return { response: { answer: `${label}: risposta simulata.`, evidence_mode: "sources", cautions: ["Solo collaudo"], assumptions: [] },
      citations: [{ source_id: "synthetic-source", display_name: `${label} Fonte sintetica`, heading: "Test", locator: "p. 1", usage: "Citazione simulata" }], retrieval: [{ source_id: "synthetic-source" }],
      provider: { model: "SIMULATED" }, usage: { input_tokens: 0, output_tokens: 0 }, guardrails: { automatic_writes: false, stored: false } };
    if (name === "planner-assistant") return { packet: { contract: "cucina-hub.menu-plan", version: 1,
      menu: { title: `${label} Menu sintetico`, external_id: "synthetic-menu", revision: 1, period_start: body.period_start, period_end: body.period_end, source: { type: "chatgpt_project", label: "Planner AI" } },
      days: [{ date: body.period_start, meals: [{ slot: "lunch", servings: 2, items: [{ type: "food", name: "Alimento sintetico", quantity: 100, unit: "g" }] }] }],
      guardrails: { preview_only: true, automatic_save: false, requires_user_confirmation: true } }, provenance: { recipe_catalog_count: 0, existing_meal_count: 0,
      rag_sources: [{ display_name: `${label} Fonte sintetica`, heading: "Test", locator: "p. 1" }] }, provider: { model: "SIMULATED" }, guardrails: { automatic_writes: false, stored: false, requires_preview: true } };
    if (name === "planner-menu-preview") return { automatic_writes: false, preview_only: true, requires_user_confirmation: true, simulated: true };
    if (name === "fermentation-assistant") {
      const engine = window.CucinaHubFermentationAssistantResponseEngine;
      if (!engine) throw new Error("Validatore originale non ancora disponibile.");
      const response = engine.buildTechnicalExample(body.packet);
      response.summary = `${label}: proposta sintetica, nessun provider chiamato.`;
      return { response, provider: { name: "SIMULATED", model: "synthetic-no-provider" }, usage: { input_tokens: 0, output_tokens: 0 }, guardrails: { automatic_writes: false, requires_user_confirmation: true } };
    }
    throw new Error("Funzione non prevista dal mock.");
  }
  const client = {
    auth: {
      async getSession() { return { data: { session: copy(session()) }, error: null }; },
      async getUser(jwt) {
        const valid = state.account && !state.authError && state.expires > Date.now() / 1000 && jwt === session().access_token;
        return { data: { user: valid ? copy(session().user) : null }, error: valid ? null : { status: 401, message: "Errore Auth sintetico" } };
      },
      onAuthStateChange(callback) {
        subscribers.add(callback);
        setTimeout(() => { if (subscribers.has(callback)) callback("INITIAL_SESSION", copy(session())); }, 0);
        return { data: { subscription: { unsubscribe: () => subscribers.delete(callback) } } };
      },
      async signOut() { apply({ account: null }, "SIGNED_OUT"); return { error: null }; }
    },
    from(table) {
      let id;
      const query = { select() { return query; }, eq(key, value) { if (key === "id") id = value; return query; }, order() { return query; }, in() { return query; },
        async single() { return { data: table === "profiles" && id === IDS[state.account] ? { role: state.role } : null, error: null }; },
        then(resolve, reject) { return Promise.resolve({ data: copy(rows(table)), error: null }).then(resolve, reject); } };
      return query;
    },
    async rpc(name) {
      if (name !== "search_rag_sources") throw new Error("RPC non prevista: scritture disabilitate.");
      calls.push("retrieval");
      return { data: [{ chunk_id: "synthetic-chunk", source_index_id: "synthetic-index", display_name: `${marker(state.account)} Biblioteca sintetica`, heading: "Test", locator: "p. 1", content: "Contenuto fittizio per il collaudo.", rank: 1 }], error: null };
    },
    functions: { async invoke(name, { body }) {
      const account = state.account;
      calls.push(name);
      report("invoke", { name });
      const errorStatus = nextError; nextError = 0;
      // Capture the ORIGINAL account and reply before holding, to test stale data.
      const response = errorStatus ? { data: null, error: { context: new Response(JSON.stringify({ message: "Rifiuto sintetico" }), { status: errorStatus }) } } : { data: answer(name, body, account), error: null };
      if (held) await new Promise(resolve => pending.push(resolve));
      return response;
    } }
  };
  window.supabase = { createClient: () => client };
  window.__S02Test = Object.freeze({
    apply,
    hold(value) { held = !!value; },
    release() { held = false; pending.splice(0).forEach(resolve => resolve()); },
    denyNext(status) { if ([401, 403].includes(status)) nextError = status; },
    snapshot: () => ({ account: state.account, role: state.role, pending: pending.length, calls: [...calls], issues: [...issues] })
  });
})();
