"use strict";

(() => {
  const client = window.cucinaHubSupabase;
  const core = window.CucinaHubAnalyticsCore;
  const elements = {
    status: document.querySelector("#pageStatus"),
    gate: document.querySelector("#authGate"),
    workspace: document.querySelector("#analyticsWorkspace"),
    period: document.querySelector("#analyticsPeriod"),
    periodLabel: document.querySelector("#analyticsPeriodLabel"),
    meals: document.querySelector("#analyticsMeals"),
    mealsTrend: document.querySelector("#analyticsMealsTrend"),
    prep: document.querySelector("#analyticsPrep"),
    prepTrend: document.querySelector("#analyticsPrepTrend"),
    sessions: document.querySelector("#analyticsSessions"),
    sessionsTrend: document.querySelector("#analyticsSessionsTrend"),
    recipes: document.querySelector("#analyticsRecipes"),
    recipesTrend: document.querySelector("#analyticsRecipesTrend"),
    weekly: document.querySelector("#analyticsWeekly"),
    mealSlots: document.querySelector("#analyticsMealSlots"),
    prepStatuses: document.querySelector("#analyticsPrepStatuses"),
    library: document.querySelector("#analyticsLibrary"),
    sources: document.querySelector("#analyticsSources")
  };
  let user = null;

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
    elements.status.className = `analytics-page-status${type ? ` ${type}` : ""}`;
  }

  function shortDate(value) {
    return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
  }

  function trendClass(trend) {
    if (trend.value === null || trend.value === 0) return "neutral";
    return trend.value > 0 ? "up" : "down";
  }

  function setMetric(valueNode, trendNode, value, trend, suffix = "") {
    valueNode.textContent = `${value}${suffix}`;
    trendNode.textContent = trend.label;
    trendNode.className = `analytics-trend ${trendClass(trend)}`;
  }

  function renderWeekly(weeks) {
    const max = Math.max(1, ...weeks.flatMap(item => [item.meals, item.prep, item.sessions]));
    elements.weekly.innerHTML = weeks.map(item => `
      <div class="analytics-week" title="Settimana del ${escapeHtml(shortDate(item.weekStart))}">
        <div class="analytics-bars">
          <span class="meals" style="height:${Math.max(item.meals ? 8 : 0, item.meals / max * 100)}%" aria-label="${item.meals} pasti"></span>
          <span class="prep" style="height:${Math.max(item.prep ? 8 : 0, item.prep / max * 100)}%" aria-label="${item.prep} Meal Prep"></span>
          <span class="sessions" style="height:${Math.max(item.sessions ? 8 : 0, item.sessions / max * 100)}%" aria-label="${item.sessions} sessioni"></span>
        </div>
        <small class="analytics-week-counts">${item.meals} · ${item.prep} · ${item.sessions}</small>
        <small>${escapeHtml(shortDate(item.weekStart))}</small>
      </div>`).join("");
  }

  function renderDistribution(node, items, emptyText) {
    if (!items.length) {
      node.innerHTML = `<div class="analytics-empty">${escapeHtml(emptyText)}</div>`;
      return;
    }
    const max = Math.max(...items.map(item => item.count), 1);
    node.innerHTML = items.map(item => `<div class="analytics-distribution-row"><div><span>${escapeHtml(item.label)}</span><strong>${item.count}</strong></div><div class="analytics-track"><span style="width:${item.count / max * 100}%"></span></div></div>`).join("");
  }

  function render(model, data) {
    elements.periodLabel.textContent = `${shortDate(model.range.start)} – ${shortDate(model.range.end)}`;
    setMetric(elements.meals, elements.mealsTrend, model.metrics.meals.value, model.metrics.meals.trend);
    setMetric(elements.prep, elements.prepTrend, model.metrics.prepCompleted.value, model.metrics.prepCompleted.trend);
    setMetric(elements.sessions, elements.sessionsTrend, model.metrics.sessions.value, model.metrics.sessions.trend);
    setMetric(elements.recipes, elements.recipesTrend, model.metrics.recipes.value, model.metrics.recipes.trend);
    document.querySelector("#analyticsPrepRate").textContent = `${model.metrics.prepCompleted.rate}% di ${model.metrics.prepCompleted.total} attività`;
    renderWeekly(model.weekly);
    renderDistribution(elements.mealSlots, model.mealSlots, "Nessun pasto pianificato nel periodo.");
    renderDistribution(elements.prepStatuses, model.prepStatuses, "Nessuna attività Meal Prep nel periodo.");
    elements.library.innerHTML = `
      <article><span>Ricette attive</span><strong>${model.library.totalRecipes}</strong><small>escluse quelle archiviate</small></article>
      <article><span>Ricette certificate</span><strong>${model.library.certifiedRecipes}</strong><small>approvate nella Biblioteca</small></article>
      <article><span>Giorni con attività</span><strong>${model.library.activeDays}</strong><small>nel periodo selezionato</small></article>`;
    elements.sources.innerHTML = `
      <span>Planner <strong>${data.meals.length}</strong></span>
      <span>Meal Prep <strong>${data.prep.length}</strong></span>
      <span>Laboratorio <strong>${data.sessions.length}</strong></span>
      <span>Biblioteca <strong>${data.recipes.length}</strong></span>`;
    setStatus("Analytics aggiornati dai tuoi dati personali.", "ok");
  }

  async function load() {
    try {
      if (!client || !core) throw new Error("Il collegamento Analytics non è disponibile.");
      setStatus("Aggiornamento delle statistiche personali…");
      const auth = await client.auth.getSession();
      if (auth.error) throw auth.error;
      user = auth.data.session?.user;
      if (!user) {
        elements.gate.hidden = false;
        elements.workspace.hidden = true;
        setStatus("Accedi dalla Dashboard per vedere gli Analytics.", "error");
        return;
      }

      const days = Number(elements.period.value || 90);
      const range = core.periodRange(days);
      const queryStart = range.previousStart;
      const timestampStart = `${queryStart}T00:00:00`;
      const timestampEnd = `${range.end}T23:59:59`;
      const [mealResult, prepResult, sessionResult, recipeResult] = await Promise.all([
        client.from("planned_meals").select("id,planned_date,meal_slot").eq("owner_user_id", user.id).gte("planned_date", queryStart).lte("planned_date", range.end),
        client.from("meal_prep_tasks").select("id,scheduled_date,status,completed_at").eq("owner_user_id", user.id).gte("scheduled_date", queryStart).lte("scheduled_date", range.end),
        client.from("baking_sessions").select("id,status,completed_at").eq("owner_user_id", user.id).gte("completed_at", timestampStart).lte("completed_at", timestampEnd),
        client.from("recipes").select("id,status,created_at").eq("owner_user_id", user.id).lte("created_at", timestampEnd)
      ]);
      for (const result of [mealResult, prepResult, sessionResult, recipeResult]) if (result.error) throw result.error;
      const data = {
        meals: mealResult.data || [],
        prep: prepResult.data || [],
        sessions: sessionResult.data || [],
        recipes: recipeResult.data || []
      };
      render(core.summary({ days, meals: data.meals, prep: data.prep, sessions: data.sessions, recipes: data.recipes }), data);
      elements.gate.hidden = true;
      elements.workspace.hidden = false;
    } catch (error) {
      elements.gate.hidden = false;
      elements.workspace.hidden = true;
      setStatus(error.message, "error");
    }
  }

  elements.period.addEventListener("change", () => void load());
  void load();
})();
