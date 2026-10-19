"use strict";
(() => {
  const client = window.cucinaHubSupabase;
  const core = window.CucinaHubWeberLearning;
  const $ = selector => document.querySelector(selector);
  const state = { owner: null, rows: [], request: 0 };
  const esc = (value = "") => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  const fmt = value => value === null ? "—" : value.toLocaleString("it-IT", { maximumFractionDigits: 2 });
  const date = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleDateString("it-IT") : "Data non registrata";
  function status(message, error = false) {
    $("#weberLearningStatus").textContent = message;
    $("#weberLearningStatus").className = `weber-page-status${error ? " error" : ""}`;
  }
  function render() {
    const model = core.analyze(state.rows, { recipe: $("#learningRecipe").value, method: $("#learningMethod").value, fuel: $("#learningFuel").value });
    $("#learningTotal").textContent = model.total;
    $("#learningCompleted").textContent = model.completed;
    $("#learningRated").textContent = model.rated;
    $("#learningUnrated").textContent = model.completed - model.rated;
    $("#learningAverage").textContent = fmt(model.average);
    $("#learningSummary").textContent = `${model.rated} valutazioni su ${model.completed} prove concluse. ${model.other} prove pianificate, in corso o annullate escluse dai calcoli. ${model.total ? "" : "Nessuna prova corrisponde ai filtri."}`;
    $("#learningGroups").innerHTML = model.groups.map(group => {
      const best = group.best[0];
      const pairLink = group.pair ? `<a class="button secondary" href="compare.html?v=2&amp;a=${encodeURIComponent(group.pair[1])}&amp;b=${encodeURIComponent(group.pair[0])}">CONFRONTA LE ULTIME DUE PROVE</a>` : `<p class="muted">Per un confronto di gruppo servono due prove concluse con la stessa ricetta collegata, metodo e combustibile.</p>`;
      return `<article class="learning-group"><h3>${esc(group.recipe)}</h3><p>${esc(group.method)} · ${esc(group.fuel)}</p><p>${group.sessions.length} prove concluse · ${group.rated} con voto · ${group.sessions.length - group.rated} senza voto<br>Voto medio: <strong>${fmt(group.average)}${group.average === null ? "" : " / 5"}</strong></p>${group.rated === 1 ? '<p class="learning-sample-note">Una sola valutazione: prima osservazione.</p>' : ""}${best ? `<div class="learning-best"><strong>Voto più alto osservato: ${group.highest} / 5 · ${group.best.length} ${group.best.length === 1 ? "prova" : "prove a pari voto"}</strong><p>${esc(best.title)} · ${esc(date(best.cooked_at))}${group.best.length > 1 ? " (la più recente a pari voto)" : ""}</p><p>${esc(core.setupLabel(best))}</p><a href="photos.html?session=${encodeURIComponent(best.id)}">Foto di questa prova →</a></div>` : '<p>Nessuna valutazione registrata in questo gruppo.</p>'}${pairLink}</article>`;
    }).join("") || '<p>Nessuna prova conclusa da analizzare. Registra una cottura nel diario e aggiungi il risultato.</p>';
    $("#learningGaps").innerHTML = model.gaps.map(gap => `<li>${esc(gap.label)}: <strong>${gap.count}</strong> su ${model.completed} prove concluse</li>`).join("");
    $("#learningIncomplete").innerHTML = model.incomplete.slice(0, 10).map(row => `<p class="learning-incomplete"><strong>${esc(row.title)}</strong> · ${esc(date(row.cooked_at))}<br>Da registrare: ${esc(row.missing.join(", "))}.</p>`).join("") + (model.incomplete.length > 10 ? `<p>Mostrate le 10 prove più recenti con dati mancanti su ${model.incomplete.length}. Usa i filtri per restringere lo storico.</p>` : model.completed && !model.incomplete.length ? "<p>Tutte le prove concluse selezionate hanno i dati elencati.</p>" : "");
    $("#weberLearningResults").hidden = false;
  }
  async function load() {
    const token = ++state.request;
    $("#weberLearningResults").hidden = true;
    $("#learningScope").textContent = "";
    state.rows = [];
    $("#reloadLearning").disabled = true;
    status("Caricamento dello storico Weber…");
    try {
      const result = await client.from("weber_cook_sessions")
        .select("id,title,cooked_at,status,recipe_id,cooking_method,fuel_type,fuel_amount,fuel_unit,vent_bottom_percent,vent_top_percent,target_grate_temp_c,peak_grate_temp_c,duration_minutes,rating,result_notes,recipe:recipes(id,code,title)", { count: "exact" })
        .eq("owner_user_id", state.owner).order("cooked_at", { ascending: false }).order("id").limit(500);
      if (token !== state.request) return;
      if (result.error) throw result.error;
      state.rows = result.data || [];
      const recipes = new Map(state.rows.map(row => [row.recipe_id || core.NONE, core.recipeLabel(row)]));
      const previous = $("#learningRecipe").value;
      $("#learningRecipe").innerHTML = '<option value="">Tutte</option>' + [...recipes].sort((a, b) => a[1].localeCompare(b[1], "it")).map(([id, label]) => `<option value="${esc(id)}">${esc(label)}</option>`).join("");
      $("#learningRecipe").value = recipes.has(previous) ? previous : "";
      $("#learningScope").textContent = `Storico disponibile: ${result.count ?? state.rows.length} prove. Analisi sulle ${state.rows.length} più recenti per data di cottura (massimo 500); i filtri si applicano a queste prove.`;
      render();
      status(state.rows.length ? "Learning Weber aggiornato." : "Il tuo storico Weber è vuoto. Inizia dal Diario Weber.");
    } catch {
      if (token === state.request) status("Impossibile caricare lo storico Weber. Premi Aggiorna storico per riprovare.", true);
    } finally { if (token === state.request) $("#reloadLearning").disabled = false; }
  }
  for (const selector of ["#learningRecipe", "#learningMethod", "#learningFuel"]) $(selector).onchange = () => { if (state.rows.length) render(); };
  $("#resetLearningFilters").onclick = () => {
    for (const selector of ["#learningRecipe", "#learningMethod", "#learningFuel"]) $(selector).value = "";
    if (state.rows.length) render();
  };
  $("#reloadLearning").onclick = load;
  (async () => {
    try {
      if (!client || !core) throw new Error("missing dependencies");
      const access = await window.CucinaHubAuthGuard.requireAdministrator(client);
      if (!access.authorized) { $("#authGate").hidden = false; status("Accedi con il tuo account amministratore."); return; }
      state.owner = access.user.id;
      $("#weberLearningWorkspace").hidden = false;
      await load();
    } catch { status("Impossibile verificare l’accesso. Torna alla dashboard e riprova.", true); }
  })();
})();
