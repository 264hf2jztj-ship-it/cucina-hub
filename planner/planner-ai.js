"use strict";
(() => {
  const GENERATE_FUNCTION = "planner-assistant";
  const STAGE_FUNCTION = "planner-menu-preview";
  const core = window.CucinaHubPlannerAiCore;
  const client = window.cucinaHubSupabase;
  const $ = selector => document.querySelector(selector);
  const state = { packet: null, generation: null, busy: false, staging: false };

  const elements = {
    status: $("#plannerAiStatus"),
    authGate: $("#plannerAiAuthGate"),
    workspace: $("#plannerAiWorkspace"),
    form: $("#plannerAiForm"),
    prompt: $("#plannerAiPrompt"),
    start: $("#plannerAiStart"),
    end: $("#plannerAiEnd"),
    servings: $("#plannerAiServings"),
    generate: $("#plannerAiGenerate"),
    result: $("#plannerAiResult"),
    stage: $("#plannerAiStage"),
    reset: $("#plannerAiReset")
  };

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[char]);
  }

  function setStatus(message, kind = "") {
    elements.status.textContent = message;
    elements.status.className = `planner-ai-status${kind ? ` ${kind}` : ""}`;
  }

  function setBusy(busy) {
    state.busy = busy;
    elements.generate.disabled = busy || state.staging;
    elements.stage.disabled = busy || state.staging || !state.packet;
    elements.reset.disabled = busy || state.staging;
    for (const input of [elements.prompt,elements.start,elements.end,elements.servings]) {
      input.disabled = busy || state.staging;
    }
  }

  async function functionErrorMessage(error, fallback) {
    const response = error?.context;
    if (response instanceof Response) {
      try {
        const body = await response.clone().json();
        if (body?.message) return body.message;
      } catch {}
    }
    return error?.message || fallback;
  }

  function formatSources(data) {
    const sources = Array.isArray(data?.provenance?.rag_sources) ? data.provenance.rag_sources : [];
    if (!sources.length) return '<p class="planner-ai-muted">Nessun frammento RAG pertinente usato come contesto aggiuntivo.</p>';
    return `<ul class="planner-ai-source-list">${sources.map(source => `
      <li><strong>${esc(source.display_name || "Fonte privata")}</strong>${source.heading ? ` · ${esc(source.heading)}` : ""}${source.locator ? ` · ${esc(source.locator)}` : ""}</li>`
    ).join("")}</ul>`;
  }

  function renderGeneration(data) {
    const packet = data.packet;
    const summary = core.summarizePacket(packet);
    const menu = packet.menu || {};
    const recipeCount = Number(data?.provenance?.recipe_catalog_count || 0);
    const existingCount = Number(data?.provenance?.existing_meal_count || 0);
    const model = data?.provider?.model || "—";
    elements.result.innerHTML = `
      <div class="planner-ai-result-head">
        <div>
          <p class="eyebrow">Proposta generata</p>
          <h2>${esc(menu.title || "Menu Planner AI")}</h2>
          <p>${esc(menu.period_start || "—")} – ${esc(menu.period_end || "—")}</p>
        </div>
        <span class="planner-ai-badge">SOLO ANTEPRIMA</span>
      </div>
      <div class="planner-ai-stats">
        <div><span>Giorni</span><strong>${summary.days}</strong></div>
        <div><span>Pasti</span><strong>${summary.meals}</strong></div>
        <div><span>Elementi</span><strong>${summary.items}</strong></div>
        <div><span>Ricette Biblioteca</span><strong>${summary.recipes}</strong></div>
      </div>
      <section class="planner-ai-context" aria-label="Provenienza della proposta">
        <h3>Contesto consultato</h3>
        <p>Catalogo personale: <strong>${recipeCount}</strong> ricette disponibili · pasti già presenti nel periodo: <strong>${existingCount}</strong>.</p>
        ${formatSources(data)}
        <p class="planner-ai-muted">Provider: ${esc(model)}. La generazione non ha scritto dati nel Planner.</p>
      </section>
      <div class="planner-ai-next">
        <strong>Passaggio successivo</strong>
        <span>Invia la proposta alle Anteprime ricevute. Da lì restano obbligatori resolver, conflitti e conferma finale.</span>
      </div>`;
    elements.stage.hidden = false;
    elements.stage.disabled = false;
  }

  async function generateMenu(request) {
    const { data, error } = await client.functions.invoke(GENERATE_FUNCTION, { body: request });
    if (error) throw new Error(await functionErrorMessage(error, "Generazione Planner AI non riuscita."));
    const safety = core.validateGeneratedResponse(data);
    if (!safety.valid) throw new Error(safety.message);
    return data;
  }

  async function stagePreview(packet) {
    const { data, error } = await client.functions.invoke(STAGE_FUNCTION, { body: { packet } });
    if (error) throw new Error(await functionErrorMessage(error, "Invio all’anteprima Planner non riuscito."));
    if (data?.automatic_writes !== false || data?.preview_only !== true || data?.requires_user_confirmation !== true) {
      throw new Error("L’endpoint di staging non ha confermato i guardrail richiesti.");
    }
    return data;
  }

  function resetGeneration() {
    state.packet = null;
    state.generation = null;
    elements.result.innerHTML = `
      <div class="planner-ai-empty">
        <strong>Nessuna proposta generata.</strong>
        <span>Planner AI può preparare un pacchetto, ma non può attivarlo o salvare pasti automaticamente.</span>
      </div>`;
    elements.stage.hidden = true;
    setStatus("Pronto. La generazione resta separata dal salvataggio.", "ok");
    setBusy(false);
  }

  async function initialize() {
    if (!core) {
      setStatus("Motore Planner AI non disponibile. Ricarica la pagina.", "error");
      return;
    }
    if (!client) {
      setStatus(window.cucinaHubSupabaseError?.message || "Supabase non inizializzato.", "error");
      return;
    }
    const { data, error } = await client.auth.getSession();
    if (error) {
      setStatus(error.message, "error");
      return;
    }
    if (!data.session?.user) {
      elements.authGate.hidden = false;
      setStatus("Accedi a Cucina Hub prima di usare Planner AI.", "error");
      return;
    }

    const period = core.defaultPeriod();
    elements.start.value = period.period_start;
    elements.end.value = period.period_end;
    elements.workspace.hidden = false;
    resetGeneration();

    elements.form.addEventListener("submit", async event => {
      event.preventDefault();
      if (state.busy || state.staging) return;
      const validation = core.validateRequest({
        prompt: elements.prompt.value,
        period_start: elements.start.value,
        period_end: elements.end.value,
        servings: elements.servings.value
      });
      if (!validation.valid) {
        setStatus(validation.errors[0], "warning");
        return;
      }
      state.packet = null;
      elements.stage.hidden = true;
      setBusy(true);
      setStatus("Consulto Biblioteca e contesto privato, poi preparo la proposta…", "working");
      try {
        const generation = await generateMenu(validation.normalized);
        state.packet = generation.packet;
        state.generation = generation;
        renderGeneration(generation);
        setStatus("Proposta pronta. Nessun dato salvato: puoi inviarla all’anteprima del Planner.", "ok");
      } catch (error) {
        elements.result.innerHTML = `<div class="planner-ai-empty error"><strong>Generazione non completata.</strong><span>${esc(error.message)}</span></div>`;
        setStatus(error.message, "error");
      } finally {
        setBusy(false);
      }
    });

    elements.stage.addEventListener("click", async () => {
      if (!state.packet || state.busy || state.staging) return;
      state.staging = true;
      setBusy(true);
      setStatus("Creo soltanto la richiesta di anteprima personale…", "working");
      try {
        await stagePreview(state.packet);
        setStatus("Anteprima ricevuta. Apro il Menu Package per il controllo finale.", "ok");
        window.location.href = "workspace.html?v=14&section=menu-package";
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        state.staging = false;
        setBusy(false);
      }
    });

    elements.reset.addEventListener("click", resetGeneration);
  }

  void initialize();
})();
