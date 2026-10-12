"use strict";

(() => {
  const client = window.cucinaHubSupabase;
  const core = window.CucinaHubNutritionPlanCore;
  const get = id => document.getElementById(id);
  const escape = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const state = { week: core.monday(new URLSearchParams(location.search).get("week") || core.today()), view: "today", packet: null, recipes: [], busy: false, request: 0 };
  function dateLabel(date, options = { day: "numeric", month: "long", year: "numeric" }) {
    return new Intl.DateTimeFormat("it-IT", { ...options, timeZone: "Europe/Rome" }).format(new Date(`${date}T12:00:00Z`));
  }
  function note(value) { return value ? `<p class="nutrition-note">${escape(value)}</p>` : ""; }
  function components(items) {
    return items.length ? `<ul>${items.map(item => `<li>${escape(item.name)}${core.quantity(item) ? ` · ${escape(core.quantity(item))}` : ""}${note(item.note)}</li>`).join("")}</ul>` : "";
  }
  function recipe(ref) {
    if (!ref) return "";
    const href = core.recipeHref(ref, state.recipes);
    return href ? `<a class="button secondary nutrition-recipe" href="${escape(href)}">Apri ricetta</a>`
      : `<p class="nutrition-note">Ricetta non disponibile in biblioteca (${escape(ref.code)}).</p>`;
  }
  function mealHtml(meal) {
    return `<article class="nutrition-meal"><p class="eyebrow">${escape(core.SLOT_LABELS[meal.slot])}${meal.time ? ` · ${escape(meal.time)}` : ""}</p><h3>${escape(meal.title)}</h3>${components(meal.components)}${recipe(meal.recipe_ref)}${note(meal.note)}${meal.alternatives?.length ? `<details><summary>Alternative (${meal.alternatives.length})</summary>${meal.alternatives.map(alternative => `<div class="nutrition-alternative"><strong>${escape(alternative.label)}</strong>${components(alternative.components)}${recipe(alternative.recipe_ref)}${note(alternative.note)}</div>`).join("")}</details>` : ""}</article>`;
  }
  function dayHtml(day) {
    const slots = Object.keys(core.SLOT_LABELS);
    const meals = [...day.meals].sort((a, b) => slots.indexOf(a.slot) - slots.indexOf(b.slot));
    return `<article class="hub-panel nutrition-day"><p class="eyebrow">${escape(core.DAY_LABELS[day.day_type])}</p><h2>${escape(dateLabel(day.date, { weekday: "long", day: "numeric", month: "long" }))}</h2><div class="nutrition-training"><strong>Allenamento di oggi</strong><p>${day.training ? `${escape(day.training.name)}${day.training.start_time ? ` · ${escape(day.training.start_time)}` : ""}` : "Riposo — nessun allenamento previsto"}</p>${note(day.training?.note)}</div>${meals.map(mealHtml).join("")}${day.alcohol ? `<div class="nutrition-meal"><h3>Alcol previsto</h3><p>${escape(day.alcohol.label)} · ${escape(core.quantity(day.alcohol))}</p>${note(day.alcohol.note)}</div>` : ""}${note(day.note)}</article>`;
  }
  function render() {
    if (!state.packet) return;
    const packet = state.packet;
    const metrics = packet.check_in;
    get("nutritionOverview").innerHTML = `<p class="eyebrow">Piano pubblicato · revisione ${escape(packet.plan.revision)}</p><h2>${escape(packet.plan.title)}</h2><dl class="nutrition-metrics"><div><dt>Peso</dt><dd>${escape(metrics.weight_kg)} kg</dd></div><div><dt>Vita</dt><dd>${escape(metrics.waist_cm)} cm</dd></div><div><dt>Body fat · dato secondario</dt><dd>${metrics.body_fat_percent == null ? "Non disponibile" : `${escape(metrics.body_fat_percent)}%`}</dd></div></dl><p class="nutrition-note">Misurazione del ${escape(dateLabel(metrics.measured_at))}</p>${note(metrics.note)}<h3>Obiettivo della settimana</h3><p>${escape(packet.goal.summary)}</p><h3>Strategia nutrizionale</h3><p>${escape(packet.goal.strategy)}</p><p>Proteine indicative: ${escape(packet.goal.protein_target_g.min)}–${escape(packet.goal.protein_target_g.max)} g/die</p>`;
    document.querySelectorAll("[data-view]").forEach(button => {
      const active = button.dataset.view === state.view;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("secondary", !active);
    });
    if (state.view === "shopping") {
      get("nutritionContent").innerHTML = `<h2>Lista della spesa</h2><p>Ingredienti del piano pubblicato; le alternative non sono aggiunte automaticamente. Quantità indicative.</p><div class="nutrition-shopping">${packet.shopping_list.categories.map(category => `<article class="hub-panel"><h3>${escape(category.label)}</h3>${components(category.items)}</article>`).join("") || '<p>Nessuna voce nella lista pubblicata.</p>'}</div>`;
    } else if (state.view === "week") {
      get("nutritionContent").innerHTML = packet.days.map(dayHtml).join("");
    } else {
      const day = packet.days.find(item => item.date === core.today());
      get("nutritionContent").innerHTML = day ? dayHtml(day) : '<div class="hub-panel"><h2>Oggi non appartiene a questa settimana</h2><p>Apri “Intera settimana” per consultare il piano selezionato, oppure torna a “Questa settimana”.</p></div>';
    }
  }
  function clearPrivateContent() {
    state.packet = null;
    state.recipes = [];
    get("nutritionPlan").hidden = true;
    get("nutritionOverview").replaceChildren();
    get("nutritionContent").replaceChildren();
  }
  async function load() {
    if (state.busy) return;
    const request = ++state.request;
    state.busy = true;
    clearPrivateContent();
    get("nutritionWorkspace").hidden = true;
    get("nutritionAuth").hidden = true;
    get("nutritionMessage").hidden = true;
    get("nutritionRetry").hidden = true;
    get("nutritionStatus").textContent = "Aggiornamento del piano…";
    document.querySelectorAll(".week-controls button").forEach(button => { button.disabled = true; });
    try {
      const access = await window.CucinaHubAuthGuard.requireAdministrator(client);
      if (request !== state.request) return;
      if (!access.authorized) {
        get("nutritionAuth").hidden = false;
        get("nutritionStatus").textContent = "Accedi per consultare i tuoi dati privati.";
        return;
      }
      const user = access.user;
      const packages = await client.from("planner_menu_packages")
        .select("id,period_start,period_end,source_external_id,source_revision,import_status")
        .eq("owner_user_id", user.id).eq("import_status", "confirmed")
        .eq("period_start", state.week).eq("period_end", core.addDays(state.week, 6));
      if (packages.error) throw packages.error;
      if (request !== state.request) return;
      const ids = (packages.data || []).map(item => item.id);
      const rows = ids.length ? await client.from("nutrition_plan_weeks")
        .select("planner_menu_package_id,source_payload").eq("owner_user_id", user.id).in("planner_menu_package_id", ids)
        : { data: [], error: null };
      if (rows.error) throw rows.error;
      if (request !== state.request) return;
      const selection = core.selectPlan(packages.data || [], rows.data || [], state.week);
      get("nutritionWeek").textContent = `${dateLabel(state.week)} – ${dateLabel(core.addDays(state.week, 6))}`;
      get("nutritionWorkspace").hidden = false;
      const url = new URL(location.href);
      url.searchParams.set("week", state.week);
      history.replaceState(null, "", url);
      if (selection.status !== "ready") {
        const messages = { empty: "Nessun piano alimentare pubblicato per questa settimana.", invalid: "Il piano pubblicato contiene dati non validi. Non vengono mostrati pasti parziali.", ambiguous: "Sono presenti più piani attivi per questa settimana. È necessaria una verifica prima della consultazione." };
        get("nutritionMessage").textContent = messages[selection.status];
        get("nutritionMessage").hidden = false;
        get("nutritionStatus").textContent = selection.status === "empty" ? "Settimana non ancora pubblicata." : "Piano non disponibile.";
        return;
      }
      const [recipes, edits] = await Promise.all([
        client.from("recipes").select("id,code,title").eq("owner_user_id", user.id),
        client.from("planned_meals").select("id,is_user_modified,planned_meal_items(is_user_modified)")
          .eq("owner_user_id", user.id).eq("menu_package_id", selection.packageId)
      ]);
      if (recipes.error) throw recipes.error;
      if (edits.error) throw edits.error;
      if (request !== state.request) return;
      state.packet = selection.packet;
      state.recipes = recipes.data || [];
      if ((edits.data || []).some(meal => meal.is_user_modified || meal.planned_meal_items?.some(item => item.is_user_modified))) {
        get("nutritionMessage").textContent = "Alcuni pasti sono stati modificati nel Planner. Qui consulti il piano nutrizionale originale pubblicato, non quelle modifiche.";
        get("nutritionMessage").hidden = false;
      }
      get("nutritionPlan").hidden = false;
      render();
      get("nutritionStatus").textContent = "Piano aggiornato. Oggi usa il fuso orario di Roma.";
    } catch {
      if (request !== state.request) return;
      clearPrivateContent();
      get("nutritionWorkspace").hidden = true;
      get("nutritionStatus").textContent = navigator.onLine === false ? "Sei offline. Ricollegati per leggere il piano privato aggiornato." : "Impossibile caricare il piano. Riprova tra poco.";
      get("nutritionRetry").hidden = false;
    } finally {
      state.busy = false;
      document.querySelectorAll(".week-controls button").forEach(button => { button.disabled = false; });
    }
  }
  get("nutritionPrevious").addEventListener("click", () => { state.week = core.addDays(state.week, -7); state.view = "week"; load(); });
  get("nutritionNext").addEventListener("click", () => { state.week = core.addDays(state.week, 7); state.view = "week"; load(); });
  get("nutritionCurrent").addEventListener("click", () => { state.week = core.monday(); state.view = "today"; load(); });
  get("nutritionRetry").addEventListener("click", load);
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => { state.view = button.dataset.view; render(); }));
  client?.auth.onAuthStateChange(event => {
    if (event === "SIGNED_OUT") {
      ++state.request;
      clearPrivateContent();
      get("nutritionWorkspace").hidden = true;
      get("nutritionAuth").hidden = false;
      get("nutritionStatus").textContent = "Sessione terminata. Accedi nuovamente.";
    } else if (event === "SIGNED_IN") window.setTimeout(load, 0);
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
  load();
})();
