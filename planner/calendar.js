"use strict";

const client = window.cucinaHubSupabase;
const core = window.CucinaHubCalendarCore;

const state = {
  ownerUserId: null,
  anchor: core.monthAnchor(new Date()),
  recipes: new Map(),
  meals: [],
  tasks: [],
  filter: "all",
  busy: false
};

const elements = {
  status: document.querySelector("#calendarStatus"),
  authGate: document.querySelector("#authGate"),
  errorPanel: document.querySelector("#errorPanel"),
  errorMessage: document.querySelector("#errorMessage"),
  workspace: document.querySelector("#calendarWorkspace"),
  monthTitle: document.querySelector("#monthTitle"),
  monthRange: document.querySelector("#monthRange"),
  previous: document.querySelector("#previousMonth"),
  current: document.querySelector("#currentMonth"),
  next: document.querySelector("#nextMonth"),
  filter: document.querySelector("#calendarFilter"),
  mealCount: document.querySelector("#calendarMealCount"),
  prepCount: document.querySelector("#calendarPrepCount"),
  grid: document.querySelector("#calendarGrid"),
  retry: document.querySelector("#retryLoad")
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
  elements.status.className = `calendar-status${type ? ` ${type}` : ""}`;
}

function assertOk(error, context) {
  if (!error) return;
  const wrapped = new Error(`${context}: ${error.message}`);
  wrapped.code = error.code;
  throw wrapped;
}

function isMissingMealPrep(error) {
  return ["42P01", "PGRST204", "PGRST205"].includes(error?.code)
    || /meal_prep_tasks|schema cache|could not find the table/i.test(error?.message || "");
}

function monthLabel(value) {
  return new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(value);
}

function compactDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" }).format(date);
}

function recipeLabel(recipeId, fallback = "") {
  const recipe = state.recipes.get(recipeId);
  return recipe ? ([recipe.code, recipe.title].filter(Boolean).join(" — ") || "Ricetta") : fallback || "Ricetta";
}

function mealItems(meal) {
  return (Array.isArray(meal?.planned_meal_items) ? meal.planned_meal_items : [])
    .slice()
    .sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0));
}

function mealLabel(meal) {
  const items = mealItems(meal);
  if (!items.length) return recipeLabel(meal.recipe_id);
  const labels = items.map(item => {
    if (item.item_type === "recipe") return recipeLabel(item.recipe_id, item.recipe_code || item.label || "Ricetta");
    return item.label || "Elemento";
  });
  return labels.length > 2 ? `${labels.slice(0, 2).join(" · ")} +${labels.length - 2}` : labels.join(" · ");
}

function timeLabel(value) {
  return value ? String(value).slice(0, 5) : "";
}

function eventHtml(event) {
  if (event.type === "meal") {
    const meal = event.payload;
    const meta = [timeLabel(meal.planned_time), core.mealSlotLabel(meal.meal_slot)].filter(Boolean).join(" · ");
    return `<article class="calendar-event meal-event">
      <span class="calendar-event-kind">🍽️ ${escapeHtml(meta)}</span>
      <strong>${escapeHtml(mealLabel(meal))}</strong>
    </article>`;
  }
  const task = event.payload;
  const statusLabel = task.status === "done" ? "Fatto" : task.status === "in_progress" ? "In corso" : "Da fare";
  const meta = [timeLabel(task.scheduled_time), statusLabel].filter(Boolean).join(" · ");
  return `<article class="calendar-event prep-event${task.status === "done" ? " is-done" : ""}">
    <span class="calendar-event-kind">🧰 ${escapeHtml(meta)}</span>
    <strong>${escapeHtml(task.title || "Meal prep")}</strong>
  </article>`;
}

function render() {
  const cells = core.buildMonthCells(state.anchor);
  const grouped = core.groupEvents(state.meals, state.tasks);
  elements.monthTitle.textContent = monthLabel(state.anchor);
  elements.monthRange.textContent = `${compactDate(cells[0].date)} – ${compactDate(cells[cells.length - 1].date)}`;
  elements.mealCount.textContent = state.meals.length;
  elements.prepCount.textContent = state.tasks.length;
  elements.filter.value = state.filter;

  elements.grid.innerHTML = cells.map(cell => {
    const events = core.filterEvents(grouped.get(cell.date) || [], state.filter);
    const classes = ["calendar-day", cell.inMonth ? "" : "is-adjacent", cell.isToday ? "is-today" : ""].filter(Boolean).join(" ");
    return `<section class="${classes}" aria-label="${escapeHtml(cell.date)}">
      <div class="calendar-day-heading">
        <span>${cell.day}</span>
        ${cell.isToday ? '<span class="today-badge">OGGI</span>' : ""}
      </div>
      <div class="calendar-events">
        ${events.length ? events.map(eventHtml).join("") : '<span class="calendar-empty">—</span>'}
      </div>
    </section>`;
  }).join("");
}

async function currentUser() {
  const access = await window.CucinaHubAuthGuard.requireAdministrator(client);
  return access.user;
}

async function loadMonth() {
  if (state.busy) return;
  state.busy = true;
  elements.errorPanel.hidden = true;
  setStatus("Caricamento calendario…");
  try {
    const user = await currentUser();
    if (!user) {
      elements.authGate.hidden = false;
      elements.workspace.hidden = true;
      setStatus("Accedi a Cucina Hub per vedere il calendario.", "warning");
      return;
    }
    state.ownerUserId = user.id;
    elements.authGate.hidden = true;
    const range = core.monthGridRange(state.anchor);
    const [recipesResult, mealsResult, prepResult] = await Promise.all([
      client.from("recipes").select("id,title,code").eq("owner_user_id", user.id).order("title"),
      client.from("planned_meals")
        .select("id,recipe_id,planned_date,meal_slot,planned_time,servings,note,planned_meal_items(id,item_type,label,recipe_id,recipe_code,position)")
        .eq("owner_user_id", user.id)
        .gte("planned_date", range.start)
        .lte("planned_date", range.end)
        .order("planned_date")
        .order("planned_time"),
      client.from("meal_prep_tasks")
        .select("id,planned_meal_id,planned_meal_item_id,task_type,title,scheduled_date,scheduled_time,status,storage_method,note")
        .eq("owner_user_id", user.id)
        .gte("scheduled_date", range.start)
        .lte("scheduled_date", range.end)
        .order("scheduled_date")
        .order("scheduled_time")
    ]);
    assertOk(recipesResult.error, "Lettura ricette");
    assertOk(mealsResult.error, "Lettura pasti");
    if (prepResult.error && !isMissingMealPrep(prepResult.error)) assertOk(prepResult.error, "Lettura Meal Prep");

    state.recipes = new Map((recipesResult.data || []).map(recipe => [recipe.id, recipe]));
    state.meals = mealsResult.data || [];
    state.tasks = prepResult.error ? [] : (prepResult.data || []);
    render();
    elements.workspace.hidden = false;
    setStatus(`Calendario aggiornato: ${state.meals.length} pasti e ${state.tasks.length} attività Meal Prep nel periodo visibile.`, "success");
  } catch (error) {
    elements.workspace.hidden = true;
    elements.errorPanel.hidden = false;
    elements.errorMessage.textContent = error.message || "Non è stato possibile caricare il calendario.";
    setStatus("Errore durante il caricamento del calendario.", "error");
  } finally {
    state.busy = false;
  }
}

elements.previous.addEventListener("click", () => { state.anchor = core.shiftMonth(state.anchor, -1); loadMonth(); });
elements.current.addEventListener("click", () => { state.anchor = core.monthAnchor(new Date()); loadMonth(); });
elements.next.addEventListener("click", () => { state.anchor = core.shiftMonth(state.anchor, 1); loadMonth(); });
elements.filter.addEventListener("change", () => { state.filter = elements.filter.value; render(); });
elements.retry.addEventListener("click", loadMonth);

loadMonth();
