"use strict";
(async () => {
  const $ = id => document.getElementById(id);
  const frame = $("app"), moduleSelect = $("module");
  const modules = {
    hub: { path: "ai/index.html", workspace: "aiWorkspace", gate: "aiAuthGate" },
    chef: { path: "chef/index.html", workspace: "workspace", gate: "authGate", button: "askChef", form: "chefForm" },
    planner: { path: "planner/ai.html", workspace: "plannerAiWorkspace", gate: "plannerAiAuthGate", button: "plannerAiGenerate", form: "plannerAiForm" },
    fermentation: { path: "fermentation/fermentation-assistant.html", workspace: "assistantWorkspace", gate: "assistantAuthGate", button: "build" }
  };
  const cases = {
    missing: "Accesso iniziale senza sessione", admin: "Amministratore autorizzato", member: "Utente non amministratore",
    normal: "Normale utilizzo e guardrail", logout: "Logout stessa scheda e pulizia", cross: "Logout seconda scheda (trasporto mock)",
    account: "Cambio account e pulizia", expiry: "Scadenza sessione", invalid: "Auth non verificabile",
    lateLogout: "Risposta tardiva dopo logout", lateAccount: "Risposta tardiva account precedente", denied: "Errore AI 401/403 e pulizia",
    revoked: "Ruolo revocato senza evento Auth (poll)", commands: "Comandi bloccati senza accesso", scripts: "Caricamento script originali",
    background: "Background reale e ritorno", history: "Navigazione e indietro/avanti", cache: "Cache v57 su Safari dopo distribuzione",
    menu: "Menu Package / Piano Alimentare completi"
  };
  const results = Object.fromEntries(Object.keys(modules).map(m => [m, Object.fromEntries(Object.keys(cases).map(c => [c, { status: "NOT TESTED", note: "Non eseguito", services: "SIMULATED" }]))]));
  const baseState = (account = "A", role = "admin") => ({ account, role, authError: false, expires: Math.floor(Date.now() / 1000) + 3600 });
  const stateAllowed = state => !!state.account && state.role === "admin" && !state.authError && state.expires > Date.now() / 1000;
  window.__S02PreviewState = baseState(null);
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("cucina-s02-synthetic-preview") : null;
  const remote = new URLSearchParams(location.search).get("remote") === "1";
  let meta, busy = false, sequence = 0, selectedModule = "hub", crossSeen = false, bgHidden = false, bgReturned = false, backgroundArmed = false;
  let navigations = [], historyActions = { back: 0, forward: 0 }, probeErrors = 0;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const doc = () => frame.contentDocument;
  const api = () => frame.contentWindow?.__S02Test;
  const element = id => doc()?.getElementById(id);
  function message(text) { $("status").textContent = text; }
  function record(id, status, note, module = selectedModule) {
    results[module][id] = { status, note, services: "SIMULATED", at: new Date().toISOString() };
    render();
  }
  function render() {
    $("matrix").replaceChildren(...Object.entries(cases).map(([id, label]) => {
      const row = document.createElement("tr"), result = results[selectedModule][id];
      for (const text of [label, result.status, result.note]) { const cell = document.createElement("td"); cell.textContent = text; row.append(cell); }
      row.className = result.status === "PASS" ? "pass" : result.status === "FAIL" ? "fail" : "";
      return row;
    }));
  }
  async function until(predicate, timeout = 6000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { try { if (predicate()) return; } catch {} await sleep(60); }
    throw new Error("Condizione DOM non raggiunta entro il timeout.");
  }
  function setState(state, event, broadcast = true) {
    window.__S02PreviewState = { ...state };
    if (channel && broadcast) channel.postMessage({ s02State: true, state, event });
    else if (!remote) api()?.apply(state, event);
  }
  channel?.addEventListener("message", event => {
    if (event.data?.s02RequestState && !remote) {
      channel.postMessage({ s02State: true, state: window.__S02PreviewState, event: null });
      return;
    }
    if (!event.data?.s02State) return;
    window.__S02PreviewState = { ...event.data.state };
    if (!remote && event.data.event === "SIGNED_OUT") crossSeen = true;
  });
  function payloadText() {
    return (doc()?.body?.textContent || "") + [...(doc()?.querySelectorAll("input,textarea,select") || [])].map(n => n.value).join(" ");
  }
  function noPrivate(account) { return !payloadText().includes(`S02_PRIVATE_${account}`); }
  function denied() {
    const config = modules[selectedModule];
    return element(config.workspace)?.hidden === true && element(config.gate)?.hidden === false && noPrivate("A") && noPrivate("B");
  }
  function allowed() { return element(modules[selectedModule].workspace)?.hidden === false; }
  function assert(value, note) { if (!value) throw new Error(note); }
  async function open(state = window.__S02PreviewState) {
    setState(state, null);
    frame.hidden = false;
    frame.src = `/app/${modules[selectedModule].path}?s02Run=${++sequence}`;
    await until(() => api() && doc().readyState === "complete" && frame.contentWindow.location.pathname === `/app/${modules[selectedModule].path}`);
    await until(() => stateAllowed(state) ? allowed() : denied());
    if (selectedModule === "fermentation" && state.account && state.role === "admin") await until(() => element("status").textContent.includes("Dati personali caricati"));
  }
  function submit() {
    const config = modules[selectedModule];
    if (config.form) element(config.form).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    else element(config.button)?.click();
  }
  async function generate({ waitForResult = true } = {}) {
    if (selectedModule === "hub") return;
    if (selectedModule === "chef") element("chefQuestion").value = "Domanda sintetica di collaudo";
    if (selectedModule === "planner") element("plannerAiPrompt").value = "Menu sintetico di collaudo";
    if (selectedModule === "fermentation") {
      element("build").click();
      await until(() => !element("result").hidden && element("packet").value);
      await until(() => element("generateAssistantProposal") && frame.contentWindow.CucinaHubFermentationAssistantResponseEngine);
      element("generateAssistantProposal").click();
    } else submit();
    if (waitForResult) await until(() => {
      if (selectedModule === "chef") return !element("answerPanel").hidden;
      if (selectedModule === "planner") return !element("plannerAiStage").hidden && !element("plannerAiStage").disabled;
      return element("assistantResponseJson").value.includes("S02_PRIVATE_");
    });
  }
  function prepareManualState(kind) {
    const current = window.__S02PreviewState;
    if (kind === "none") setState(baseState(null), "SIGNED_OUT");
    if (kind === "admin") setState(baseState(), "SIGNED_IN");
    if (kind === "member") setState(baseState("A", "member"), "SIGNED_IN");
    if (kind === "switch") setState(baseState("B"), "SIGNED_IN");
    if (kind === "revoke") setState({ ...current, role: "member" }, null);
    if (kind === "invalid") setState({ ...current, authError: true }, "USER_UPDATED");
    if (kind === "expire") setState({ ...current, expires: Math.floor(Date.now() / 1000) + 3 }, "TOKEN_REFRESHED");
    message(`Stato sintetico aggiornato: ${kind}. Revoca senza evento: attendi fino a 35 secondi o usa un comando protetto.`);
  }
  for (const button of document.querySelectorAll("[data-auth]")) button.addEventListener("click", () => prepareManualState(button.dataset.auth));
  async function run() {
    if (busy) return;
    busy = true; $("run").disabled = true; moduleSelect.disabled = true;
    // Prevent manual commands or navigation from altering a running scenario.
    const controls = [...$("controls").querySelectorAll("button,a")];
    controls.forEach(n => { if (n.tagName === "BUTTON") n.disabled = true; else n.style.pointerEvents = "none"; });
    const scenario = async (id, fn) => {
      message(`${selectedModule}: ${cases[id]}…`);
      try { await fn(); record(id, "PASS", "Verifica eseguita nel DOM di questo browser; servizi simulati."); }
      catch (error) { record(id, "FAIL", error.message); }
    };
    try {
      await scenario("missing", async () => { await open(baseState(null)); assert(denied(), "Workspace o dati residui senza sessione."); });
      await scenario("admin", async () => { await open(baseState()); assert(allowed(), "Admin non ammesso."); });
      await scenario("scripts", async () => {
        assert(api().snapshot().issues.length === 0, "Errore script/CSP: consultare la preview.");
        assert([...doc().scripts].every(s => !s.src || new URL(s.src).origin === location.origin), "Script esterno rilevato.");
        assert(frame.contentWindow.CucinaHubAuthGuard?.VERSION === 2 && allowed(), "Guard o controller non avviato.");
      });
      await scenario("member", async () => { await open(baseState("A", "member")); assert(denied(), "Non admin ammesso."); });
      await scenario("normal", async () => {
        await open(baseState()); await generate(); assert(allowed(), "Sessione admin persa.");
        if (selectedModule !== "hub") assert(payloadText().includes("S02_PRIVATE_A"), "Risposta sintetica non visualizzata.");
        if (selectedModule === "planner") assert(!api().snapshot().calls.includes("planner-menu-preview"), "Staging avviato senza conferma.");
      });
      await scenario("logout", async () => { setState(baseState(null), "SIGNED_OUT"); await until(denied); });
      await scenario("commands", async () => {
        const before = api().snapshot().calls.length;
        if (selectedModule !== "hub") submit();
        else element("aiWorkspace").querySelector("a")?.click();
        await sleep(350);
        assert(denied() && api().snapshot().calls.length === before, "Comando ha raggiunto servizi mock dopo logout.");
      });
      await scenario("account", async () => {
        await open(baseState()); await generate(); setState(baseState("B"), "SIGNED_IN");
        await until(() => allowed() && api().snapshot().account === "B" && noPrivate("A"));
        if (selectedModule === "chef") assert(element("answerPanel").hidden, "Risposta precedente ancora aperta.");
        if (selectedModule === "planner") assert(element("plannerAiStage").hidden, "Preview precedente ancora disponibile.");
      });
      await scenario("expiry", async () => { await open(baseState()); setState({ ...baseState(), expires: Math.floor(Date.now() / 1000) + 3 }, "TOKEN_REFRESHED"); await until(denied, 6000); });
      await scenario("invalid", async () => { await open(baseState()); setState({ ...baseState(), authError: true }, "USER_UPDATED"); await until(denied); });
      if (selectedModule === "hub") {
        for (const id of ["lateLogout", "lateAccount", "denied"]) record(id, "NOT TESTED", "Non applicabile: AI Hub non genera risposte né invoca provider.");
      } else {
        for (const [id, next] of [["lateLogout", null], ["lateAccount", "B"]]) await scenario(id, async () => {
          await open(baseState()); api().hold(true); await generate({ waitForResult: false });
          await until(() => api().snapshot().pending > 0);
          setState(baseState(next), next ? "SIGNED_IN" : "SIGNED_OUT");
          await until(() => api().snapshot().account === next && noPrivate("A") && (next ? allowed() : denied()));
          api().release(); await sleep(700);
          assert(noPrivate("A"), "Risposta tardiva dell'account precedente ripristinata nel DOM.");
          if (!next) assert(denied(), "Risposta tardiva ha riaperto il workspace.");
          if (selectedModule === "chef") assert(element("answerPanel").hidden, "Risposta tardiva visibile.");
          if (selectedModule === "planner") assert(element("plannerAiStage").hidden, "Staging riaperto da risposta tardiva.");
          if (selectedModule === "fermentation") assert(!element("assistantResponseJson").value, "JSON tardivo ripristinato.");
        });
        await scenario("denied", async () => {
          for (const status of [401, 403]) {
            await open(baseState()); await generate(); api().denyNext(status);
            await generate({ waitForResult: false }); await until(denied);
          }
        });
      }
      await scenario("revoked", async () => {
        await open(baseState()); await generate(); setState({ ...baseState(), role: "member" }, null);
        await until(denied, 35000);
      });
      message("Scenari guidati terminati. Completa seconda scheda, background, cronologia e controlli visivi; poi copia il report.");
    } finally {
      busy = false; moduleSelect.disabled = false;
      controls.forEach(n => { if (n.tagName === "BUTTON") n.disabled = false; else n.style.pointerEvents = ""; });
    }
  }
  moduleSelect.addEventListener("change", () => { selectedModule = moduleSelect.value; bgHidden = bgReturned = backgroundArmed = crossSeen = false; navigations = []; historyActions = { back: 0, forward: 0 }; render(); });
  $("open").onclick = () => open().catch(() => message("Caricamento non riuscito. Controlla il report e non usare account reali."));
  $("run").onclick = () => run().catch(() => { busy = false; message("Sequenza interrotta. I casi non eseguiti restano NOT TESTED."); });
  $("generate").onclick = () => generate().catch(() => message("Generazione mock non completata; controlla la sessione sintetica e lo stato della pagina."));
  $("hold").onclick = () => { api()?.hold(true); message("Le prossime risposte AI saranno trattenute fino a Rilascia."); };
  $("release").onclick = () => api()?.release();
  $("deny401").onclick = () => api()?.denyNext(401);
  $("deny403").onclick = () => api()?.denyNext(403);
  $("snapshot").onclick = () => message(`DOM: accesso ${allowed() ? "visibile" : "bloccato"}; marker A ${noPrivate("A") ? "assente" : "presente"}; marker B ${noPrivate("B") ? "assente" : "presente"}. Nessun risultato dei test aggiornato automaticamente da questo riepilogo.`);
  for (const [id, direction] of [["back", "back"], ["forward", "forward"]]) $(id).onclick = () => { ++historyActions[direction]; frame.contentWindow.history[direction](); };
  frame.addEventListener("load", () => { try { navigations.push(frame.contentWindow.location.pathname); } catch {} });
  $("backgroundStart").onclick = async () => { await open(baseState()); await generate(); bgHidden = bgReturned = false; backgroundArmed = true; message("Passa a un'altra app, poi torna qui e premi Verifica ritorno. Non simuliamo questo evento con JavaScript."); };
  document.addEventListener("visibilitychange", event => {
    if (!event.isTrusted || !backgroundArmed) return;
    if (document.visibilityState === "hidden") bgHidden = true;
    else if (bgHidden) bgReturned = true;
  });
  $("backgroundVerify").onclick = async () => {
    if (!bgHidden || !bgReturned) return record("background", "NOT TESTED", "Manca un ciclo background/ritorno reale osservato dal browser.");
    await sleep(1000);
    const expected = window.__S02PreviewState;
    record("background", (stateAllowed(expected) ? allowed() : denied()) ? "PASS" : "FAIL", "Ciclo visibilitychange reale e verifica DOM dopo ritorno; Auth simulata.");
  };
  $("crossVerify").onclick = async () => {
    if (!channel || !crossSeen) return record("cross", "NOT TESTED", "Nessun logout ricevuto tramite BroadcastChannel dalla seconda scheda.");
    await sleep(500); record("cross", denied() ? "PASS" : "FAIL", "Logout inviato da seconda scheda, evento Auth mock e controllo DOM; non prova del SDK Supabase reale.");
  };
  $("historyVerify").onclick = () => {
    const distinct = new Set(navigations.filter(n => Object.values(modules).some(m => n === `/app/${m.path}`)));
    if (distinct.size < 2 || navigations.length < 4 || !historyActions.back || !historyActions.forward) return record("history", "NOT TESTED", "Visita almeno due pagine reali tramite i loro link e usa entrambi Indietro/Avanti.");
    const expected = window.__S02PreviewState;
    // Detect the actual current module when navigating through real app links.
    const current = Object.entries(modules).find(([, m]) => `/app/${m.path}` === frame.contentWindow.location.pathname);
    if (!current) return record("history", "NOT TESTED", "Destinazione non inclusa nei quattro moduli.");
    const config = current[1], visible = doc().getElementById(config.workspace)?.hidden === false;
    const shouldAllow = stateAllowed(expected);
    record("history", visible === !!shouldAllow && (expected.account !== "B" || noPrivate("A")) && (expected.account || (noPrivate("A") && noPrivate("B"))) ? "PASS" : "FAIL", "Navigazioni e comandi cronologia osservati; verificare visivamente anche assenza di flash di dati.");
  };
  window.addEventListener("message", event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || !event.data?.s02) return;
    if (["network_blocked", "script_error"].includes(event.data.type)) { ++probeErrors; message("La preview ha rilevato un errore script o un tentativo di rete bloccato. Non dichiarare PASS senza analisi."); }
  });
  $("export").onclick = () => {
    $("report").value = JSON.stringify({ schema: "cucina-hub.s02-safari-preview", version: 1, at: new Date().toISOString(), commit: meta.commit,
      applicationBaseline: meta.applicationBaseline, applicationHashes: meta.applicationHashes, services: "SIMULATED", execution: "USER_BROWSER",
      S01: "PARTIALLY VERIFIED", S02: "NOT DISTRIBUTED", release: "OPEN", runtimeErrorsObserved: probeErrors, results,
      cacheNote: "Configurazione Git v57; cache Safari dopo distribuzione NOT TESTED. Service worker disabilitati nella preview." }, null, 2);
  };
  try {
    const response = await fetch("/__test/meta.json", { cache: "no-store" });
    meta = await response.json();
    assert(response.ok && meta.simulatedServices === true && /^[a-f0-9]{40}$/.test(meta.commit), "Server isolato non riconosciuto.");
    if (navigator.serviceWorker?.controller || (navigator.serviceWorker && (await navigator.serviceWorker.getRegistrations()).length)) throw new Error("Service worker già presente su questa origine. Usare una preview pulita; test non avviati.");
    $("source").textContent = `Commit servito: ${meta.commit}. Baseline app: ${meta.applicationBaseline}. Configurazione cache Git: ${meta.cacheName}.`;
    $("controls").hidden = remote; $("remote").hidden = !remote; $("export").disabled = false;
    if (!remote) message("Preview isolata pronta. Tutti i risultati sono NOT TESTED: scegli un modulo e avvia gli scenari.");
    else {
      channel?.postMessage({ s02RequestState: true });
      message(channel ? "Seconda scheda pronta, con servizi simulati." : "BroadcastChannel non disponibile: prova fra schede NOT TESTED.");
    }
  } catch (error) { message(`STOP: ${error.message}. Nessun test avviato.`); }
  render();
})();
