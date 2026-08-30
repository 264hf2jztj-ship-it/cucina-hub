"use strict";

(() => {
  const client = window.cucinaHubSupabase;
  const engine = window.CucinaHubFermentationLearningEngine;
  const core = window.CucinaHubLearningCore;
  const elements = {
    status: document.querySelector("#pageStatus"),
    gate: document.querySelector("#authGate"),
    workspace: document.querySelector("#learningWorkspace"),
    enabled: document.querySelector("#learningEnabled"),
    state: document.querySelector("#learningState"),
    action: document.querySelector("#learningAction"),
    sessions: document.querySelector("#learningSessions"),
    evaluated: document.querySelector("#learningEvaluated"),
    quality: document.querySelector("#learningQuality"),
    confidence: document.querySelector("#learningConfidence"),
    average: document.querySelector("#learningAverage"),
    insights: document.querySelector("#learningInsights"),
    sources: document.querySelector("#learningSources"),
    methodology: document.querySelector("#learningMethodology")
  };
  let user = null;
  let preference = null;
  let sessions = [];
  let evaluations = [];

  function escapeHtml(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setStatus(message, type = "") {
    elements.status.textContent = message;
    elements.status.className = `learning-page-status${type ? ` ${type}` : ""}`;
  }

  function stateCopy(status) {
    return {
      disabled: ["Learning disattivato", "Le sessioni restano salvate, ma non vengono prodotte analisi."],
      empty: ["Pronto per la prima prova", "Il Learning inizierà quando registrerai una sessione reale nel Laboratorio."],
      needs_evaluations: ["Mancano le valutazioni", "Le sessioni completate devono avere voto, esito e tempi reali per essere confrontate."],
      building: ["Storico in costruzione", "È disponibile una prima prova: aggiungine almeno un'altra per confrontare i risultati."],
      ready: ["Learning operativo", "I suggerimenti derivano esclusivamente dal tuo storico e mostrano sempre quantità e qualità dei dati."]
    }[status];
  }

  function renderAction(action) {
    if (action.kind === "enable") {
      elements.action.innerHTML = `<button id="enableLearningButton" class="button" type="button">${escapeHtml(action.label)}</button><small>${escapeHtml(action.description)}</small>`;
      document.querySelector("#enableLearningButton").addEventListener("click", () => savePreference(true));
      return;
    }
    elements.action.innerHTML = `<a class="button" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a><small>${escapeHtml(action.description)}</small>`;
  }

  function renderInsight(item) {
    return `<article class="learning-insight ${escapeHtml(item.kind || "data")}">
      <div><span>${escapeHtml(item.kind === "pattern" ? "Pattern osservato" : item.kind === "quality" ? "Qualità dei dati" : "Riepilogo")}</span><h3>${escapeHtml(item.title)}</h3></div>
      <p>${escapeHtml(item.text)}</p>
      <small>${escapeHtml(item.evidence_count || 0)} sessioni/dati · affidabilità ${escapeHtml(item.confidence || "insufficiente")}</small>
    </article>`;
  }

  function render() {
    const included = Object.fromEntries(evaluations
      .filter(item => item.include_in_learning !== false)
      .map(item => [item.session_id, item]));
    const analysis = engine.analyze({ sessions, evaluations: included });
    const model = core.summary({
      analysis,
      completedSessions: sessions.length,
      excludedEvaluations: evaluations.filter(item => item.include_in_learning === false).length,
      enabled: preference.enabled,
      minimumSessions: preference.minimum_sessions || 2
    });
    const [title, description] = stateCopy(model.status);

    elements.enabled.checked = preference.enabled;
    elements.state.innerHTML = `<span aria-hidden="true">${model.status === "ready" ? "🧠" : model.status === "disabled" ? "⏸️" : "🌱"}</span><div><p class="eyebrow">Stato personale</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div>`;
    renderAction(model.action);
    elements.sessions.textContent = model.completedSessions;
    elements.evaluated.textContent = model.evaluatedSessions;
    elements.quality.textContent = `${model.qualityScore}%`;
    elements.confidence.textContent = model.confidence.label;
    elements.confidence.dataset.level = model.confidence.level;
    elements.average.textContent = model.averageRating == null ? "—" : `${model.averageRating}/5`;
    elements.insights.innerHTML = preference.enabled && model.insights.length
      ? model.insights.map(renderInsight).join("")
      : `<div class="learning-empty"><span aria-hidden="true">${preference.enabled ? "📝" : "⏸️"}</span><strong>${preference.enabled ? "Nessun confronto disponibile" : "Analisi sospesa"}</strong><p>${preference.enabled ? "Registra e valuta prove reali: gli insight compariranno qui senza conclusioni inventate." : "Riattiva il Learning quando vuoi riprendere le analisi."}</p></div>`;
    elements.sources.innerHTML = `
      <article><span>Sessioni completate</span><strong>${model.completedSessions}</strong><small>Laboratorio Pizza e impasti</small></article>
      <article><span>Valutazioni incluse</span><strong>${model.evaluatedSessions}</strong><small>Usate per medie e confronti</small></article>
      <article><span>Valutazioni escluse</span><strong>${model.excludedEvaluations}</strong><small>Conservate, ma ignorate nei calcoli</small></article>`;
    elements.methodology.textContent = model.methodology;
    setStatus("Learning aggiornato dai tuoi dati personali.", "ok");
  }

  async function savePreference(enabled) {
    elements.enabled.disabled = true;
    setStatus(enabled ? "Riattivazione del Learning…" : "Disattivazione del Learning…");
    try {
      const now = new Date().toISOString();
      const payload = {
        owner_user_id: user.id,
        enabled,
        minimum_sessions: preference.minimum_sessions || 2,
        updated_at: now
      };
      const response = await client.from("fermentation_learning_preferences")
        .upsert(preference.persisted ? payload : { ...payload, created_at: now }, { onConflict: "owner_user_id" })
        .select("*").single();
      if (response.error) throw response.error;
      preference = { ...response.data, persisted: true };
      render();
    } catch (error) {
      elements.enabled.checked = preference.enabled;
      setStatus(error.message, "error");
    } finally {
      elements.enabled.disabled = false;
    }
  }

  async function load() {
    try {
      if (!client || !engine || !core) throw new Error("Il collegamento Learning non è disponibile.");
      const access = await window.CucinaHubAuthGuard.requireAdministrator(client);
      user = access.user;
      if (!access.authorized) {
        elements.gate.hidden = false;
        elements.workspace.hidden = true;
        setStatus("Accedi dalla Dashboard per usare il Learning.", "error");
        return;
      }

      const [preferenceResult, sessionResult] = await Promise.all([
        client.from("fermentation_learning_preferences").select("*").eq("owner_user_id", user.id).maybeSingle(),
        client.from("baking_sessions").select("*").eq("owner_user_id", user.id).eq("status", "completed").order("completed_at", { ascending: false, nullsFirst: false })
      ]);
      if (preferenceResult.error) throw preferenceResult.error;
      if (sessionResult.error) throw sessionResult.error;
      preference = preferenceResult.data
        ? { ...preferenceResult.data, persisted: true }
        : { owner_user_id: user.id, enabled: true, minimum_sessions: 2, persisted: false };
      sessions = sessionResult.data || [];
      evaluations = [];
      if (sessions.length) {
        const evaluationResult = await client.from("baking_session_evaluations").select("*")
          .eq("owner_user_id", user.id).in("session_id", sessions.map(item => item.id));
        if (evaluationResult.error) throw evaluationResult.error;
        evaluations = evaluationResult.data || [];
      }
      elements.gate.hidden = true;
      elements.workspace.hidden = false;
      render();
    } catch (error) {
      elements.gate.hidden = false;
      elements.workspace.hidden = true;
      setStatus(`${error.message} Verifica le migration 034 e 035.`, "error");
    }
  }

  elements.enabled.addEventListener("change", event => savePreference(event.target.checked));
  void load();
})();
