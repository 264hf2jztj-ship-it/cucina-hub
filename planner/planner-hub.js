"use strict";

const client = window.cucinaHubSupabase;
const plannerCore = window.CucinaHubPlannerCore;
const hubCore = window.CucinaHubPlannerHubCore;

const state = {
  ownerUserId: null,
  weekAnchor: null,
  meals: [],
  tasks: [],
  shopping: [],
  packages: [],
  recipes: new Map(),
  busy: false
};

const elements = {
  status: document.querySelector("#hubStatus"),
  authGate: document.querySelector("#hubAuthGate"),
  errorPanel: document.querySelector("#hubErrorPanel"),
  errorMessage: document.querySelector("#hubErrorMessage"),
  retry: document.querySelector("#hubRetry"),
  workspace: document.querySelector("#hubWorkspace"),
  weekRange: document.querySelector("#hubWeekRange"),
  mealCount: document.querySelector("#hubMealCount"),
  prepCount: document.querySelector("#hubPrepCount"),
  weekGrid: document.querySelector("#hubWeekGrid"),
  previousWeek: document.querySelector("#hubPreviousWeek"),
  currentWeek: document.querySelector("#hubCurrentWeek"),
  nextWeek: document.querySelector("#hubNextWeek"),
  openWeek: document.querySelector("#openWeekPlanner"),
  shoppingModule: document.querySelector("#shoppingModule"),
  prepModule: document.querySelector("#prepModule"),
  mealModule: document.querySelector("#mealModule"),
  shoppingCount: document.querySelector("#hubShoppingCount"),
  packageCount: document.querySelector("#hubPackageCount"),
  prepTodoCount: document.querySelector("#hubPrepTodoCount"),
  plannedCount: document.querySelector("#hubPlannedCount")
};

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(message = "", type = "") {
  elements.status.textContent = message;
  elements.status.className = `hub-status${type ? ` ${type}` : ""}`;
}

function assertOk(error, context) {
  if (!error) return;
  const wrapped = new Error(`${context}: ${error.message}`);
  wrapped.code = error.code;
  throw wrapped;
}

function dateLabel(value, options) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("it-IT", options).format(date);
}

function weekLabel(week) {
  const start = dateLabel(week.startDate, { day: "numeric", month: "short" });
  const end = dateLabel(week.endDate, { day: "numeric", month: "short", year: "numeric" });
  return `${start} – ${end}`;
}

function timeLabel(value) {
  return value ? String(value).slice(0, 5) : "";
}

function dayHtml(day, grouped) {
  const meals = grouped.get(day.date) || [];
  const isToday = day.date === plannerCore.localDateValue();
  return `<article class="hub-day${isToday ? " is-today" : ""}" role="listitem">
    <div class="hub-day-heading">
      <div><span>${escapeHtml(dateLabel(day.date, { weekday: "short" }))}</span><strong>${escapeHtml(dateLabel(day.date, { day: "numeric", month: "short" }))}</strong></div>
      ${isToday ? '<span class="today-badge">OGGI</span>' : ""}
    </div>
    <div class="hub-day-meals">
      ${meals.length ? meals.map(meal => `<div class="hub-meal">
        <span>${escapeHtml([timeLabel(meal.planned_time), hubCore.SLOT_LABELS[meal.meal_slot] || "Altro"].filter(Boolean).join(" · "))}</span>
        <strong>${escapeHtml(hubCore.mealLabel(meal, state.recipes))}</strong>
      </div>`).join("") : '<span class="hub-day-empty">Nessun pasto</span>'}
    </div>
    <a class="hub-day-add" href="${escapeHtml(hubCore.moduleHref("meal-plan", state.weekAnchor, { date: day.date }))}">${meals.length ? "GESTISCI" : "+ AGGIUNGI"}</a>
  </article>`;
}

function updateLinks() {
  const week = state.weekAnchor;
  elements.openWeek.href = hubCore.moduleHref("meal-plan", week);
  elements.shoppingModule.href = hubCore.moduleHref("shopping-list", week);
  elements.prepModule.href = hubCore.moduleHref("meal-prep", week);
  elements.mealModule.href = hubCore.moduleHref("meal-plan", week);
}

function render() {
  const week = plannerCore.weekForDate(state.weekAnchor, state.meals);
  const grouped = hubCore.mealsByDate(state.meals);
  const summary = hubCore.counts(state);
  elements.weekRange.textContent = weekLabel(week);
  elements.mealCount.textContent = summary.meals;
  elements.prepCount.textContent = summary.prep;
  elements.shoppingCount.textContent = summary.shopping;
  elements.packageCount.textContent = summary.packages;
  elements.prepTodoCount.textContent = summary.prepTodo;
  elements.plannedCount.textContent = summary.meals;
  elements.weekGrid.innerHTML = week.days.map(day => dayHtml(day, grouped)).join("");
  updateLinks();
}

async function currentUser() {
  const access = await window.CucinaHubAuthGuard.requireAdministrator(client);
  return access.user;
}

async function queryOptional(promise, tablePattern) {
  const result = await promise;
  if (!result.error) return result.data || [];
  if (["42P01", "PGRST204", "PGRST205"].includes(result.error.code)
      || tablePattern.test(result.error.message || "")) return [];
  throw result.error;
}

async function loadWeek(anchor = state.weekAnchor) {
  if (state.busy) return;
  state.busy = true;
  elements.errorPanel.hidden = true;
  setStatus("Aggiornamento riepilogo…");
  try {
    const user = await currentUser();
    if (!user) {
      elements.authGate.hidden = false;
      elements.workspace.hidden = true;
      setStatus("Accedi a Cucina Hub per vedere il Planner.", "warning");
      return;
    }
    state.ownerUserId = user.id;
    elements.authGate.hidden = true;
    const week = plannerCore.weekForDate(anchor);
    const [recipesResult, mealsResult, tasks, shopping, packages] = await Promise.all([
      client.from("recipes").select("id,code,title").eq("owner_user_id", user.id).order("title"),
      client.from("planned_meals")
        .select("id,recipe_id,planned_date,meal_slot,planned_time,planned_meal_items(item_type,label,recipe_code,position)")
        .eq("owner_user_id", user.id)
        .gte("planned_date", week.startDate)
        .lte("planned_date", week.endDate)
        .order("planned_date")
        .order("planned_time"),
      queryOptional(
        client.from("meal_prep_tasks").select("id,status,scheduled_date").eq("owner_user_id", user.id).gte("scheduled_date", week.startDate).lte("scheduled_date", week.endDate),
        /meal_prep_tasks/i
      ),
      queryOptional(
        client.from("shopping_list_items").select("id,is_checked,is_excluded").eq("owner_user_id", user.id).eq("week_start", week.startDate),
        /shopping_list_items/i
      ),
      queryOptional(
        client.from("planner_menu_import_requests").select("id,status").eq("owner_user_id", user.id).eq("status", "pending"),
        /planner_menu_import_requests/i
      )
    ]);
    assertOk(recipesResult.error, "Lettura ricette");
    assertOk(mealsResult.error, "Lettura pasti");
    state.weekAnchor = anchor;
    state.recipes = new Map((recipesResult.data || []).map(recipe => [recipe.id, recipe]));
    state.meals = mealsResult.data || [];
    state.tasks = tasks;
    state.shopping = shopping;
    state.packages = packages;
    const url = new URL(window.location.href);
    url.searchParams.set("week", anchor);
    window.history.replaceState(null, "", url);
    render();
    elements.workspace.hidden = false;
    setStatus("Riepilogo settimanale aggiornato.", "success");
  } catch (error) {
    elements.workspace.hidden = true;
    elements.errorPanel.hidden = false;
    elements.errorMessage.textContent = error.message || "Non è stato possibile caricare il riepilogo.";
    setStatus("Errore durante il caricamento del Planner.", "error");
  } finally {
    state.busy = false;
  }
}

elements.previousWeek.addEventListener("click", () => loadWeek(plannerCore.addDays(state.weekAnchor, -7)));
elements.currentWeek.addEventListener("click", () => loadWeek(plannerCore.localDateValue()));
elements.nextWeek.addEventListener("click", () => loadWeek(plannerCore.addDays(state.weekAnchor, 7)));
elements.retry.addEventListener("click", () => loadWeek(state.weekAnchor));

const requestedWeek = new URLSearchParams(window.location.search).get("week");
state.weekAnchor = plannerCore.isRealDate(requestedWeek) ? requestedWeek : plannerCore.localDateValue();
loadWeek(state.weekAnchor);
