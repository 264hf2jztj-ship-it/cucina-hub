"use strict";

const client = window.cucinaHubSupabase;
const core = window.CucinaHubPlannerCore;

const state = {
  ownerUserId: null,
  recipes: [],
  meals: [],
  editingId: null,
  busy: false
};

const elements = {
  status: document.querySelector("#pageStatus"),
  authGate: document.querySelector("#authGate"),
  errorPanel: document.querySelector("#errorPanel"),
  errorMessage: document.querySelector("#errorMessage"),
  retry: document.querySelector("#retryLoad"),
  workspace: document.querySelector("#plannerWorkspace"),
  editor: document.querySelector("#plannerEditor"),
  form: document.querySelector("#mealForm"),
  formTitle: document.querySelector("#formTitle"),
  mealId: document.querySelector("#mealId"),
  date: document.querySelector("#plannedDate"),
  slot: document.querySelector("#mealSlot"),
  time: document.querySelector("#plannedTime"),
  servings: document.querySelector("#servings"),
  recipe: document.querySelector("#recipeId"),
  recipeHelp: document.querySelector("#recipeHelp"),
  note: document.querySelector("#mealNote"),
  save: document.querySelector("#saveMeal"),
  cancel: document.querySelector("#cancelEdit"),
  count: document.querySelector("#mealCount"),
  list: document.querySelector("#mealList")
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
  elements.status.className = `planner-status${type ? ` ${type}` : ""}`;
}

function assertOk(error, context) {
  if (!error) return;
  const wrapped = new Error(`${context}: ${error.message}`);
  wrapped.code = error.code;
  throw wrapped;
}

function formatDate(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function recipeFor(recipeId) {
  return state.recipes.find(recipe => recipe.id === recipeId) ?? null;
}

function recipeLabel(recipe) {
  if (!recipe) return "Ricetta non disponibile";
  return [recipe.code, recipe.title].filter(Boolean).join(" — ") || "Ricetta senza titolo";
}

function updateFormAvailability() {
  elements.save.disabled = state.busy || state.recipes.length === 0;
  elements.cancel.disabled = state.busy;
}

function setBusy(busy) {
  state.busy = busy;
  elements.form.setAttribute("aria-busy", String(busy));
  elements.form.querySelectorAll("input, select, textarea").forEach(field => {
    field.disabled = busy;
  });
  elements.list.querySelectorAll("button").forEach(button => {
    button.disabled = busy;
  });
  updateFormAvailability();
}

function populateRecipes() {
  if (!state.recipes.length) {
    elements.recipe.innerHTML = '<option value="">Nessuna ricetta disponibile</option>';
    elements.recipeHelp.innerHTML = 'Aggiungi prima una ricetta nella <a href="../index.html?v=15&amp;view=recipes">Biblioteca</a>.';
    elements.recipeHelp.classList.add("warning");
    updateFormAvailability();
    return;
  }

  elements.recipe.innerHTML = [
    '<option value="">Seleziona una ricetta…</option>',
    ...state.recipes.map(recipe => `
      <option value="${escapeHtml(recipe.id)}">${escapeHtml(recipeLabel(recipe))}</option>`)
  ].join("");
  elements.recipeHelp.textContent = "Il Planner salverà soltanto il collegamento alla ricetta.";
  elements.recipeHelp.classList.remove("warning");
  updateFormAvailability();
}

function emptyStateHtml() {
  return `
    <div class="planner-empty">
      <span aria-hidden="true">🍽️</span>
      <h3>Nessun pasto pianificato</h3>
      <p>Scegli una ricetta e aggiungi il primo pasto. Qui comparirà il tuo programma in ordine di data.</p>
    </div>`;
}

function mealCard(meal) {
  const slot = core.MEAL_SLOTS[meal.meal_slot] ?? core.MEAL_SLOTS.other;
  const recipe = recipeFor(meal.recipe_id);
  const time = core.normalizeTime(meal.planned_time);
  return `
    <article class="meal-card">
      <span class="meal-icon" aria-hidden="true">${escapeHtml(slot.icon)}</span>
      <div class="meal-content">
        <div class="meal-heading">
          <div>
            <span class="badge">${escapeHtml(slot.label)}</span>
            <h4>${escapeHtml(recipeLabel(recipe))}</h4>
          </div>
          ${time ? `<time class="meal-time" datetime="${escapeHtml(time)}">${escapeHtml(time)}</time>` : ""}
        </div>
        ${meal.servings ? `<div class="meal-meta"><span class="badge pending">${escapeHtml(meal.servings)} ${meal.servings === 1 ? "porzione" : "porzioni"}</span></div>` : ""}
        ${meal.note ? `<p class="meal-note">${escapeHtml(meal.note)}</p>` : ""}
        <div class="meal-actions">
          <button class="button secondary" type="button" data-action="edit" data-meal-id="${escapeHtml(meal.id)}">MODIFICA</button>
          <button class="button danger" type="button" data-action="delete" data-meal-id="${escapeHtml(meal.id)}">ELIMINA</button>
        </div>
      </div>
    </article>`;
}

function renderMeals() {
  elements.count.textContent = String(state.meals.length);
  if (!state.meals.length) {
    elements.list.innerHTML = emptyStateHtml();
    return;
  }

  elements.list.innerHTML = core.groupEntriesByDate(state.meals).map(group => `
    <section class="meal-day" aria-labelledby="day-${escapeHtml(group.date)}">
      <div class="meal-day-heading">
        <h3 id="day-${escapeHtml(group.date)}">${escapeHtml(formatDate(group.date))}</h3>
        <span class="badge pending">${group.entries.length} ${group.entries.length === 1 ? "pasto" : "pasti"}</span>
      </div>
      ${group.entries.map(mealCard).join("")}
    </section>`).join("");
}

function resetForm() {
  state.editingId = null;
  elements.mealId.value = "";
  elements.form.reset();
  elements.date.value = core.localDateValue();
  elements.slot.value = "dinner";
  elements.formTitle.textContent = "Pianifica un pasto";
  elements.save.textContent = "AGGIUNGI AL PLANNER";
  elements.cancel.hidden = true;
  updateFormAvailability();
}

function editMeal(mealId) {
  const meal = state.meals.find(item => item.id === mealId);
  if (!meal) return;

  state.editingId = meal.id;
  elements.mealId.value = meal.id;
  elements.date.value = meal.planned_date;
  elements.slot.value = meal.meal_slot;
  elements.time.value = core.normalizeTime(meal.planned_time) ?? "";
  elements.servings.value = meal.servings ?? "";
  elements.recipe.value = meal.recipe_id;
  elements.note.value = meal.note ?? "";
  elements.formTitle.textContent = "Modifica il pasto";
  elements.save.textContent = "SALVA MODIFICHE";
  elements.cancel.hidden = false;
  elements.editor.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => elements.date.focus(), 250);
}

function friendlyWriteError(error) {
  if (error.code === "23505") {
    return "Questa ricetta è già pianificata nella stessa data, fascia e orario.";
  }
  if (error.code === "23503") {
    return "La ricetta collegata non è più disponibile. Ricarica il Planner e scegline un’altra.";
  }
  return error.message;
}

async function loadData() {
  const [recipesResult, mealsResult] = await Promise.all([
    client
      .from("recipes")
      .select("id,code,title")
      .eq("owner_user_id", state.ownerUserId)
      .order("title", { ascending: true }),
    client
      .from("planned_meals")
      .select("*")
      .eq("owner_user_id", state.ownerUserId)
      .order("planned_date", { ascending: true })
  ]);

  assertOk(recipesResult.error, "Lettura ricette");
  assertOk(mealsResult.error, "Lettura pasti pianificati");
  state.recipes = recipesResult.data ?? [];
  state.meals = mealsResult.data ?? [];
}

async function reloadMeals() {
  const { data, error } = await client
    .from("planned_meals")
    .select("*")
    .eq("owner_user_id", state.ownerUserId)
    .order("planned_date", { ascending: true });
  assertOk(error, "Aggiornamento pasti pianificati");
  state.meals = data ?? [];
  renderMeals();
}

async function saveMeal(event) {
  event.preventDefault();
  if (state.busy) return;

  const candidate = core.normalizeEntry({
    recipe_id: elements.recipe.value,
    planned_date: elements.date.value,
    meal_slot: elements.slot.value,
    planned_time: elements.time.value,
    servings: elements.servings.value,
    note: elements.note.value
  });

  if (!candidate.valid) {
    setStatus(candidate.errors.join(" "), "error");
    return;
  }

  const wasEditing = Boolean(state.editingId);
  const payload = {
    ...candidate.value,
    owner_user_id: state.ownerUserId,
    updated_at: new Date().toISOString()
  };

  setBusy(true);
  setStatus(wasEditing ? "Salvataggio delle modifiche…" : "Aggiunta del pasto…");

  try {
    const result = wasEditing
      ? await client
        .from("planned_meals")
        .update(payload)
        .eq("id", state.editingId)
        .eq("owner_user_id", state.ownerUserId)
        .select("id")
        .single()
      : await client
        .from("planned_meals")
        .insert(payload)
        .select("id")
        .single();

    assertOk(result.error, wasEditing ? "Modifica pasto" : "Creazione pasto");
    await reloadMeals();
    resetForm();
    setStatus(wasEditing ? "Pasto aggiornato correttamente." : "Pasto aggiunto al Planner.", "ok");
  } catch (error) {
    setStatus(friendlyWriteError(error), "error");
  } finally {
    setBusy(false);
  }
}

async function deleteMeal(mealId) {
  const meal = state.meals.find(item => item.id === mealId);
  if (!meal || state.busy) return;
  const recipe = recipeFor(meal.recipe_id);
  const confirmed = window.confirm(`Eliminare ${recipeLabel(recipe)} dal ${formatDate(meal.planned_date)}?`);
  if (!confirmed) return;

  setBusy(true);
  setStatus("Eliminazione del pasto…");
  try {
    const { error } = await client
      .from("planned_meals")
      .delete()
      .eq("id", meal.id)
      .eq("owner_user_id", state.ownerUserId);
    assertOk(error, "Eliminazione pasto");
    state.meals = state.meals.filter(item => item.id !== meal.id);
    if (state.editingId === meal.id) resetForm();
    renderMeals();
    setStatus("Pasto eliminato dal Planner.", "ok");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

function showFatalError(error) {
  elements.workspace.hidden = true;
  elements.errorPanel.hidden = false;
  elements.errorMessage.textContent = `${error.message}. Verifica di avere applicato la migration 040_planner_core.sql, poi riprova.`;
  setStatus("Caricamento non riuscito.", "error");
}

async function initialize() {
  elements.authGate.hidden = true;
  elements.errorPanel.hidden = true;
  elements.workspace.hidden = true;

  if (!client || !core) {
    showFatalError(new Error("Il collegamento a Supabase o il modulo Planner Core non è disponibile"));
    return;
  }

  setStatus("Caricamento del Planner…");
  try {
    const { data, error } = await client.auth.getSession();
    assertOk(error, "Lettura sessione");
    const user = data.session?.user;
    if (!user) {
      elements.authGate.hidden = false;
      setStatus("Sessione non disponibile.", "error");
      return;
    }

    state.ownerUserId = user.id;
    await loadData();
    populateRecipes();
    renderMeals();
    resetForm();
    elements.workspace.hidden = false;
    setStatus(
      state.recipes.length
        ? "Planner pronto. I pasti sono collegati alle ricette della tua Biblioteca."
        : "Planner pronto, ma la Biblioteca non contiene ricette selezionabili.",
      state.recipes.length ? "ok" : "warning"
    );
  } catch (error) {
    showFatalError(error);
  }
}

elements.form.addEventListener("submit", saveMeal);
elements.cancel.addEventListener("click", () => {
  resetForm();
  setStatus("Modifica annullata.");
});
elements.list.addEventListener("click", event => {
  const button = event.target.closest("button[data-action][data-meal-id]");
  if (!button) return;
  if (button.dataset.action === "edit") editMeal(button.dataset.mealId);
  if (button.dataset.action === "delete") void deleteMeal(button.dataset.mealId);
});
elements.retry.addEventListener("click", () => void initialize());

void initialize();
