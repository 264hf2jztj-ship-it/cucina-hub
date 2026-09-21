"use strict";

(() => {
  const client = window.cucinaHubSupabase;
  const core = window.CucinaHubWeberDiaryCore;
  const $ = selector => document.querySelector(selector);
  const state = { user: null, recipes: [], sessions: [], status: "all", query: "", busy: false };

  const escapeHtml = (value = "") => String(value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  function setStatus(message, type = "") {
    $("#pageStatus").textContent = message;
    $("#pageStatus").className = `weber-page-status${type ? ` ${type}` : ""}`;
  }

  function dateLabel(value) {
    return value ? new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
  }

  function localDateTime(value = new Date()) {
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  const recipeFor = id => state.recipes.find(recipe => recipe.id === id);

  function renderMetrics() {
    const summary = core.summary(state.sessions);
    for (const [key, value] of Object.entries(summary)) {
      $(`#metric${key[0].toUpperCase()}${key.slice(1)}`).textContent = value;
    }
  }

  function detail(label, value) {
    return value === null || value === undefined || value === "" ? "" : `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }

  function sessionCard(session) {
    const recipe = recipeFor(session.recipe_id);
    const fuel = [session.fuel_amount, core.UNIT_LABELS[session.fuel_unit]].filter(value => value !== null && value !== undefined).join(" ");
    return `<article class="weber-session-card ${escapeHtml(session.status)}">
      <header><div><span class="badge ${escapeHtml(session.status)}">${escapeHtml(core.STATUS_LABELS[session.status] ?? session.status)}</span><h2>${escapeHtml(session.title)}</h2><span class="recipe">${escapeHtml(recipe ? [recipe.code, recipe.title].filter(Boolean).join(" — ") : "Nessuna ricetta collegata")}</span></div><span class="session-date">${escapeHtml(dateLabel(session.cooked_at))}</span></header>
      <div class="weber-session-data">
        ${detail("Metodo", core.METHOD_LABELS[session.cooking_method])}
        ${detail("Combustibile", [core.FUEL_LABELS[session.fuel_type], fuel].filter(Boolean).join(" · "))}
        ${detail("Prese iniziali", session.vent_bottom_percent === null && session.vent_top_percent === null ? null : `↓ ${session.vent_bottom_percent ?? "—"}% · ↑ ${session.vent_top_percent ?? "—"}%`)}
        ${detail("Temperatura griglia", session.target_grate_temp_c === null && session.peak_grate_temp_c === null ? null : `obiettivo ${session.target_grate_temp_c ?? "—"} °C · max ${session.peak_grate_temp_c ?? "—"} °C`)}
        ${detail("Durata", session.duration_minutes ? `${session.duration_minutes} min` : null)}
        ${detail("Cuore", session.food_core_temp_c === null ? null : `${session.food_core_temp_c} °C`)}
      </div>
      ${session.result_notes ? `<div class="weber-result"><strong>Risultato${session.rating ? ` · ${session.rating}/5` : ""}</strong><p>${escapeHtml(session.result_notes)}</p></div>` : ""}
      ${session.next_change ? `<p class="next-change"><strong>Prossima modifica:</strong> ${escapeHtml(session.next_change)}</p>` : ""}
      <footer><button class="button secondary" data-action="edit" data-id="${session.id}" type="button">MODIFICA</button><button class="button danger" data-action="delete" data-id="${session.id}" type="button">ELIMINA</button></footer>
    </article>`;
  }

  function render() {
    renderMetrics();
    const rows = core.filter(state.sessions.map(session => ({ ...session, recipe_title: recipeFor(session.recipe_id)?.title })), { status: state.status, query: state.query });
    $("#sessionList").innerHTML = rows.length
      ? rows.map(sessionCard).join("")
      : '<div class="weber-empty"><strong>Nessuna sessione in questa vista</strong><p>Crea la prima prova Weber oppure modifica i filtri.</p></div>';
  }

  function fillRecipeOptions() {
    $("#recipeId").innerHTML = '<option value="">Nessuna ricetta</option>' + state.recipes
      .map(recipe => `<option value="${recipe.id}">${escapeHtml([recipe.code, recipe.title].filter(Boolean).join(" — "))}</option>`).join("");
  }

  function resetForm() {
    $("#sessionForm").reset();
    $("#sessionId").value = "";
    $("#dialogTitle").textContent = "Nuova sessione";
    $("#cookedAt").value = localDateTime();
    $("#formMessage").textContent = "";
  }

  function openEditor(session = null) {
    resetForm();
    if (session) {
      $("#dialogTitle").textContent = "Modifica sessione";
      $("#sessionId").value = session.id;
      const fields = {
        sessionTitle: session.title,
        cookedAt: localDateTime(session.cooked_at),
        status: session.status,
        recipeId: session.recipe_id,
        cookingMethod: session.cooking_method,
        fuelType: session.fuel_type,
        fuelAmount: session.fuel_amount,
        fuelUnit: session.fuel_unit,
        ignitionMethod: session.ignition_method,
        ventBottom: session.vent_bottom_percent,
        ventTop: session.vent_top_percent,
        targetTemp: session.target_grate_temp_c,
        peakTemp: session.peak_grate_temp_c,
        coreTemp: session.food_core_temp_c,
        duration: session.duration_minutes,
        rating: session.rating,
        resultNotes: session.result_notes,
        nextChange: session.next_change
      };
      for (const [id, value] of Object.entries(fields)) $(`#${id}`).value = value ?? "";
    }
    $("#sessionDialog").showModal();
  }

  function formInput() {
    return {
      title: $("#sessionTitle").value,
      cooked_at: $("#cookedAt").value,
      status: $("#status").value,
      recipe_id: $("#recipeId").value,
      cooking_method: $("#cookingMethod").value,
      fuel_type: $("#fuelType").value,
      fuel_amount: $("#fuelAmount").value,
      fuel_unit: $("#fuelUnit").value,
      ignition_method: $("#ignitionMethod").value,
      vent_bottom_percent: $("#ventBottom").value,
      vent_top_percent: $("#ventTop").value,
      target_grate_temp_c: $("#targetTemp").value,
      peak_grate_temp_c: $("#peakTemp").value,
      food_core_temp_c: $("#coreTemp").value,
      duration_minutes: $("#duration").value,
      rating: $("#rating").value,
      result_notes: $("#resultNotes").value,
      next_change: $("#nextChange").value
    };
  }

  async function saveSession(event) {
    event.preventDefault();
    if (state.busy) return;
    state.busy = true;
    $("#saveSession").disabled = true;
    $("#formMessage").textContent = "";
    try {
      const data = core.payload(formInput(), state.user.id);
      const id = $("#sessionId").value;
      const result = id
        ? await client.from("weber_cook_sessions").update(data).eq("id", id).eq("owner_user_id", state.user.id).select().single()
        : await client.from("weber_cook_sessions").insert(data).select().single();
      if (result.error) throw result.error;
      $("#sessionDialog").close();
      await loadData();
      setStatus(id ? "Sessione Weber aggiornata." : "Sessione Weber creata.", "ok");
    } catch (error) {
      $("#formMessage").textContent = error.message;
    } finally {
      state.busy = false;
      $("#saveSession").disabled = false;
    }
  }

  async function handleAction(action, id) {
    const session = state.sessions.find(item => item.id === id);
    if (!session) return;
    if (action === "edit") return openEditor(session);
    if (action !== "delete" || !confirm(`Eliminare “${session.title}”?`)) return;
    try {
      const result = await client.from("weber_cook_sessions").delete().eq("id", id).eq("owner_user_id", state.user.id);
      if (result.error) throw result.error;
      await loadData();
      setStatus("Sessione Weber eliminata.", "ok");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function loadData() {
    const [recipes, sessions] = await Promise.all([
      client.from("recipes").select("id,code,title,archived_at").eq("owner_user_id", state.user.id).is("archived_at", null).order("title"),
      client.from("weber_cook_sessions").select("*").eq("owner_user_id", state.user.id).order("cooked_at", { ascending: false })
    ]);
    if (recipes.error) throw recipes.error;
    if (sessions.error) throw sessions.error;
    state.recipes = recipes.data ?? [];
    state.sessions = sessions.data ?? [];
    fillRecipeOptions();
    render();
  }

  async function init() {
    try {
      if (!client || !core) throw new Error("Il collegamento al Diario Weber non è disponibile.");
      const access = await window.CucinaHubAuthGuard.requireAdministrator(client);
      state.user = access.user;
      if (!access.authorized) {
        $("#authGate").hidden = false;
        setStatus("Accedi dalla Dashboard con l’account amministratore per usare il diario.", "error");
        return;
      }
      await loadData();
      $("#diaryWorkspace").hidden = false;
      setStatus("Diario Weber aggiornato dai tuoi dati personali.", "ok");
    } catch (error) {
      $("#authGate").hidden = false;
      setStatus(error.message, "error");
    }
  }

  $("#newSession").onclick = () => openEditor();
  $("#closeDialog").onclick = $("#cancelForm").onclick = () => $("#sessionDialog").close();
  $("#sessionForm").onsubmit = saveSession;
  $("#sessionSearch").oninput = event => { state.query = event.target.value; render(); };
  $("#sessionStatus").onchange = event => { state.status = event.target.value; render(); };
  $("#sessionList").onclick = event => {
    const button = event.target.closest("[data-action]");
    if (button) void handleAction(button.dataset.action, button.dataset.id);
  };
  void init();
})();
