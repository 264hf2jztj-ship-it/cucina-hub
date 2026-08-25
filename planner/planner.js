"use strict";

const client = window.cucinaHubSupabase;
const core = window.CucinaHubPlannerCore;
const mealPrepCore = window.CucinaHubMealPrepCore;
const shoppingListCore = window.CucinaHubShoppingListCore;
const menuPlanEngine = window.CucinaHubMenuPlanImportEngine;

const state = {
  ownerUserId: null,
  recipes: [],
  meals: [],
  mealPrepTasks: [],
  mealPrepAvailable: true,
  mealPrepError: null,
  mealPrepEditingId: null,
  shoppingListItems: [],
  shoppingListAvailable: true,
  shoppingListError: null,
  shoppingListFilter: "active",
  weekAnchor: null,
  editingId: null,
  menuAnalysisResult: null,
  menuResolutionSelections: Object.create(null),
  menuCommitResult: null,
  menuCommitError: null,
  menuAnalyzing: false,
  menuCommitting: false,
  menuPreviewRequests: [],
  menuPreviewLoading: false,
  menuPreviewAvailable: true,
  menuPreviewError: null,
  menuStaging: false,
  activeMenuPreviewRequestId: null,
  busy: false
};

const elements = {
  status: document.querySelector("#pageStatus"),
  authGate: document.querySelector("#authGate"),
  errorPanel: document.querySelector("#errorPanel"),
  errorMessage: document.querySelector("#errorMessage"),
  retry: document.querySelector("#retryLoad"),
  workspace: document.querySelector("#plannerWorkspace"),
  weekCount: document.querySelector("#weekMealCount"),
  weekRange: document.querySelector("#weekRange"),
  weekEmpty: document.querySelector("#weekEmptySummary"),
  weekGrid: document.querySelector("#weekGrid"),
  previousWeek: document.querySelector("#previousWeek"),
  currentWeek: document.querySelector("#currentWeek"),
  nextWeek: document.querySelector("#nextWeek"),
  shoppingListPanel: document.querySelector("#shoppingListPanel"),
  shoppingListCount: document.querySelector("#shoppingListCount"),
  shoppingListActiveCount: document.querySelector("#shoppingListActiveCount"),
  shoppingListCheckedCount: document.querySelector("#shoppingListCheckedCount"),
  shoppingListExcludedCount: document.querySelector("#shoppingListExcludedCount"),
  shoppingListStatus: document.querySelector("#shoppingListStatus"),
  shoppingListUnavailable: document.querySelector("#shoppingListUnavailable"),
  shoppingListBody: document.querySelector("#shoppingListBody"),
  shoppingListWeekRange: document.querySelector("#shoppingListWeekRange"),
  shoppingListRefresh: document.querySelector("#refreshShoppingList"),
  shoppingListForm: document.querySelector("#shoppingListForm"),
  shoppingItemName: document.querySelector("#shoppingItemName"),
  shoppingItemQuantity: document.querySelector("#shoppingItemQuantity"),
  shoppingItemUnit: document.querySelector("#shoppingItemUnit"),
  shoppingItemCategory: document.querySelector("#shoppingItemCategory"),
  shoppingItemNote: document.querySelector("#shoppingItemNote"),
  shoppingItemAdd: document.querySelector("#addShoppingItem"),
  shoppingListFilter: document.querySelector("#shoppingListFilter"),
  shoppingListItems: document.querySelector("#shoppingListItems"),
  mealPrepPanel: document.querySelector("#mealPrepPanel"),
  mealPrepCount: document.querySelector("#mealPrepCount"),
  mealPrepTodoCount: document.querySelector("#mealPrepTodoCount"),
  mealPrepProgressCount: document.querySelector("#mealPrepProgressCount"),
  mealPrepDoneCount: document.querySelector("#mealPrepDoneCount"),
  mealPrepStatus: document.querySelector("#mealPrepStatus"),
  mealPrepUnavailable: document.querySelector("#mealPrepUnavailable"),
  mealPrepBody: document.querySelector("#mealPrepBody"),
  mealPrepEditor: document.querySelector("#mealPrepEditor"),
  mealPrepForm: document.querySelector("#mealPrepForm"),
  mealPrepFormTitle: document.querySelector("#mealPrepFormTitle"),
  mealPrepTaskId: document.querySelector("#mealPrepTaskId"),
  mealPrepMealId: document.querySelector("#mealPrepMealId"),
  mealPrepItemId: document.querySelector("#mealPrepItemId"),
  mealPrepType: document.querySelector("#mealPrepType"),
  mealPrepTaskTitle: document.querySelector("#mealPrepTaskTitle"),
  mealPrepDate: document.querySelector("#mealPrepDate"),
  mealPrepTime: document.querySelector("#mealPrepTime"),
  mealPrepServings: document.querySelector("#mealPrepServings"),
  mealPrepQuantity: document.querySelector("#mealPrepQuantity"),
  mealPrepUnit: document.querySelector("#mealPrepUnit"),
  mealPrepStorage: document.querySelector("#mealPrepStorage"),
  mealPrepStorageNote: document.querySelector("#mealPrepStorageNote"),
  mealPrepNote: document.querySelector("#mealPrepNote"),
  mealPrepSave: document.querySelector("#saveMealPrepTask"),
  mealPrepCancel: document.querySelector("#cancelMealPrepEdit"),
  mealPrepList: document.querySelector("#mealPrepList"),
  menuInput: document.querySelector("#menuPlanInput"),
  menuFile: document.querySelector("#menuPlanFile"),
  menuFileStatus: document.querySelector("#menuPlanFileStatus"),
  menuPreviewCount: document.querySelector("#menuPreviewCount"),
  menuPreviewRefresh: document.querySelector("#refreshMenuPreviews"),
  menuPreviewInbox: document.querySelector("#menuPreviewInbox"),
  menuStage: document.querySelector("#stageMenuPlan"),
  menuAnalyze: document.querySelector("#analyzeMenuPlan"),
  menuClear: document.querySelector("#clearMenuPlan"),
  menuResult: document.querySelector("#menuPlanResult"),
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

function dateAtNoon(value) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatWeekRange(startDate, endDate) {
  const start = dateAtNoon(startDate);
  const end = dateAtNoon(endDate);
  if (!start || !end) return "Settimana non disponibile";

  const startLabel = new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short"
  }).format(start);
  const endLabel = new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(end);
  return `${startLabel} – ${endLabel}`;
}

function formatWeekDay(value) {
  const date = dateAtNoon(value);
  if (!date) return { name: value, date: value };
  return {
    name: new Intl.DateTimeFormat("it-IT", { weekday: "short" }).format(date),
    date: new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" }).format(date)
  };
}

function recipeFor(recipeId) {
  return state.recipes.find(recipe => recipe.id === recipeId) ?? null;
}

function recipeLabel(recipe) {
  if (!recipe) return "Ricetta non disponibile";
  return [recipe.code, recipe.title].filter(Boolean).join(" — ") || "Ricetta senza titolo";
}

function mealItems(meal) {
  return (Array.isArray(meal?.planned_meal_items) ? meal.planned_meal_items : [])
    .slice()
    .sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0));
}

function mealItemLabel(item) {
  if (item?.item_type === "recipe") {
    const recipe = recipeFor(item.recipe_id);
    return recipe
      ? recipeLabel(recipe)
      : [item.recipe_code, item.label].filter(Boolean).join(" — ") || "Ricetta non disponibile";
  }
  return item?.label || "Elemento senza nome";
}

function mealDisplayLabel(meal) {
  const items = mealItems(meal);
  if (!items.length) return recipeLabel(recipeFor(meal.recipe_id));
  const labels = items.map(mealItemLabel);
  return labels.length > 2
    ? `${labels.slice(0, 2).join(" · ")} +${labels.length - 2}`
    : labels.join(" · ");
}

function mealItemsHtml(meal) {
  const items = mealItems(meal);
  if (!items.length) return "";
  return `<div class="meal-item-list">${items.map(item => `
    <div class="meal-item-row">
      <span class="badge${item.item_type === "recipe" ? "" : " pending"}">${escapeHtml(item.item_type === "recipe" ? "RICETTA" : item.item_type === "food" ? "ALIMENTO" : "PREPARAZIONE")}</span>
      <strong>${escapeHtml(mealItemLabel(item))}</strong>
      ${item.quantity !== null && item.quantity !== undefined
        ? `<span>${escapeHtml(item.quantity)}${item.unit ? ` ${escapeHtml(item.unit)}` : ""}</span>`
        : ""}
    </div>`).join("")}</div>`;
}

function mealFor(mealId) {
  return state.meals.find(meal => meal.id === mealId) ?? null;
}

function mealItemFor(meal, itemId) {
  return mealItems(meal).find(item => item.id === itemId) ?? null;
}

function mealPrepMealLabel(meal) {
  if (!meal) return "Pasto non disponibile";
  const slot = core.MEAL_SLOTS[meal.meal_slot] ?? core.MEAL_SLOTS.other;
  return `${formatDate(meal.planned_date)} · ${slot.label} · ${mealDisplayLabel(meal)}`;
}

function setMealPrepStatus(message = "", type = "") {
  elements.mealPrepStatus.textContent = message;
  elements.mealPrepStatus.className = `meal-prep-status${type ? ` ${type}` : ""}`;
}

function isMissingMealPrepTable(error) {
  if (!error) return false;
  return ["42P01", "PGRST204", "PGRST205"].includes(error.code)
    || /meal_prep_tasks|schema cache|could not find the table/i.test(error.message ?? "");
}

function setShoppingListStatus(message = "", type = "") {
  elements.shoppingListStatus.textContent = message;
  elements.shoppingListStatus.className = `shopping-list-status${type ? ` ${type}` : ""}`;
}

function isMissingShoppingListSchema(error) {
  if (!error) return false;
  return ["42P01", "PGRST202", "PGRST204", "PGRST205"].includes(error.code)
    || /shopping_list_items|refresh_weekly_shopping_list|schema cache|could not find the (?:table|function)/i.test(error.message ?? "");
}

function formatMealPrepQuantity(task) {
  if (task.quantity === null || task.quantity === undefined) return null;
  const quantity = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3 }).format(Number(task.quantity));
  return `${quantity} ${task.unit ?? ""}`.trim();
}

function menuImportIdleHtml(message = "Nessun pacchetto analizzato.") {
  return `
    <div class="menu-import-idle">
      <strong>${escapeHtml(message)}</strong>
      <span>Analisi e anteprima non salvano dati. Il commit avviene soltanto dopo la tua conferma esplicita.</span>
    </div>`;
}

function menuImportIssueHtml(item) {
  const severity = item.severity === "warning" ? "warning" : "error";
  return `
    <div class="menu-import-issue ${severity}">
      <strong>${escapeHtml(item.message)}</strong>
      <code>${escapeHtml(item.code)} · ${escapeHtml(item.path)}</code>
    </div>`;
}

function menuReferenceHtml(reference, resolutionPlan = null) {
  const mappedConflict = resolutionPlan?.conflicts?.find(conflict => conflict.path === reference.path);
  const mapping = mappedConflict?.decision?.choice?.action === "map_recipe"
    ? mappedConflict.decision.choice
    : null;
  const isResolved = reference.status === "resolved" || Boolean(mapping);
  const badge = mapping
    ? '<span class="badge">MAPPATA</span>'
    : isResolved
    ? '<span class="badge">RISOLTA</span>'
    : reference.status === "missing_library_reference"
      ? '<span class="badge pending">MANCANTE</span>'
      : '<span class="badge pending">AMBIGUA</span>';
  const title = mapping
    ? recipeLabel({ code: mapping.recipe_code, title: mapping.recipe_title })
    : isResolved
    ? recipeLabel(reference.recipe)
    : reference.label || reference.recipe_code || "Riferimento senza nome";
  const candidates = Array.isArray(reference.candidates) && reference.candidates.length
    ? `<span class="menu-reference-meta">Corrispondenze: ${reference.candidates.map(recipe => escapeHtml(recipeLabel(recipe))).join("; ")}</span>`
    : "";

  return `
    <div class="menu-reference ${isResolved ? "resolved" : "unresolved"}">
      <div class="menu-reference-heading">
        <div>
          <span class="menu-reference-code">${escapeHtml(reference.recipe_code)}</span>
          <strong>${escapeHtml(title)}</strong>
        </div>
        <div>
          ${reference.is_hurom_reference ? '<span class="badge pending">HUROM</span>' : ""}
          ${badge}
        </div>
      </div>
      <span class="menu-reference-meta">${escapeHtml(mapping ? "mapped" : reference.status)} · ${escapeHtml(reference.meal_key)} · ${escapeHtml(reference.path)}</span>
      ${candidates}
    </div>`;
}

function menuImportStatsHtml(summary = {}) {
  const stats = [
    ["Giorni", summary.days ?? 0],
    ["Pasti", summary.meals ?? 0],
    ["Elementi", summary.items ?? 0],
    ["Ricette", summary.recipes ?? 0],
    ["Alimenti", summary.foods ?? 0],
    ["Preparazioni", summary.preparations ?? 0]
  ];
  return `<div class="menu-import-stats">${stats.map(([label, value]) => `
    <div class="menu-import-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>`;
}

function formatMenuPreviewTimestamp(value) {
  if (!value) return "data non disponibile";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function menuPreviewRequestHtml(request) {
  const title = request.title || request.source_external_id || "Menu senza titolo";
  const statusLabel = request.status === "opened" ? "APERTA" : "NUOVA";
  const period = request.period_start === request.period_end
    ? formatDate(request.period_start)
    : `${formatDate(request.period_start)} → ${formatDate(request.period_end)}`;
  return `
    <article class="menu-preview-request" data-menu-preview-request-id="${escapeHtml(request.id)}">
      <div class="menu-preview-request-heading">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <code>${escapeHtml(request.source_external_id)} · rev. ${escapeHtml(request.source_revision)}</code>
        </div>
        <span class="badge${request.status === "opened" ? "" : " pending"}">${statusLabel}</span>
      </div>
      <div class="menu-preview-request-meta">
        <span>${escapeHtml(period)}</span>
        <span>${escapeHtml(request.source_label)}</span>
        <span>Ricevuta ${escapeHtml(formatMenuPreviewTimestamp(request.created_at))}</span>
      </div>
      <div class="menu-preview-request-actions">
        <button class="button" type="button" data-menu-preview-action="open" data-menu-preview-id="${escapeHtml(request.id)}">APRI E ANALIZZA</button>
        <button class="button secondary" type="button" data-menu-preview-action="cancel" data-menu-preview-id="${escapeHtml(request.id)}">ANNULLA RICHIESTA</button>
      </div>
    </article>`;
}

function renderMenuPreviewInbox() {
  elements.menuPreviewCount.textContent = String(state.menuPreviewRequests.length);
  elements.menuPreviewCount.className = `badge${state.menuPreviewRequests.length ? "" : " pending"}`;
  elements.menuPreviewInbox.setAttribute("aria-busy", String(state.menuPreviewLoading));

  if (state.menuPreviewLoading) {
    elements.menuPreviewInbox.innerHTML = `
      <div class="menu-preview-inbox-empty">
        <strong>Controllo delle richieste in corso…</strong>
        <span>Nessun dato viene attivato durante la lettura.</span>
      </div>`;
    return;
  }

  if (!state.menuPreviewAvailable) {
    elements.menuPreviewInbox.innerHTML = `
      <div class="menu-preview-inbox-empty warning">
        <strong>Staging diretto non ancora disponibile</strong>
        <span>${escapeHtml(state.menuPreviewError || "Applica la migration 044_planner_menu_preview_staging.sql.")}</span>
      </div>`;
    return;
  }

  if (!state.menuPreviewRequests.length) {
    elements.menuPreviewInbox.innerHTML = `
      <div class="menu-preview-inbox-empty">
        <strong>Nessuna anteprima in attesa.</strong>
        <span>Quando l’endpoint riceverà un menu, comparirà qui senza modificare il Planner.</span>
      </div>`;
    return;
  }

  elements.menuPreviewInbox.innerHTML = state.menuPreviewRequests.map(menuPreviewRequestHtml).join("");
}

function menuPreviewSchemaMessage(error) {
  const code = String(error?.code ?? "");
  if (["42P01", "PGRST200", "PGRST205"].includes(code) || /planner_menu_import_requests/i.test(error?.message ?? "")) {
    return "Applica la migration 044_planner_menu_preview_staging.sql e poi tocca AGGIORNA.";
  }
  return `Lettura non riuscita: ${error?.message || "errore tecnico inatteso"}`;
}

function updateMenuPreviewControls() {
  elements.menuPreviewRefresh.disabled = state.busy || state.menuPreviewLoading || state.menuStaging;
  elements.menuStage.disabled = state.busy || state.menuAnalyzing || state.menuStaging || !menuPlanEngine;
}

async function loadMenuPreviewRequests({ announce = false } = {}) {
  if (!state.ownerUserId || state.menuPreviewLoading) return false;
  state.menuPreviewLoading = true;
  renderMenuPreviewInbox();
  updateMenuPreviewControls();

  try {
    const { data, error } = await client
      .from("planner_menu_import_requests")
      .select("id,source_type,source_external_id,source_revision,source_label,title,period_start,period_end,payload_hash,packet,status,opened_at,created_at,updated_at")
      .eq("owner_user_id", state.ownerUserId)
      .in("status", ["pending", "opened"])
      .order("created_at", { ascending: false });
    assertOk(error, "Lettura anteprime ricevute");
    state.menuPreviewRequests = data ?? [];
    state.menuPreviewAvailable = true;
    state.menuPreviewError = null;
    if (announce) {
      setStatus(
        state.menuPreviewRequests.length
          ? `${state.menuPreviewRequests.length} ${state.menuPreviewRequests.length === 1 ? "anteprima ricevuta" : "anteprime ricevute"} in attesa.`
          : "Nessuna anteprima ricevuta in attesa.",
        "ok"
      );
    }
    return true;
  } catch (error) {
    state.menuPreviewRequests = [];
    state.menuPreviewAvailable = false;
    state.menuPreviewError = menuPreviewSchemaMessage(error);
    if (announce) setStatus(state.menuPreviewError, "warning");
    return false;
  } finally {
    state.menuPreviewLoading = false;
    renderMenuPreviewInbox();
    updateMenuPreviewControls();
  }
}

async function readableFunctionError(error, fallbackData = null) {
  let details = fallbackData;
  const response = error?.context;
  if (!details && response && typeof response.clone === "function") {
    try {
      details = await response.clone().json();
    } catch {
      details = null;
    }
  }
  const wrapped = new Error(details?.message || error?.message || "Invio all’endpoint non riuscito.");
  wrapped.code = details?.error || error?.code || "EDGE_FUNCTION_ERROR";
  return wrapped;
}

async function stageMenuPlan() {
  if (!menuPlanEngine || state.busy || state.menuAnalyzing || state.menuStaging) return;

  let validation;
  try {
    validation = menuPlanEngine.validatePacket(menuPlanEngine.parse(elements.menuInput.value).packet);
  } catch {
    await analyzeMenuPlan();
    return;
  }

  if (!validation.valid) {
    await analyzeMenuPlan();
    return;
  }
  if (validation.normalizedPacket.menu.source.type !== "chatgpt_project") {
    setStatus("L’endpoint diretto richiede menu.source.type = chatgpt_project. Nessuna richiesta creata.", "warning");
    return;
  }

  state.menuStaging = true;
  updateMenuPreviewControls();
  setStatus("Invio autenticato allo staging personale…");

  try {
    const { data, error } = await client.functions.invoke("planner-menu-preview", {
      body: { packet: validation.normalizedPacket }
    });
    if (error) throw await readableFunctionError(error, data);
    if (!data?.ok || !data?.state) throw new Error("L’endpoint non ha restituito un esito verificabile.");

    await loadMenuPreviewRequests();
    if (data.state === "already_committed") {
      setStatus("Il menu risulta già confermato: nessun duplicato e nessuna nuova richiesta.", "warning");
    } else if (data.state === "already_staged") {
      setStatus("La stessa anteprima era già in attesa: nessun duplicato creato.", "ok");
    } else if (data.state === "reopened") {
      setStatus("Richiesta riaperta nello staging. Ora puoi aprirla e analizzarla.", "ok");
    } else {
      setStatus("Richiesta ricevuta nello staging. Nessun pasto è stato ancora salvato.", "ok");
    }
    elements.menuPreviewInbox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    const migrationHint = error.code === "preview_staging_unavailable"
      ? " Applica prima la migration 044_planner_menu_preview_staging.sql."
      : "";
    setStatus(`${error.message}${migrationHint} Nessun dato è stato salvato.`, "error");
  } finally {
    state.menuStaging = false;
    updateMenuPreviewControls();
  }
}

async function openMenuPreviewRequest(requestId) {
  const request = state.menuPreviewRequests.find(item => item.id === requestId);
  if (!request || state.busy || state.menuPreviewLoading) return;
  setBusy(true);
  setStatus("Apertura dell’anteprima ricevuta…");

  try {
    const { error } = await client.rpc("update_planner_menu_preview_request", {
      p_request_id: request.id,
      p_action: "open"
    });
    assertOk(error, "Apertura anteprima");

    state.activeMenuPreviewRequestId = request.id;
    state.menuAnalysisResult = null;
    state.menuResolutionSelections = Object.create(null);
    state.menuCommitResult = null;
    state.menuCommitError = null;
    elements.menuInput.value = JSON.stringify(request.packet, null, 2);
    elements.menuFile.value = "";
    elements.menuResult.innerHTML = menuImportIdleHtml("Richiesta caricata: avvio dell’analisi…");
    request.status = "opened";
    renderMenuPreviewInbox();
  } catch (error) {
    setStatus(`${error.message}. Nessun dato è stato modificato.`, "error");
    await loadMenuPreviewRequests();
    return;
  } finally {
    setBusy(false);
  }

  await analyzeMenuPlan();
}

async function cancelMenuPreviewRequest(requestId) {
  const request = state.menuPreviewRequests.find(item => item.id === requestId);
  if (!request || state.busy || state.menuPreviewLoading) return;
  const confirmed = window.confirm(`Annullare la richiesta “${request.title || request.source_external_id}”? Il Planner non verrà modificato.`);
  if (!confirmed) return;

  setBusy(true);
  setStatus("Annullamento della richiesta in corso…");
  try {
    const { error } = await client.rpc("update_planner_menu_preview_request", {
      p_request_id: request.id,
      p_action: "cancel"
    });
    assertOk(error, "Annullamento anteprima");
    state.menuPreviewRequests = state.menuPreviewRequests.filter(item => item.id !== request.id);
    if (state.activeMenuPreviewRequestId === request.id) resetMenuImport();
    renderMenuPreviewInbox();
    setStatus("Richiesta annullata. Nessun pasto è stato salvato o modificato.", "ok");
  } catch (error) {
    setStatus(`${error.message}. Nessun dato è stato modificato.`, "error");
    await loadMenuPreviewRequests();
  } finally {
    setBusy(false);
  }
}

function handleMenuPreviewInboxClick(event) {
  const button = event.target.closest?.("button[data-menu-preview-action][data-menu-preview-id]");
  if (!button) return;
  if (button.dataset.menuPreviewAction === "open") void openMenuPreviewRequest(button.dataset.menuPreviewId);
  if (button.dataset.menuPreviewAction === "cancel") void cancelMenuPreviewRequest(button.dataset.menuPreviewId);
}

function menuPreviewQuantityHtml(item) {
  if (item.quantity === null || item.quantity === undefined) return "";
  return `<span>${escapeHtml(item.quantity)}${item.unit ? ` ${escapeHtml(item.unit)}` : ""}</span>`;
}

function menuPreviewItemHtml(item) {
  const typeLabels = {
    recipe: "RICETTA",
    food: "ALIMENTO",
    preparation: "PREPARAZIONE"
  };
  const reference = item.recipe_reference;
  const referenceHtml = reference
    ? `<div class="menu-preview-reference ${reference.status}">
        <span>Codice <code>${escapeHtml(reference.recipe_code)}</code></span>
        <span>${reference.status === "mapped" ? "Mappata a" : reference.status === "resolved" ? "Collegata a" : "Da risolvere"}
          <strong>${escapeHtml(reference.recipe_title || "ricetta non associata")}</strong>
        </span>
      </div>`
    : "";
  const ingredients = item.ingredients.length
    ? `<div class="menu-preview-detail">
        <strong>Ingredienti</strong>
        <ul>${item.ingredients.map(ingredient => `
          <li>${escapeHtml(ingredient.name)}${ingredient.quantity !== undefined && ingredient.quantity !== null
            ? ` — ${escapeHtml(ingredient.quantity)}${ingredient.unit ? ` ${escapeHtml(ingredient.unit)}` : ""}`
            : ""}</li>`).join("")}</ul>
      </div>`
    : "";
  const procedure = item.procedure.length
    ? `<div class="menu-preview-detail">
        <strong>Procedimento</strong>
        <ol>${item.procedure.map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
      </div>`
    : "";

  return `
    <article class="menu-preview-item">
      <div class="menu-preview-item-heading">
        <div>
          <span class="badge${item.type === "recipe" ? "" : " pending"}">${escapeHtml(typeLabels[item.type] || item.type)}</span>
          ${reference?.is_hurom_reference ? '<span class="badge pending">HUROM</span>' : ""}
          ${item.conflict_count ? `<span class="badge pending">${escapeHtml(item.conflict_count)} ${item.conflict_count === 1 ? "CONFLITTO" : "CONFLITTI"}</span>` : ""}
        </div>
        ${menuPreviewQuantityHtml(item)}
      </div>
      <h5>${escapeHtml(item.label)}</h5>
      ${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}
      ${referenceHtml}
      ${ingredients}
      ${procedure}
    </article>`;
}

function menuPreviewMealHtml(meal) {
  const slot = core.MEAL_SLOTS[meal.slot] ?? core.MEAL_SLOTS.other;
  const meta = [
    meal.time ? `ore ${meal.time}` : null,
    meal.servings ? `${meal.servings} ${meal.servings === 1 ? "porzione" : "porzioni"}` : null
  ].filter(Boolean);

  return `
    <section class="menu-preview-meal">
      <div class="menu-preview-meal-heading">
        <div>
          <span class="menu-preview-meal-icon" aria-hidden="true">${escapeHtml(slot.icon)}</span>
          <div>
            <h4>${escapeHtml(slot.label)}</h4>
            ${meta.length ? `<span>${escapeHtml(meta.join(" · "))}</span>` : ""}
          </div>
        </div>
        ${meal.conflict_count ? `<span class="badge pending">${escapeHtml(meal.conflict_count)} ${meal.conflict_count === 1 ? "CONFLITTO" : "CONFLITTI"}</span>` : ""}
      </div>
      ${meal.note ? `<p class="menu-preview-meal-note">${escapeHtml(meal.note)}</p>` : ""}
      <div class="menu-preview-items">${meal.items.map(menuPreviewItemHtml).join("")}</div>
    </section>`;
}

function menuFullPreviewHtml(preview) {
  const menu = preview.menu ?? {};
  return `
    <section class="menu-import-section menu-full-preview" aria-label="Anteprima completa del menu">
      <div class="menu-preview-title">
        <div>
          <p class="eyebrow">Anteprima completa</p>
          <h3>${escapeHtml(menu.title || menu.external_id || "Menu senza titolo")}</h3>
        </div>
        <span class="badge pending">REVISIONE ${escapeHtml(menu.revision ?? "—")}</span>
      </div>
      <div class="menu-preview-meta">
        <span>Periodo <strong>${escapeHtml(menu.period_start)} – ${escapeHtml(menu.period_end)}</strong></span>
        <span>Origine <strong>${escapeHtml(menu.source_label || menu.source_type || "—")}</strong></span>
        <span>${escapeHtml(preview.hurom_references)} riferimenti Hurom</span>
        <span>${escapeHtml(preview.autonomous_items)} elementi autonomi</span>
      </div>
      <div class="menu-preview-days">${preview.days.map(day => `
        <article class="menu-preview-day">
          <div class="menu-preview-day-heading">
            <h4>${escapeHtml(formatDate(day.date))}</h4>
            <span class="badge">${escapeHtml(day.meals.length)} ${day.meals.length === 1 ? "PASTO" : "PASTI"}</span>
          </div>
          <div class="menu-preview-meals">${day.meals.map(menuPreviewMealHtml).join("")}</div>
        </article>`).join("")}</div>
    </section>`;
}

function menuIdempotencyHtml(check) {
  const presentations = {
    new_menu: {
      tone: "ok",
      badge: "NUOVO PACCHETTO",
      title: "Identità disponibile",
      message: "Non risultano pacchetti precedenti con questa sorgente e questo identificativo."
    },
    new_revision: {
      tone: "ok",
      badge: "NUOVA REVISIONE",
      title: "Revisione successiva riconosciuta",
      message: `La revisione ${check.identity?.source_revision} è successiva alla ${check.latest?.source_revision}.`
    },
    already_imported: {
      tone: "warning",
      badge: "RETRY BLOCCATO",
      title: "Pacchetto già noto",
      message: check.issue?.message
    },
    same_revision_payload_mismatch: {
      tone: "error",
      badge: "CONFLITTO HASH",
      title: "Stessa revisione, contenuto diverso",
      message: check.issue?.message
    },
    stale_revision: {
      tone: "error",
      badge: "REVISIONE SUPERATA",
      title: "È già presente una revisione più recente",
      message: check.issue?.message
    },
    existing_revision_without_hash: {
      tone: "error",
      badge: "VERIFICA MANUALE",
      title: "Revisione esistente senza hash",
      message: check.issue?.message
    },
    invalid_payload_hash: {
      tone: "error",
      badge: "HASH NON VALIDO",
      title: "Impossibile verificare il pacchetto",
      message: check.issue?.message
    },
    check_unavailable: {
      tone: "error",
      badge: "CONTROLLO NON DISPONIBILE",
      title: "Il registro dei pacchetti non è leggibile",
      message: check.issue?.message
    }
  };
  const presentation = presentations[check.status] ?? presentations.check_unavailable;
  const identity = check.identity ?? {};
  const existingStatus = check.match?.import_status
    ? `<span>Stato esistente <strong>${escapeHtml(check.match.import_status)}</strong></span>`
    : "";
  const payloadHash = check.payload_hash
    ? `<div class="menu-payload-hash">
        <span>SHA-256 del payload normalizzato</span>
        <code>${escapeHtml(check.payload_hash)}</code>
      </div>`
    : "";

  return `
    <section class="menu-import-section" aria-label="Controllo identità e retry">
      <h3>Identità e retry</h3>
      <div class="menu-idempotency ${presentation.tone}">
        <div class="menu-idempotency-heading">
          <strong>${escapeHtml(presentation.title)}</strong>
          <span class="badge${presentation.tone === "ok" ? "" : " pending"}">${escapeHtml(presentation.badge)}</span>
        </div>
        <p>${escapeHtml(presentation.message || "Controllo non disponibile.")}</p>
        <div class="menu-idempotency-meta">
          <span>Sorgente <code>${escapeHtml(identity.source_type || "—")}</code></span>
          <span>ID <code>${escapeHtml(identity.source_external_id || "—")}</code></span>
          <span>Revisione <strong>${escapeHtml(identity.source_revision ?? "—")}</strong></span>
          ${existingStatus}
        </div>
        ${payloadHash}
      </div>
    </section>`;
}

const MENU_RESOLUTION_LABELS = Object.freeze({
  keep_existing: "Mantieni l’esistente",
  use_incoming: "Usa il nuovo contenuto",
  skip_incoming_meal: "Salta il pasto in arrivo",
  skip_incoming_item: "Salta l’elemento in arrivo",
  cancel_import: "Annulla l’importazione"
});

function menuResolutionLabel(conflict, action) {
  const contextualLabels = {
    overlapping_menu_package: {
      keep_existing: "Mantieni attivo anche il menu esistente",
      use_incoming: "Usa il nuovo e sostituisci il menu esistente"
    },
    existing_manual_meal: {
      keep_existing: "Mantieni il pasto esistente e aggiungi anche il nuovo",
      use_incoming: "Usa il nuovo e sostituisci il pasto esistente",
      skip_incoming_meal: "Mantieni l’esistente e salta il nuovo pasto"
    },
    user_modified_imported_meal: {
      keep_existing: "Conserva le modifiche manuali al pasto",
      use_incoming: "Usa il nuovo pasto e scarta le modifiche",
      skip_incoming_meal: "Salta il pasto della nuova revisione"
    },
    user_modified_imported_item: {
      keep_existing: "Conserva le modifiche manuali all’elemento",
      use_incoming: "Usa il nuovo elemento e scarta le modifiche",
      skip_incoming_item: "Salta l’elemento della nuova revisione"
    }
  };
  return contextualLabels[conflict.code]?.[action] ?? MENU_RESOLUTION_LABELS[action] ?? action;
}

function menuConflictChoiceValue(decision) {
  if (decision?.choice?.action === "map_recipe" && decision.choice.recipe_id) {
    return `map_recipe:${decision.choice.recipe_id}`;
  }
  return decision?.choice?.action ?? "";
}

function menuConflictResolutionHtml(conflict, resolutionPlan) {
  const selectedValue = menuConflictChoiceValue(conflict.decision);
  const resolvedByCancellation = resolutionPlan?.cancelled && selectedValue !== "cancel_import";
  const choicesLocked = resolvedByCancellation || Boolean(state.menuCommitResult) || Boolean(state.menuCommitError);
  const standardOptions = conflict.allowed_actions
    .filter(action => action !== "map_recipe")
    .map(action => `<option value="${escapeHtml(action)}"${selectedValue === action ? " selected" : ""}>${escapeHtml(menuResolutionLabel(conflict, action))}</option>`);
  const recipeOptions = conflict.allowed_actions.includes("map_recipe")
    ? state.recipes.map(recipe => {
        const value = `map_recipe:${recipe.id}`;
        return `<option value="${escapeHtml(value)}"${selectedValue === value ? " selected" : ""}>Mappa a: ${escapeHtml(recipeLabel(recipe))}</option>`;
      })
    : [];

  return `
    <div class="menu-conflict-resolution">
      <label for="resolution-${escapeHtml(conflict.conflict_id)}">Scelta esplicita</label>
      <select
        id="resolution-${escapeHtml(conflict.conflict_id)}"
        data-menu-conflict-id="${escapeHtml(conflict.conflict_id)}"
        aria-label="Risoluzione ${escapeHtml(conflict.code)}"
        ${choicesLocked ? "disabled" : ""}
      >
        <option value="">Scegli come risolvere…</option>
        ${recipeOptions.join("")}
        ${standardOptions.join("")}
      </select>
      <small>${resolvedByCancellation
        ? "Nessun’altra scelta necessaria: l’importazione è annullata."
        : conflict.decision?.resolved
          ? "Scelta registrata soltanto nell’anteprima."
          : "Scelta obbligatoria prima della conferma."}</small>
    </div>`;
}

function menuConflictHtml(conflict, resolutionPlan) {
  const presentations = {
    missing_library_reference: { badge: "RICETTA MANCANTE", icon: "📚" },
    ambiguous_library_reference: { badge: "RICETTA AMBIGUA", icon: "📚" },
    overlapping_menu_package: { badge: "MENU SOVRAPPOSTO", icon: "🗓️" },
    existing_manual_meal: { badge: "PASTO MANUALE", icon: "✋" },
    user_modified_imported_meal: { badge: "PASTO MODIFICATO", icon: "🛡️" },
    user_modified_imported_item: { badge: "ELEMENTO MODIFICATO", icon: "🛡️" }
  };
  const presentation = presentations[conflict.code] ?? { badge: "CONFLITTO", icon: "⚠️" };
  const details = conflict.details ?? {};
  const dateAndSlot = details.planned_date
    ? `<span>${escapeHtml(details.planned_date)}${details.meal_slot ? ` · ${escapeHtml(details.meal_slot)}` : ""}</span>`
    : "";

  return `
    <article class="menu-conflict-card${conflict.decision?.resolved || resolutionPlan?.cancelled ? " resolved" : ""}">
      <span class="menu-conflict-icon" aria-hidden="true">${presentation.icon}</span>
      <div class="menu-conflict-copy">
        <div class="menu-conflict-heading">
          <strong>${escapeHtml(conflict.message)}</strong>
          <span class="badge pending">${escapeHtml(presentation.badge)}</span>
        </div>
        <div class="menu-conflict-meta">
          ${dateAndSlot}
          <code>${escapeHtml(conflict.code)} · ${escapeHtml(conflict.path)}</code>
        </div>
        ${menuConflictResolutionHtml(conflict, resolutionPlan)}
      </div>
    </article>`;
}

function menuConflictAnalysisHtml(analysis, resolutionPlan) {
  if (analysis.status === "check_unavailable") {
    return `
      <section class="menu-import-section" aria-label="Analisi conflitti non disponibile">
        <h3>Analisi conflitti</h3>
        <div class="menu-conflict-summary error">
          <strong>Controllo non disponibile</strong>
          <span>${escapeHtml(analysis.issue?.message || "Non è stato possibile leggere i dati del Planner.")}</span>
        </div>
      </section>`;
  }

  const scanned = analysis.scanned ?? {};
  if (!resolutionPlan?.total_conflicts) {
    return `
      <section class="menu-import-section" aria-label="Analisi conflitti completata">
        <h3>Scelte di risoluzione</h3>
        <div class="menu-conflict-summary ok">
          <strong>Nessun conflitto rilevato</strong>
          <span>Periodo, pasti manuali e contenuti importati protetti sono stati controllati.</span>
          <small>${escapeHtml(scanned.menu_packages ?? 0)} menu · ${escapeHtml(scanned.planned_meals ?? 0)} pasti · ${escapeHtml(scanned.planned_meal_items ?? 0)} elementi esaminati</small>
        </div>
      </section>`;
  }

  const summaryClass = resolutionPlan.cancelled
    ? "warning"
    : resolutionPlan.complete
      ? "ok"
      : "warning";
  const summaryTitle = resolutionPlan.cancelled
    ? "Importazione annullata nell’anteprima"
    : resolutionPlan.complete
      ? "Tutte le scelte sono complete"
      : `${resolutionPlan.unresolved_conflicts} ${resolutionPlan.unresolved_conflicts === 1 ? "scelta da completare" : "scelte da completare"}`;
  const summaryText = resolutionPlan.cancelled
    ? "La decisione resta locale alla pagina e nessun dato è stato modificato."
    : resolutionPlan.complete
      ? "L’anteprima è pronta: il salvataggio partirà solo dal pulsante di conferma finale."
      : "Scegli un’azione per ogni conflitto. Nessun valore viene applicato automaticamente.";

  return `
    <section class="menu-import-section" aria-label="Scelte per i conflitti rilevati">
      <h3>Scelte di risoluzione (${resolutionPlan.resolved_conflicts}/${resolutionPlan.total_conflicts})</h3>
      <p>Nessun record viene sovrascritto: ogni decisione è esplicita e resta soltanto nell’anteprima.</p>
      <div class="menu-conflict-summary ${summaryClass}">
        <strong>${escapeHtml(summaryTitle)}</strong>
        <span>${escapeHtml(summaryText)}</span>
      </div>
      <div class="menu-conflict-list">${resolutionPlan.conflicts.map(conflict => menuConflictHtml(conflict, resolutionPlan)).join("")}</div>
    </section>`;
}

function menuCommitResultHtml(commitResult) {
  const counts = commitResult?.counts ?? {};
  const alreadyImported = commitResult?.status === "already_imported";
  const stats = [
    ["Pasti salvati", counts.meals ?? 0],
    ["Elementi salvati", counts.items ?? 0],
    ["Pasti saltati", counts.skipped_meals ?? 0],
    ["Elementi saltati", counts.skipped_items ?? 0]
  ];

  return `
    <section class="menu-import-section menu-commit-panel success" aria-label="Menu salvato">
      <div class="menu-commit-heading">
        <span class="menu-commit-icon" aria-hidden="true">${alreadyImported ? "🛡️" : "✅"}</span>
        <div>
          <p class="eyebrow">${alreadyImported ? "Retry sicuro" : "Commit atomico completato"}</p>
          <h3>${alreadyImported ? "Il menu era già stato salvato" : "Menu aggiunto al Planner"}</h3>
          <p>${alreadyImported
            ? "Il database ha riconosciuto lo stesso hash e non ha creato duplicati."
            : "Pacchetto, pasti ed elementi sono stati confermati nella stessa transazione."}</p>
        </div>
      </div>
      <div class="menu-commit-stats">${stats.map(([label, value]) => `
        <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>
      <div class="menu-commit-meta">
        <span>Revisione <strong>${escapeHtml(commitResult.source_revision ?? "—")}</strong></span>
        <span>ID pacchetto <code>${escapeHtml(commitResult.package_id ?? "—")}</code></span>
      </div>
    </section>`;
}

function menuCommitPanelHtml(result) {
  if (state.menuCommitResult) return menuCommitResultHtml(state.menuCommitResult);

  if (state.menuCommitError) {
    const uncertain = state.menuCommitError.outcome_unknown === true;
    return `
      <section class="menu-import-section menu-commit-panel error" aria-label="Salvataggio non eseguito">
        <div class="menu-commit-heading">
          <span class="menu-commit-icon" aria-hidden="true">⚠️</span>
          <div>
            <p class="eyebrow">${uncertain ? "Verifica necessaria" : "Commit annullato"}</p>
            <h3>${uncertain ? "Esito della connessione da verificare" : "Nessun dato è stato salvato"}</h3>
            <p>${escapeHtml(state.menuCommitError.message)}</p>
          </div>
        </div>
        <button class="button secondary" type="button" data-menu-action="reanalyze">RIPETI L’ANALISI</button>
      </section>`;
  }

  const plan = result?.resolutionPlan;
  if (!plan?.ready_for_confirmation || !plan.can_commit) return "";
  const commitRequest = menuPlanEngine.buildCommitRequest(
    result.normalizedPacket,
    result.idempotency,
    plan
  );
  if (!commitRequest.ready) return "";
  const summary = commitRequest.expected_summary ?? {};
  const menu = result.normalizedPacket?.menu ?? {};

  return `
    <section class="menu-import-section menu-commit-panel ready" aria-label="Conferma importazione menu">
      <div class="menu-commit-heading">
        <span class="menu-commit-icon" aria-hidden="true">🔐</span>
        <div>
          <p class="eyebrow">Conferma finale</p>
          <h3>Salvare questo menu nel Planner?</h3>
          <p>
            Verranno applicate le scelte mostrate sopra e salvati
            <strong>${escapeHtml(summary.meals ?? 0)} pasti</strong> con
            <strong>${escapeHtml(summary.items ?? 0)} elementi</strong>.
          </p>
        </div>
      </div>
      <div class="menu-commit-meta">
        <span>${escapeHtml(menu.period_start ?? "—")} – ${escapeHtml(menu.period_end ?? "—")}</span>
        <span>Revisione <strong>${escapeHtml(menu.revision ?? "—")}</strong></span>
      </div>
      <button
        class="button menu-commit-button"
        type="button"
        data-menu-action="commit"
        ${state.menuCommitting ? "disabled" : ""}
      >${state.menuCommitting ? "SALVATAGGIO…" : "CONFERMA E SALVA MENU"}</button>
      <small>Il database eseguirà un unico commit: in caso di errore non resteranno salvataggi parziali.</small>
    </section>`;
}

function prepareMenuPreviewResult(result) {
  if (!result?.normalizedPacket || !result?.conflictAnalysis || result.conflictAnalysis.status === "check_unavailable") {
    return result;
  }
  const resolutionPlan = menuPlanEngine.buildResolutionPlan(
    result.resolution,
    result.conflictAnalysis,
    state.menuResolutionSelections,
    state.recipes
  );
  return {
    ...result,
    stage: "preview",
    resolutionPlan,
    preview: menuPlanEngine.buildMenuPreview(
      result.normalizedPacket,
      result.resolution,
      resolutionPlan,
      state.recipes
    )
  };
}

function renderMenuPlanAnalysis(result) {
  const phaseLabels = {
    parsing: "Parsing",
    validation: "Validazione contratto",
    library_resolution: "Risoluzione Biblioteca",
    idempotency: "Identità e retry",
    conflict_analysis: "Analisi conflitti",
    preview: "Anteprima",
    committed: "Commit"
  };
  const phase = phaseLabels[result.stage] ?? "Analisi";
  const idempotency = result.idempotency ?? null;
  const conflictAnalysis = result.conflictAnalysis ?? null;
  const resolutionPlan = result.resolutionPlan ?? null;
  const duplicateRetry = idempotency?.status === "already_imported";
  const conflictUnavailable = conflictAnalysis?.status === "check_unavailable";
  const choicesPending = resolutionPlan?.available
    && !resolutionPlan.cancelled
    && resolutionPlan.unresolved_conflicts > 0;
  const previewReady = resolutionPlan?.ready_for_confirmation === true;
  const commitCompleted = Boolean(state.menuCommitResult);
  let tone = "error";
  let heading = "Il JSON non è stato letto";
  let description = `Il flusso si è fermato nella fase: ${phase}. Nessun dato è stato salvato.`;

  if (commitCompleted) {
    tone = "ok";
    heading = state.menuCommitResult.status === "already_imported"
      ? "Retry riconosciuto: nessun duplicato"
      : "Menu salvato nel Planner";
    description = state.menuCommitResult.status === "already_imported"
      ? "Il pacchetto coincide con quello già confermato e non è stato scritto una seconda volta."
      : "Conferma completata: pacchetto, pasti ed elementi sono stati salvati atomicamente.";
  } else if (idempotency?.blocking) {
    heading = "Controllo retry bloccato";
  } else if (conflictUnavailable) {
    heading = "Analisi conflitti non disponibile";
  } else if (duplicateRetry) {
    tone = "warning";
    heading = "Retry riconosciuto e fermato";
    description = "Il contenuto coincide con una revisione già nota. Nessun duplicato è stato creato.";
  } else if (resolutionPlan?.cancelled) {
    tone = "warning";
    heading = "Importazione annullata nell’anteprima";
    description = "La scelta è stata registrata soltanto nella pagina. Nessun dato è stato salvato o modificato.";
  } else if (choicesPending) {
    tone = "warning";
    heading = "Anteprima pronta: completa le scelte";
    description = `${resolutionPlan.unresolved_conflicts} ${resolutionPlan.unresolved_conflicts === 1 ? "conflitto richiede" : "conflitti richiedono"} una decisione esplicita. Nessun dato è stato salvato.`;
  } else if (previewReady) {
    tone = "ok";
    heading = resolutionPlan.total_conflicts
      ? "Anteprima pronta per la conferma"
      : "Anteprima completa";
    description = "Giorni, pasti, elementi, riferimenti e conflitti sono stati controllati. Puoi confermare il commit finale.";
  } else if (result.stage === "library_resolution") {
    heading = "Riferimenti Biblioteca da correggere";
  } else if (result.stage === "validation") {
    heading = "Pacchetto non conforme al contratto";
  }
  const structuralErrors = result.resolution
    ? result.errors.filter(item => !["missing_library_reference", "ambiguous_library_reference"].includes(item.code))
    : result.errors;
  const packetTitle = result.packet?.menu?.title || result.packet?.menu?.external_id || null;
  const sourceFormat = result.sourceFormat === "markdown_json" ? "blocco Markdown JSON" : "JSON puro";

  elements.menuResult.innerHTML = `
    <div class="menu-import-state ${tone}">
      <span class="menu-import-state-icon" aria-hidden="true">${tone === "ok" ? "✅" : "⚠️"}</span>
      <div class="menu-import-state-copy">
        <strong>${escapeHtml(heading)}</strong>
        <span>${escapeHtml(description)}</span>
        ${packetTitle ? `<span>${escapeHtml(packetTitle)} · ${escapeHtml(sourceFormat)}</span>` : ""}
      </div>
    </div>
    ${result.summary ? menuImportStatsHtml(result.summary) : ""}
    ${structuralErrors.length ? `
      <section class="menu-import-section" aria-label="Errori bloccanti">
        <h3>Errori bloccanti (${structuralErrors.length})</h3>
        <div class="menu-import-issues">${structuralErrors.map(menuImportIssueHtml).join("")}</div>
      </section>` : ""}
    ${result.warnings?.length ? `
      <section class="menu-import-section" aria-label="Avvisi">
        <h3>Avvisi (${result.warnings.length})</h3>
        <div class="menu-import-issues">${result.warnings.map(menuImportIssueHtml).join("")}</div>
      </section>` : ""}
    ${result.resolution ? `
      <section class="menu-import-section" aria-label="Riferimenti Biblioteca">
        <h3>Riferimenti Biblioteca (${result.resolution.references.length})</h3>
        <p>Il codice resta nel pacchetto; quando è univoco viene associato all'UUID della ricetta già esistente.</p>
        ${result.resolution.references.length
          ? `<div class="menu-reference-list">${result.resolution.references.map(reference => menuReferenceHtml(reference, resolutionPlan)).join("")}</div>`
          : '<div class="menu-import-idle"><strong>Nessun item recipe.</strong><span>Il menu contiene soltanto alimenti o preparazioni autonome.</span></div>'}
      </section>` : ""}
    ${idempotency ? menuIdempotencyHtml(idempotency) : ""}
    ${result.preview ? menuFullPreviewHtml(result.preview) : ""}
    ${conflictAnalysis && resolutionPlan ? menuConflictAnalysisHtml(conflictAnalysis, resolutionPlan) : ""}
    ${menuCommitPanelHtml(result)}
    <div class="menu-import-boundary">
      <strong>Flusso protetto: anteprima → scelte → conferma esplicita → commit atomico.</strong><br>
      Nessun pacchetto viene salvato durante l’analisi; il database ricontrolla hash e conflitti al momento della conferma.
    </div>`;
}

async function fetchKnownMenuPackages(packet) {
  const { data, error } = await client
    .from("planner_menu_packages")
    .select("id,title,period_start,period_end,source_type,source_external_id,source_revision,payload_hash,import_status,created_at")
    .eq("owner_user_id", state.ownerUserId)
    .eq("source_type", packet.menu.source.type)
    .eq("source_external_id", packet.menu.external_id)
    .order("source_revision", { ascending: false });
  assertOk(error, "Lettura registro pacchetti menu");
  return data ?? [];
}

function uniqueRows(rows = []) {
  return [...new Map(rows.filter(row => row?.id).map(row => [row.id, row])).values()];
}

async function fetchConflictContext(packet, knownPackages = []) {
  const packageFields = "id,title,period_start,period_end,source_type,source_external_id,source_revision,payload_hash,import_status,created_at";
  const mealFields = "id,planned_date,meal_slot,planned_time,menu_package_id,source_meal_key,is_user_modified";
  const sameSourcePackageIds = knownPackages
    .filter(menuPackage => !["cancelled", "superseded"].includes(menuPackage.import_status))
    .map(menuPackage => menuPackage.id)
    .filter(Boolean);

  const overlappingPackagesPromise = client
    .from("planner_menu_packages")
    .select(packageFields)
    .eq("owner_user_id", state.ownerUserId)
    .lte("period_start", packet.menu.period_end)
    .gte("period_end", packet.menu.period_start)
    .order("period_start", { ascending: true });
  const periodMealsPromise = client
    .from("planned_meals")
    .select(mealFields)
    .eq("owner_user_id", state.ownerUserId)
    .gte("planned_date", packet.menu.period_start)
    .lte("planned_date", packet.menu.period_end)
    .order("planned_date", { ascending: true });
  const sourceMealsPromise = sameSourcePackageIds.length
    ? client
      .from("planned_meals")
      .select(mealFields)
      .eq("owner_user_id", state.ownerUserId)
      .in("menu_package_id", sameSourcePackageIds)
      .order("planned_date", { ascending: true })
    : Promise.resolve({ data: [], error: null });

  const [overlappingPackagesResult, periodMealsResult, sourceMealsResult] = await Promise.all([
    overlappingPackagesPromise,
    periodMealsPromise,
    sourceMealsPromise
  ]);
  assertOk(overlappingPackagesResult.error, "Lettura menu sovrapposti");
  assertOk(periodMealsResult.error, "Lettura pasti nel periodo");
  assertOk(sourceMealsResult.error, "Lettura pasti delle revisioni precedenti");

  const packages = uniqueRows([
    ...knownPackages,
    ...(overlappingPackagesResult.data ?? [])
  ]);
  const meals = uniqueRows([
    ...(periodMealsResult.data ?? []),
    ...(sourceMealsResult.data ?? [])
  ]);
  const mealIds = meals.map(meal => meal.id).filter(Boolean);
  let items = [];

  if (mealIds.length) {
    const itemsResult = await client
      .from("planned_meal_items")
      .select("id,planned_meal_id,position,source_item_key,is_user_modified,item_type,label,recipe_code")
      .eq("owner_user_id", state.ownerUserId)
      .in("planned_meal_id", mealIds)
      .order("position", { ascending: true });
    assertOk(itemsResult.error, "Lettura elementi dei pasti");
    items = itemsResult.data ?? [];
  }

  return { packages, meals, items };
}

function setMenuAnalysisBusy(busy) {
  state.menuAnalyzing = busy;
  elements.menuAnalyze.disabled = busy || state.busy || !menuPlanEngine;
  elements.menuClear.disabled = busy || state.busy;
  elements.menuInput.disabled = busy || state.busy;
  elements.menuFile.disabled = busy || state.busy;
  updateMenuPreviewControls();
}

async function analyzeMenuPlan() {
  if (!menuPlanEngine) {
    renderMenuPlanUnavailable();
    return;
  }
  if (state.menuAnalyzing || state.busy) return;

  setMenuAnalysisBusy(true);
  elements.menuResult.setAttribute("aria-busy", "true");
  state.menuAnalysisResult = null;
  state.menuResolutionSelections = Object.create(null);
  state.menuCommitResult = null;
  state.menuCommitError = null;
  setStatus("Analisi del menu e costruzione dell’anteprima…");

  try {
    let result = menuPlanEngine.analyze(elements.menuInput.value, state.recipes);
    if (result.contractValid) {
      let existingPackages = [];
      try {
        const idempotencyInputs = await Promise.all([
          menuPlanEngine.computePayloadHash(result.normalizedPacket),
          fetchKnownMenuPackages(result.normalizedPacket)
        ]);
        const [payloadHash, packages] = idempotencyInputs;
        existingPackages = packages;
        const idempotency = menuPlanEngine.analyzeIdempotency(
          result.normalizedPacket,
          payloadHash,
          existingPackages
        );
        result = {
          ...result,
          stage: "idempotency",
          valid: result.contractValid && !idempotency.blocking,
          idempotency
        };
      } catch (error) {
        const packet = result.normalizedPacket;
        result = {
          ...result,
          stage: "idempotency",
          valid: false,
          idempotency: {
            status: "check_unavailable",
            can_continue: false,
            blocking: true,
            payload_hash: null,
            identity: {
              source_type: packet?.menu?.source?.type ?? null,
              source_external_id: packet?.menu?.external_id ?? null,
              source_revision: packet?.menu?.revision ?? null
            },
            match: null,
            latest: null,
            issue: {
              code: "idempotency_check_unavailable",
              path: "planner_menu_packages",
              severity: "error",
              message: `Impossibile consultare il registro. Verifica la migration 041_planner_menu_packages.sql. ${error.message}`
            }
          }
        };
      }

      if (result.idempotency?.can_continue) {
        try {
          const conflictContext = await fetchConflictContext(result.normalizedPacket, existingPackages);
          result = {
            ...result,
            stage: "conflict_analysis",
            conflictAnalysis: menuPlanEngine.analyzeConflicts(
              result.normalizedPacket,
              conflictContext
            )
          };
        } catch (error) {
          result = {
            ...result,
            stage: "conflict_analysis",
            valid: false,
            conflictAnalysis: {
              status: "check_unavailable",
              complete: false,
              has_conflicts: false,
              can_commit: false,
              conflicts: [],
              issue: {
                code: "conflict_analysis_unavailable",
                path: "planner",
                severity: "error",
                message: `Impossibile analizzare i conflitti. Verifica la migration 041_planner_menu_packages.sql. ${error.message}`
              }
            }
          };
        }
      }
    }

    result = prepareMenuPreviewResult(result);
    state.menuAnalysisResult = result;
    renderMenuPlanAnalysis(result);
    const idempotency = result.idempotency;
    const conflictAnalysis = result.conflictAnalysis;
    const resolutionPlan = result.resolutionPlan;
    if (conflictAnalysis?.status === "check_unavailable") {
      setStatus("Analisi conflitti non disponibile. Nessun dato salvato.", "error");
    } else if (resolutionPlan?.cancelled) {
      setStatus("Importazione annullata nell’anteprima. Nessun dato modificato.", "warning");
    } else if (resolutionPlan?.unresolved_conflicts) {
      setStatus(`${resolutionPlan.unresolved_conflicts} ${resolutionPlan.unresolved_conflicts === 1 ? "scelta da completare" : "scelte da completare"}. Nessun dato salvato.`, "warning");
    } else if (resolutionPlan?.ready_for_confirmation) {
      setStatus("Anteprima completa. Controlla il riepilogo e usa CONFERMA E SALVA MENU.", "ok");
    } else if (idempotency?.blocking) {
      setStatus("Controllo retry bloccato. Nessun dato salvato.", "error");
    } else if (idempotency?.status === "already_imported") {
      setStatus("Retry fermato in sicurezza: il pacchetto è già noto. Nessun dato salvato.", "warning");
    } else if (idempotency?.can_continue) {
      setStatus("Menu valido e controllo retry superato. Nessun dato salvato.", "ok");
    } else {
      setStatus("Analisi menu completata con errori bloccanti. Nessun dato salvato.", "error");
    }
  } catch (error) {
    elements.menuResult.innerHTML = `
      <div class="menu-import-state error">
        <span class="menu-import-state-icon" aria-hidden="true">⚠️</span>
        <div class="menu-import-state-copy">
          <strong>Analisi interrotta</strong>
          <span>${escapeHtml(error.message || "Errore tecnico inatteso.")} Nessun dato è stato salvato.</span>
        </div>
      </div>`;
    setStatus("Analisi interrotta da un errore tecnico. Nessun dato salvato.", "error");
  } finally {
    elements.menuResult.setAttribute("aria-busy", "false");
    setMenuAnalysisBusy(false);
  }
}

function handleMenuResolutionChange(event) {
  const select = event.target.closest?.("select[data-menu-conflict-id]");
  if (!select || !state.menuAnalysisResult) return;
  const conflictId = select.dataset.menuConflictId;
  const value = select.value;

  if (!value) {
    delete state.menuResolutionSelections[conflictId];
  } else if (value.startsWith("map_recipe:")) {
    state.menuResolutionSelections[conflictId] = {
      action: "map_recipe",
      recipe_id: value.slice("map_recipe:".length)
    };
  } else {
    state.menuResolutionSelections[conflictId] = { action: value };
  }

  state.menuAnalysisResult = prepareMenuPreviewResult(state.menuAnalysisResult);
  renderMenuPlanAnalysis(state.menuAnalysisResult);
  const plan = state.menuAnalysisResult.resolutionPlan;
  if (plan.cancelled) {
    setStatus("Importazione annullata nell’anteprima. Nessun dato modificato.", "warning");
  } else if (plan.unresolved_conflicts) {
    setStatus(`${plan.unresolved_conflicts} ${plan.unresolved_conflicts === 1 ? "scelta da completare" : "scelte da completare"}. Nessun dato salvato.`, "warning");
  } else {
    setStatus("Scelte complete: anteprima pronta per la conferma. Nessun dato ancora salvato.", "ok");
  }
}

function friendlyMenuCommitError(error) {
  const message = String(error?.message ?? "Errore tecnico inatteso.");
  const technicalCode = String(error?.code ?? "").trim();
  const response = (friendlyMessage, outcomeUnknown = false) => ({
    message: technicalCode ? `${friendlyMessage} Codice tecnico: ${technicalCode}.` : friendlyMessage,
    outcome_unknown: outcomeUnknown
  });
  if (message.includes("menu_commit_conflicts_changed")) {
    return response("Il Planner è cambiato dopo l’anteprima. Ripeti l’analisi e conferma le nuove scelte.");
  }
  if (message.includes("menu_commit_library_resolution_changed")) {
    return response("La Biblioteca è cambiata dopo l’anteprima. Ripeti l’analisi e ricontrolla le associazioni.");
  }
  if (message.includes("menu_commit_stale_revision")) {
    return response("È già presente una revisione più recente. Il pacchetto non è stato salvato.");
  }
  if (message.includes("menu_commit_same_revision_payload_mismatch")) {
    return response("La stessa revisione è già registrata con contenuto diverso. Incrementa la revisione del pacchetto.");
  }
  if (message.includes("menu_commit_hash_mismatch") || message.includes("menu_commit_payload_mismatch")) {
    return response("Il contenuto è cambiato dopo l’analisi. Ripeti l’analisi prima di confermare.");
  }
  if (message.includes("menu_commit_confirmation_required")) {
    return response("La conferma esplicita non è stata ricevuta. Nessun dato è stato salvato.");
  }
  if (technicalCode === "42883" && /digest/i.test(message)) {
    return response("La funzione di commit è presente, ma non trova il modulo crittografico pgcrypto. Applica la migration 043_planner_menu_commit_runtime_fix.sql e riprova.");
  }
  if (technicalCode === "PGRST202") {
    return response("La funzione di commit non è esposta dalla Data API. Applica la migration 042_planner_menu_atomic_commit.sql e aggiorna la cache PostgREST.");
  }
  if (technicalCode) {
    return response(`${message} Il database ha annullato integralmente il commit.`);
  }
  return response(`${message} Ripeti l’analisi: il controllo hash verificherà l’esito senza creare duplicati.`, true);
}

async function commitMenuPlan() {
  const result = state.menuAnalysisResult;
  if (!result || state.busy || state.menuAnalyzing || state.menuCommitting) return;

  const request = menuPlanEngine.buildCommitRequest(
    result.normalizedPacket,
    result.idempotency,
    result.resolutionPlan
  );
  if (!request.ready) {
    setStatus("Completa nuovamente l’analisi e tutte le scelte prima di confermare.", "warning");
    return;
  }

  const menu = request.packet.menu;
  const confirmed = window.confirm(
    `Confermi il salvataggio di “${menu.title || menu.external_id}” (revisione ${menu.revision}) nel Planner?`
  );
  if (!confirmed) {
    setStatus("Conferma annullata. Nessun dato è stato salvato.", "warning");
    return;
  }

  state.menuCommitting = true;
  state.menuCommitError = null;
  setBusy(true);
  elements.menuResult.setAttribute("aria-busy", "true");
  setStatus("Commit atomico del menu in corso…");

  try {
    const { data, error } = await client.rpc("commit_planner_menu_package", {
      p_packet: request.packet,
      p_canonical_payload: request.canonical_payload,
      p_payload_hash: request.payload_hash,
      p_resolutions: request.resolutions,
      p_confirmed: true
    });
    assertOk(error, "Commit menu");
    if (!data || !["committed", "already_imported"].includes(data.status)) {
      throw new Error("Il database non ha restituito un esito di commit verificabile.");
    }

    state.menuCommitResult = data;
    state.menuAnalysisResult = { ...result, stage: "committed" };
    state.weekAnchor = result.normalizedPacket.menu.period_start;
    await reloadMeals();
    await loadMenuPreviewRequests();
    setStatus(
      data.status === "already_imported"
        ? "Retry riconosciuto: il menu era già salvato e non è stato duplicato."
        : `Menu salvato: ${data.counts?.meals ?? 0} pasti e ${data.counts?.items ?? 0} elementi.`,
      "ok"
    );
  } catch (error) {
    state.menuCommitError = friendlyMenuCommitError(error);
    setStatus(state.menuCommitError.message, state.menuCommitError.outcome_unknown ? "warning" : "error");
  } finally {
    state.menuCommitting = false;
    elements.menuResult.setAttribute("aria-busy", "false");
    setBusy(false);
    if (state.menuAnalysisResult) renderMenuPlanAnalysis(state.menuAnalysisResult);
  }
}

function handleMenuResultClick(event) {
  const button = event.target.closest?.("button[data-menu-action]");
  if (!button) return;
  if (button.dataset.menuAction === "commit") void commitMenuPlan();
  if (button.dataset.menuAction === "reanalyze") void analyzeMenuPlan();
}

function renderMenuPlanUnavailable() {
  elements.menuResult.innerHTML = `
    <div class="menu-import-state error">
      <span class="menu-import-state-icon" aria-hidden="true">⚠️</span>
      <div class="menu-import-state-copy">
        <strong>Motore di importazione non disponibile</strong>
        <span>Ricarica la pagina. Il Planner manuale resta utilizzabile e nessun dato è stato modificato.</span>
      </div>
    </div>`;
  elements.menuAnalyze.disabled = true;
}

function resetMenuImport() {
  state.menuAnalysisResult = null;
  state.menuResolutionSelections = Object.create(null);
  state.menuCommitResult = null;
  state.menuCommitError = null;
  state.activeMenuPreviewRequestId = null;
  elements.menuInput.value = "";
  elements.menuFile.value = "";
  elements.menuFileStatus.textContent = "Puoi scegliere un file fino a 2 MB. “Testa invio diretto” usa l’endpoint autenticato e crea soltanto una richiesta di anteprima.";
  elements.menuResult.innerHTML = menuImportIdleHtml();
  elements.menuResult.setAttribute("aria-busy", "false");
}

async function loadMenuPlanFile() {
  const file = elements.menuFile.files?.[0];
  if (!file) return;
  state.menuAnalysisResult = null;
  state.menuResolutionSelections = Object.create(null);
  state.menuCommitResult = null;
  state.menuCommitError = null;
  const maxBytes = 2 * 1024 * 1024;
  if (file.size > maxBytes) {
    elements.menuFile.value = "";
    elements.menuFileStatus.textContent = "Il file supera il limite di 2 MB. Scegli un pacchetto più piccolo.";
    setStatus("File menu troppo grande. Nessun dato letto o salvato.", "error");
    return;
  }

  elements.menuResult.setAttribute("aria-busy", "true");
  elements.menuResult.innerHTML = menuImportIdleHtml("Lettura del file…");
  try {
    elements.menuInput.value = await file.text();
    elements.menuFileStatus.textContent = `${file.name} · ${Math.max(1, Math.ceil(file.size / 1024))} KB · pronto per l'analisi.`;
    elements.menuResult.innerHTML = menuImportIdleHtml("File caricato, non ancora analizzato.");
    setStatus("File menu caricato localmente. Tocca ANALIZZA MENU; nessun dato è stato salvato.");
  } catch (error) {
    elements.menuFileStatus.textContent = `Lettura non riuscita: ${error.message}`;
    elements.menuResult.innerHTML = menuImportIdleHtml("Il file non è stato letto.");
    setStatus("Non è stato possibile leggere il file selezionato.", "error");
  } finally {
    elements.menuResult.setAttribute("aria-busy", "false");
  }
}

function resetShoppingListForm() {
  elements.shoppingListForm.reset();
  elements.shoppingItemCategory.value = "other";
  updateShoppingListAvailability();
}

function shoppingListEmptyHtml() {
  const copy = {
    active: {
      icon: "🛒",
      title: "Niente da comprare",
      description: state.shoppingListItems.length
        ? "Tutte le voci sono state acquistate o escluse. Puoi cambiare il filtro per rivederle."
        : "Tocca “Aggiorna dal Planner” oppure aggiungi una voce manuale."
    },
    checked: {
      icon: "✅",
      title: "Nessun acquisto spuntato",
      description: "Le voci che segni come comprate compariranno qui."
    },
    excluded: {
      icon: "↩️",
      title: "Nessuna voce esclusa",
      description: "Gli ingredienti che decidi di non comprare compariranno qui e potranno essere ripristinati."
    },
    all: {
      icon: "🛒",
      title: "Lista ancora vuota",
      description: "Generala dai pasti della settimana oppure aggiungi una voce manuale."
    }
  }[state.shoppingListFilter] ?? {};

  return `
    <div class="shopping-list-empty">
      <span aria-hidden="true">${escapeHtml(copy.icon ?? "🛒")}</span>
      <div>
        <h4>${escapeHtml(copy.title ?? "Nessuna voce")}</h4>
        <p>${escapeHtml(copy.description ?? "")}</p>
      </div>
    </div>`;
}

function shoppingListItemCard(item) {
  const category = shoppingListCore.CATEGORIES[item.category] ?? shoppingListCore.CATEGORIES.other;
  const source = shoppingListCore.SOURCES[item.source_type] ?? shoppingListCore.SOURCES.manual;
  const status = shoppingListCore.itemStatus(item);
  const quantity = shoppingListCore.formatQuantity(item);
  const statusLabel = status === "checked" ? "ACQUISTATO" : status === "excluded" ? "ESCLUSO" : "DA COMPRARE";
  const statusClass = status === "checked" ? " is-checked" : status === "excluded" ? " is-excluded" : "";
  const stateActions = status === "active"
    ? `
      <button class="button" type="button" data-shopping-action="check" data-shopping-id="${escapeHtml(item.id)}">COMPRATO</button>
      <button class="button secondary" type="button" data-shopping-action="exclude" data-shopping-id="${escapeHtml(item.id)}">ESCLUDI</button>`
    : status === "checked"
      ? `
        <button class="button secondary" type="button" data-shopping-action="reopen" data-shopping-id="${escapeHtml(item.id)}">RIAPRI</button>
        <button class="button secondary" type="button" data-shopping-action="exclude" data-shopping-id="${escapeHtml(item.id)}">ESCLUDI</button>`
      : `<button class="button secondary" type="button" data-shopping-action="restore" data-shopping-id="${escapeHtml(item.id)}">RIPRISTINA</button>`;

  return `
    <article class="shopping-list-item${statusClass}">
      <span class="shopping-list-item-icon" aria-hidden="true">${escapeHtml(category.icon)}</span>
      <div class="shopping-list-item-content">
        <div class="shopping-list-item-heading">
          <div>
            <span class="badge${status === "active" ? "" : " pending"}">${escapeHtml(statusLabel)}</span>
            <h5>${escapeHtml(item.name)}</h5>
          </div>
          ${quantity ? `<span class="shopping-list-quantity">${escapeHtml(quantity)}</span>` : ""}
        </div>
        <div class="shopping-list-source">
          <span>${escapeHtml(source.icon)} ${escapeHtml(source.label)}</span>
          ${item.source_label ? `<strong>${escapeHtml(item.source_label)}</strong>` : ""}
        </div>
        ${item.note ? `<p class="shopping-list-note">${escapeHtml(item.note)}</p>` : ""}
        <div class="shopping-list-actions">
          ${stateActions}
          ${item.source_type === "manual"
            ? `<button class="button danger" type="button" data-shopping-action="delete" data-shopping-id="${escapeHtml(item.id)}">ELIMINA</button>`
            : ""}
        </div>
      </div>
    </article>`;
}

function renderShoppingList() {
  const moduleAvailable = Boolean(shoppingListCore);
  const week = core.weekForDate(state.weekAnchor);
  elements.shoppingListWeekRange.textContent = formatWeekRange(week.startDate, week.endDate);
  elements.shoppingListUnavailable.hidden = moduleAvailable && state.shoppingListAvailable;
  elements.shoppingListBody.hidden = !moduleAvailable || !state.shoppingListAvailable;

  if (!moduleAvailable) {
    setShoppingListStatus("Il modulo Lista spesa non è stato caricato. Ricarica la pagina.", "error");
    return;
  }

  if (!state.shoppingListAvailable) {
    elements.shoppingListCount.textContent = "0";
    setShoppingListStatus("Database Lista spesa non disponibile: nessun dato è stato modificato.", "warning");
    return;
  }

  const summary = shoppingListCore.summarizeItems(state.shoppingListItems);
  elements.shoppingListCount.textContent = String(summary.total);
  elements.shoppingListActiveCount.textContent = String(summary.active);
  elements.shoppingListCheckedCount.textContent = String(summary.checked);
  elements.shoppingListExcludedCount.textContent = String(summary.excluded);
  elements.shoppingListFilter.value = state.shoppingListFilter;

  if (state.shoppingListError) {
    setShoppingListStatus(state.shoppingListError, "error");
  } else if (!state.shoppingListItems.length) {
    setShoppingListStatus("La lista è vuota. Puoi generarla dal Planner o aggiungere una voce manuale.");
  } else {
    setShoppingListStatus();
  }

  const groups = shoppingListCore.groupItemsByCategory(
    state.shoppingListItems,
    state.shoppingListFilter
  );
  elements.shoppingListItems.innerHTML = groups.length
    ? groups.map(group => {
      const category = shoppingListCore.CATEGORIES[group.category] ?? shoppingListCore.CATEGORIES.other;
      return `
        <section class="shopping-list-category" aria-labelledby="shopping-category-${escapeHtml(group.category)}">
          <div class="shopping-list-category-heading">
            <h4 id="shopping-category-${escapeHtml(group.category)}">${escapeHtml(category.icon)} ${escapeHtml(category.label)}</h4>
            <span class="badge pending">${group.items.length}</span>
          </div>
          ${group.items.map(shoppingListItemCard).join("")}
        </section>`;
    }).join("")
    : shoppingListEmptyHtml();
  elements.shoppingListItems.setAttribute("aria-busy", "false");
  updateShoppingListAvailability();
}

function updateShoppingListAvailability() {
  if (!elements.shoppingListForm) return;
  const disabled = state.busy || !shoppingListCore || !state.shoppingListAvailable;
  elements.shoppingListForm.querySelectorAll("input, select, textarea").forEach(field => {
    field.disabled = disabled;
  });
  elements.shoppingItemAdd.disabled = disabled;
  elements.shoppingListRefresh.disabled = disabled;
  elements.shoppingListFilter.disabled = disabled;
}

function populateMealPrepItems(preferredItemId = elements.mealPrepItemId.value) {
  const meal = mealFor(elements.mealPrepMealId.value);
  const items = mealItems(meal);
  elements.mealPrepItemId.innerHTML = [
    '<option value="">Intero pasto</option>',
    ...items.map(item => `
      <option value="${escapeHtml(item.id)}">${escapeHtml(mealItemLabel(item))}</option>`)
  ].join("");
  elements.mealPrepItemId.value = items.some(item => item.id === preferredItemId)
    ? preferredItemId
    : "";
}

function populateMealPrepMeals(preferredMealId = elements.mealPrepMealId.value) {
  if (!state.meals.length) {
    elements.mealPrepMealId.innerHTML = '<option value="">Nessun pasto nella settimana</option>';
    elements.mealPrepMealId.value = "";
    populateMealPrepItems("");
    return;
  }

  elements.mealPrepMealId.innerHTML = [
    '<option value="">Seleziona un pasto…</option>',
    ...state.meals.map(meal => `
      <option value="${escapeHtml(meal.id)}">${escapeHtml(mealPrepMealLabel(meal))}</option>`)
  ].join("");
  elements.mealPrepMealId.value = state.meals.some(meal => meal.id === preferredMealId)
    ? preferredMealId
    : state.meals[0].id;
  populateMealPrepItems();
}

function suggestedMealPrepTitle(meal, item = null) {
  const subject = item ? mealItemLabel(item) : mealDisplayLabel(meal);
  const verb = {
    prepare: "Prepara",
    cook: "Cuoci",
    portion: "Porziona",
    store: "Conserva",
    defrost: "Scongela",
    other: "Gestisci"
  }[elements.mealPrepType.value] ?? "Prepara";
  return subject ? `${verb} ${subject}`.slice(0, 200) : "";
}

function applyMealPrepMealDefaults({ updateTitle = true } = {}) {
  const meal = mealFor(elements.mealPrepMealId.value);
  populateMealPrepItems();
  if (!meal) return;
  elements.mealPrepDate.value = mealPrepCore.defaultScheduledDate(meal);
  elements.mealPrepDate.max = meal.planned_date;
  elements.mealPrepServings.value = meal.servings ?? "";
  if (updateTitle) elements.mealPrepTaskTitle.value = suggestedMealPrepTitle(meal);
}

function resetMealPrepForm(preferredMealId = elements.mealPrepMealId.value) {
  state.mealPrepEditingId = null;
  elements.mealPrepForm.reset();
  elements.mealPrepTaskId.value = "";
  elements.mealPrepType.value = "prepare";
  elements.mealPrepStorage.value = "none";
  populateMealPrepMeals(preferredMealId);
  applyMealPrepMealDefaults();
  elements.mealPrepFormTitle.textContent = "Aggiungi una preparazione";
  elements.mealPrepSave.textContent = "AGGIUNGI ATTIVITÀ";
  elements.mealPrepCancel.hidden = true;
  updateMealPrepAvailability();
}

function prepareNewMealPrepTask(mealId, itemId = "") {
  if (!state.mealPrepAvailable || !mealPrepCore) {
    setMealPrepStatus("Applica prima la migration 045_meal_prep_core.sql.", "warning");
    elements.mealPrepPanel.scrollIntoView?.({ behavior: "smooth", block: "start" });
    return;
  }
  const meal = mealFor(mealId) ?? state.meals[0];
  if (!meal) {
    setMealPrepStatus("Pianifica prima almeno un pasto nella settimana.", "warning");
    return;
  }

  resetMealPrepForm(meal.id);
  populateMealPrepItems(itemId);
  elements.mealPrepTaskTitle.value = suggestedMealPrepTitle(meal, mealItemFor(meal, itemId));
  elements.mealPrepFormTitle.textContent = `Prepara per ${formatDate(meal.planned_date)}`;
  elements.mealPrepEditor.scrollIntoView?.({ behavior: "smooth", block: "start" });
  window.setTimeout(() => elements.mealPrepTaskTitle.focus(), 250);
  setMealPrepStatus("Pasto collegato. Completa i dettagli e salva l’attività.");
}

function editMealPrepTask(taskId) {
  const task = state.mealPrepTasks.find(item => item.id === taskId);
  if (!task) return;
  const meal = mealFor(task.planned_meal_id);
  if (!meal) {
    setMealPrepStatus("Il pasto collegato non è disponibile in questa settimana.", "error");
    return;
  }

  state.mealPrepEditingId = task.id;
  elements.mealPrepTaskId.value = task.id;
  populateMealPrepMeals(task.planned_meal_id);
  populateMealPrepItems(task.planned_meal_item_id ?? "");
  elements.mealPrepType.value = task.task_type;
  elements.mealPrepTaskTitle.value = task.title;
  elements.mealPrepDate.value = task.scheduled_date;
  elements.mealPrepDate.max = meal.planned_date;
  elements.mealPrepTime.value = mealPrepCore.normalizeTime(task.scheduled_time) ?? "";
  elements.mealPrepServings.value = task.servings ?? "";
  elements.mealPrepQuantity.value = task.quantity ?? "";
  elements.mealPrepUnit.value = task.unit ?? "";
  elements.mealPrepStorage.value = task.storage_method;
  elements.mealPrepStorageNote.value = task.storage_note ?? "";
  elements.mealPrepNote.value = task.note ?? "";
  elements.mealPrepFormTitle.textContent = "Modifica la preparazione";
  elements.mealPrepSave.textContent = "SALVA MODIFICHE";
  elements.mealPrepCancel.hidden = false;
  elements.mealPrepEditor.scrollIntoView?.({ behavior: "smooth", block: "start" });
  window.setTimeout(() => elements.mealPrepTaskTitle.focus(), 250);
  setMealPrepStatus(`Modifica “${task.title}”.`);
}

function mealPrepEmptyHtml() {
  if (!state.meals.length) {
    return `
      <div class="meal-prep-empty">
        <span aria-hidden="true">🍽️</span>
        <div>
          <h4>Nessun pasto da preparare</h4>
          <p>Aggiungi almeno un pasto alla settimana; comparirà subito tra le opzioni del Meal Prep.</p>
        </div>
      </div>`;
  }
  return `
    <div class="meal-prep-empty">
      <span aria-hidden="true">🔪</span>
      <div>
        <h4>Nessuna attività di Meal Prep</h4>
        <p>Scegli un pasto nel modulo e aggiungi la prima preparazione della settimana.</p>
      </div>
    </div>`;
}

function mealPrepTaskCard(task) {
  const meal = mealFor(task.planned_meal_id);
  const item = mealItemFor(meal, task.planned_meal_item_id);
  const type = mealPrepCore.TASK_TYPES[task.task_type] ?? mealPrepCore.TASK_TYPES.other;
  const status = mealPrepCore.TASK_STATUSES[task.status] ?? mealPrepCore.TASK_STATUSES.todo;
  const storage = mealPrepCore.STORAGE_METHODS[task.storage_method] ?? mealPrepCore.STORAGE_METHODS.none;
  const time = mealPrepCore.normalizeTime(task.scheduled_time);
  const quantity = formatMealPrepQuantity(task);
  const stateClass = task.status === "done" ? " is-done" : task.status === "in_progress" ? " is-progress" : "";
  const statusClass = task.status === "done" ? " done" : task.status === "in_progress" ? " in-progress" : "";
  const statusActions = task.status === "todo"
    ? `
      <button class="button secondary" type="button" data-prep-action="status" data-prep-status="in_progress" data-prep-id="${escapeHtml(task.id)}">AVVIA</button>
      <button class="button" type="button" data-prep-action="status" data-prep-status="done" data-prep-id="${escapeHtml(task.id)}">COMPLETA</button>`
    : task.status === "in_progress"
      ? `
        <button class="button secondary" type="button" data-prep-action="status" data-prep-status="todo" data-prep-id="${escapeHtml(task.id)}">DA FARE</button>
        <button class="button" type="button" data-prep-action="status" data-prep-status="done" data-prep-id="${escapeHtml(task.id)}">COMPLETA</button>`
      : `<button class="button secondary" type="button" data-prep-action="status" data-prep-status="todo" data-prep-id="${escapeHtml(task.id)}">RIAPRI</button>`;

  return `
    <article class="meal-prep-card${stateClass}">
      <span class="meal-prep-card-icon" aria-hidden="true">${escapeHtml(type.icon)}</span>
      <div class="meal-prep-card-content">
        <div class="meal-prep-card-heading">
          <div>
            <span class="badge meal-prep-status-badge${statusClass}">${escapeHtml(status.label)}</span>
            <h5>${escapeHtml(task.title)}</h5>
          </div>
          ${time ? `<time datetime="${escapeHtml(time)}">${escapeHtml(time)}</time>` : ""}
        </div>
        <div class="meal-prep-link">
          <span>Per il pasto</span>
          <strong>${escapeHtml(mealPrepMealLabel(meal))}</strong>
          ${item ? `<span>Elemento: ${escapeHtml(mealItemLabel(item))}</span>` : "<span>Intero pasto</span>"}
        </div>
        <div class="meal-prep-card-meta">
          <span>${escapeHtml(type.label)}</span>
          ${task.servings ? `<span>${escapeHtml(task.servings)} ${task.servings === 1 ? "porzione" : "porzioni"}</span>` : ""}
          ${quantity ? `<span>${escapeHtml(quantity)}</span>` : ""}
          ${task.storage_method !== "none" ? `<span>${escapeHtml(storage.icon)} ${escapeHtml(storage.label)}</span>` : ""}
        </div>
        ${task.storage_note ? `<p class="meal-prep-card-note"><strong>Conservazione:</strong> ${escapeHtml(task.storage_note)}</p>` : ""}
        ${task.note ? `<p class="meal-prep-card-note">${escapeHtml(task.note)}</p>` : ""}
        <div class="meal-prep-actions">
          ${statusActions}
          <button class="button secondary" type="button" data-prep-action="edit" data-prep-id="${escapeHtml(task.id)}">MODIFICA</button>
          <button class="button danger" type="button" data-prep-action="delete" data-prep-id="${escapeHtml(task.id)}">ELIMINA</button>
        </div>
      </div>
    </article>`;
}

function renderMealPrep() {
  const moduleAvailable = Boolean(mealPrepCore);
  elements.mealPrepUnavailable.hidden = moduleAvailable && state.mealPrepAvailable;
  elements.mealPrepBody.hidden = !moduleAvailable || !state.mealPrepAvailable;

  if (!moduleAvailable) {
    setMealPrepStatus("Il modulo Meal Prep non è stato caricato. Ricarica la pagina.", "error");
    return;
  }

  if (!state.mealPrepAvailable) {
    elements.mealPrepCount.textContent = "0";
    setMealPrepStatus("Database Meal Prep non disponibile: nessun dato è stato modificato.", "warning");
    return;
  }

  const summary = mealPrepCore.summarizeTasks(state.mealPrepTasks);
  elements.mealPrepCount.textContent = String(summary.total);
  elements.mealPrepTodoCount.textContent = String(summary.todo);
  elements.mealPrepProgressCount.textContent = String(summary.in_progress);
  elements.mealPrepDoneCount.textContent = String(summary.done);
  populateMealPrepMeals();

  if (state.mealPrepError) {
    setMealPrepStatus(state.mealPrepError, "error");
  } else if (!state.meals.length) {
    setMealPrepStatus("Pianifica almeno un pasto per attivare il Meal Prep della settimana.", "warning");
  } else {
    setMealPrepStatus();
  }

  elements.mealPrepList.innerHTML = state.mealPrepTasks.length
    ? mealPrepCore.groupTasksByDate(state.mealPrepTasks).map(group => `
      <section class="meal-prep-day" aria-labelledby="meal-prep-day-${escapeHtml(group.date)}">
        <div class="meal-prep-day-heading">
          <h4 id="meal-prep-day-${escapeHtml(group.date)}">${escapeHtml(formatDate(group.date))}</h4>
          <span class="badge pending">${group.tasks.length} attività</span>
        </div>
        ${group.tasks.map(mealPrepTaskCard).join("")}
      </section>`).join("")
    : mealPrepEmptyHtml();
  elements.mealPrepList.setAttribute("aria-busy", "false");
  updateMealPrepAvailability();
}

function updateMealPrepAvailability() {
  if (!elements.mealPrepForm) return;
  const disabled = state.busy
    || !mealPrepCore
    || !state.mealPrepAvailable
    || Boolean(state.mealPrepError)
    || !state.meals.length;
  elements.mealPrepForm.querySelectorAll("input, select, textarea").forEach(field => {
    field.disabled = disabled;
  });
  elements.mealPrepSave.disabled = disabled;
  elements.mealPrepCancel.disabled = state.busy || !state.mealPrepAvailable;
}

function updateFormAvailability() {
  elements.save.disabled = state.busy || state.recipes.length === 0;
  elements.cancel.disabled = state.busy;
}

function setBusy(busy) {
  state.busy = busy;
  elements.form.setAttribute("aria-busy", String(busy));
  elements.weekGrid.setAttribute("aria-busy", String(busy));
  elements.shoppingListForm.setAttribute("aria-busy", String(busy));
  elements.shoppingListItems.setAttribute("aria-busy", String(busy));
  elements.mealPrepForm.setAttribute("aria-busy", String(busy));
  elements.mealPrepList.setAttribute("aria-busy", String(busy));
  elements.form.querySelectorAll("input, select, textarea").forEach(field => {
    field.disabled = busy;
  });
  elements.menuInput.disabled = busy;
  elements.menuFile.disabled = busy;
  elements.menuResult.querySelectorAll("select, button").forEach(control => {
    control.disabled = busy;
  });
  elements.workspace.querySelectorAll("button").forEach(button => {
    button.disabled = busy;
  });
  elements.menuAnalyze.disabled = busy || state.menuAnalyzing || !menuPlanEngine;
  elements.menuClear.disabled = busy || state.menuAnalyzing;
  elements.menuInput.disabled = busy || state.menuAnalyzing;
  elements.menuFile.disabled = busy || state.menuAnalyzing;
  updateMenuPreviewControls();
  updateFormAvailability();
  updateShoppingListAvailability();
  updateMealPrepAvailability();
}

function populateRecipes() {
  if (!state.recipes.length) {
    elements.recipe.innerHTML = '<option value="">Nessuna ricetta disponibile</option>';
    elements.recipeHelp.innerHTML = 'Aggiungi prima una ricetta nella <a href="../index.html?v=16&amp;view=recipes">Biblioteca</a>.';
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
      <h3>Nessun pasto in questa settimana</h3>
      <p>Usa “Aggiungi” nel giorno che preferisci oppure scegli una ricetta nel modulo accanto.</p>
    </div>`;
}

function weekMealCard(meal) {
  const slot = core.MEAL_SLOTS[meal.meal_slot] ?? core.MEAL_SLOTS.other;
  const label = mealDisplayLabel(meal);
  const time = core.normalizeTime(meal.planned_time);
  const ariaLabel = `${meal.menu_package_id ? "Mostra dettaglio" : "Modifica"} ${slot.label}: ${label}${time ? ` alle ${time}` : ""}`;

  return `
    <button
      class="week-meal"
      type="button"
      data-action="edit"
      data-meal-id="${escapeHtml(meal.id)}"
      aria-label="${escapeHtml(ariaLabel)}"
    >
      <span class="week-meal-slot">
        <span>${escapeHtml(slot.icon)} ${escapeHtml(slot.label)}</span>
        ${time ? `<time datetime="${escapeHtml(time)}">${escapeHtml(time)}</time>` : ""}
      </span>
      <span class="week-meal-title">${escapeHtml(label)}</span>
    </button>`;
}

function weekDayCard(day, today) {
  const formatted = formatWeekDay(day.date);
  const isToday = day.date === today;
  const countLabel = `${day.entries.length} ${day.entries.length === 1 ? "pasto" : "pasti"}`;

  return `
    <article class="week-day${isToday ? " is-today" : ""}" role="listitem" aria-label="${escapeHtml(formatDate(day.date))}">
      <div class="week-day-header">
        <time datetime="${escapeHtml(day.date)}">
          <span class="week-day-name">${escapeHtml(formatted.name)}</span>
          <strong class="week-day-date">${escapeHtml(formatted.date)}</strong>
        </time>
        <span class="week-day-count" aria-label="${escapeHtml(countLabel)}">${day.entries.length}</span>
      </div>
      ${day.entries.length
        ? `<div class="week-day-meals">${day.entries.map(weekMealCard).join("")}</div>`
        : '<p class="week-day-empty">Nessun pasto pianificato.</p>'}
      <button
        class="week-day-add"
        type="button"
        data-action="add"
        data-date="${escapeHtml(day.date)}"
        aria-label="Aggiungi un pasto il ${escapeHtml(formatDate(day.date))}"
      >+ AGGIUNGI</button>
    </article>`;
}

function renderWeek() {
  const week = core.weekForDate(state.weekAnchor, state.meals);
  const today = core.localDateValue();
  elements.weekCount.textContent = String(week.entries.length);
  elements.weekRange.textContent = formatWeekRange(week.startDate, week.endDate);
  elements.weekEmpty.hidden = week.entries.length > 0;
  elements.weekGrid.innerHTML = week.days.map(day => weekDayCard(day, today)).join("");
  elements.weekGrid.setAttribute("aria-busy", "false");
}

function mealCard(meal) {
  const slot = core.MEAL_SLOTS[meal.meal_slot] ?? core.MEAL_SLOTS.other;
  const time = core.normalizeTime(meal.planned_time);
  const imported = Boolean(meal.menu_package_id);
  return `
    <article class="meal-card">
      <span class="meal-icon" aria-hidden="true">${escapeHtml(slot.icon)}</span>
      <div class="meal-content">
        <div class="meal-heading">
          <div>
            <span class="badge">${escapeHtml(slot.label)}</span>
            ${imported ? '<span class="badge pending">MENU IMPORTATO</span>' : ""}
            <h4>${escapeHtml(mealDisplayLabel(meal))}</h4>
          </div>
          ${time ? `<time class="meal-time" datetime="${escapeHtml(time)}">${escapeHtml(time)}</time>` : ""}
        </div>
        ${meal.servings ? `<div class="meal-meta"><span class="badge pending">${escapeHtml(meal.servings)} ${meal.servings === 1 ? "porzione" : "porzioni"}</span></div>` : ""}
        ${meal.note ? `<p class="meal-note">${escapeHtml(meal.note)}</p>` : ""}
        ${mealItemsHtml(meal)}
        <div class="meal-actions">
          <button class="button" type="button" data-action="prep" data-meal-id="${escapeHtml(meal.id)}">MEAL PREP</button>
          ${imported
            ? '<span class="field-help">Pasto composto collegato al Menu Package; la gestione degli elementi usa il flusso revisioni protetto.</span>'
            : `<button class="button secondary" type="button" data-action="edit" data-meal-id="${escapeHtml(meal.id)}">MODIFICA</button>
              <button class="button danger" type="button" data-action="delete" data-meal-id="${escapeHtml(meal.id)}">ELIMINA</button>`}
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

function renderPlanner() {
  renderWeek();
  renderMeals();
  renderShoppingList();
  renderMealPrep();
}

function resetForm(plannedDate = core.localDateValue()) {
  state.editingId = null;
  elements.mealId.value = "";
  elements.form.reset();
  elements.date.value = plannedDate;
  elements.slot.value = "dinner";
  elements.formTitle.textContent = "Pianifica un pasto";
  elements.save.textContent = "AGGIUNGI AL PLANNER";
  elements.cancel.hidden = true;
  updateFormAvailability();
}

function prepareNewMeal(plannedDate) {
  if (!core.isRealDate(plannedDate)) return;
  resetForm(plannedDate);
  elements.formTitle.textContent = `Pianifica per ${formatDate(plannedDate)}`;
  elements.editor.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => elements.recipe.focus(), 250);
  setStatus(`Data selezionata: ${formatDate(plannedDate)}.`);
}

function editMeal(mealId) {
  const meal = state.meals.find(item => item.id === mealId);
  if (!meal) return;
  if (meal.menu_package_id) {
    setStatus("Questo è un pasto composto importato: il dettaglio degli elementi è visibile nell’elenco della settimana.", "warning");
    elements.list.scrollIntoView?.({ behavior: "smooth", block: "start" });
    return;
  }

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
  if (error.code === "23514" && /meal prep/i.test(error.message ?? "")) {
    return "Il pasto non può essere spostato prima di una preparazione già programmata. Modifica prima il Meal Prep collegato.";
  }
  return error.message;
}

async function fetchMealsForWeek(anchorDate) {
  const week = core.weekForDate(anchorDate);
  if (!week.startDate || !week.endDate) {
    throw new Error("Intervallo settimanale non valido");
  }

  const { data, error } = await client
    .from("planned_meals")
    .select("*,planned_meal_items(id,position,item_type,recipe_id,recipe_code,label,quantity,unit,note,source_item_key,is_user_modified)")
    .eq("owner_user_id", state.ownerUserId)
    .gte("planned_date", week.startDate)
    .lte("planned_date", week.endDate)
    .order("planned_date", { ascending: true });
  assertOk(error, "Lettura pasti della settimana");
  return data ?? [];
}

async function fetchMealPrepTasksForMeals(meals = state.meals) {
  if (!mealPrepCore || !meals.length) return [];
  const mealIds = meals.map(meal => meal.id);
  const { data, error } = await client
    .from("meal_prep_tasks")
    .select("id,owner_user_id,planned_meal_id,planned_meal_item_id,task_type,title,scheduled_date,scheduled_time,servings,quantity,unit,storage_method,storage_note,note,status,completed_at,created_at,updated_at")
    .eq("owner_user_id", state.ownerUserId)
    .in("planned_meal_id", mealIds)
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true });
  assertOk(error, "Lettura Meal Prep");
  return data ?? [];
}

async function loadMealPrepTasks(meals = state.meals) {
  state.mealPrepError = null;
  if (!mealPrepCore) {
    state.mealPrepAvailable = false;
    state.mealPrepTasks = [];
    return false;
  }

  try {
    state.mealPrepTasks = await fetchMealPrepTasksForMeals(meals);
    state.mealPrepAvailable = true;
    return true;
  } catch (error) {
    state.mealPrepTasks = [];
    if (isMissingMealPrepTable(error)) {
      state.mealPrepAvailable = false;
      state.mealPrepError = null;
    } else {
      state.mealPrepAvailable = true;
      state.mealPrepError = `${error.message}. Riprova ricaricando la settimana.`;
    }
    return false;
  }
}

async function fetchShoppingListForWeek(anchorDate = state.weekAnchor) {
  const week = core.weekForDate(anchorDate);
  if (!week.startDate) throw new Error("Settimana della lista spesa non valida");
  const { data, error } = await client
    .from("shopping_list_items")
    .select("id,owner_user_id,week_start,name,normalized_name,quantity,unit,quantity_text,category,source_type,source_key,source_label,planned_meal_id,planned_meal_item_id,recipe_id,note,is_checked,is_excluded,checked_at,created_at,updated_at")
    .eq("owner_user_id", state.ownerUserId)
    .eq("week_start", week.startDate)
    .order("category", { ascending: true })
    .order("created_at", { ascending: true });
  assertOk(error, "Lettura Lista spesa");
  return data ?? [];
}

async function loadShoppingList(anchorDate = state.weekAnchor) {
  state.shoppingListError = null;
  if (!shoppingListCore) {
    state.shoppingListAvailable = false;
    state.shoppingListItems = [];
    return false;
  }

  try {
    state.shoppingListItems = await fetchShoppingListForWeek(anchorDate);
    state.shoppingListAvailable = true;
    return true;
  } catch (error) {
    state.shoppingListItems = [];
    if (isMissingShoppingListSchema(error)) {
      state.shoppingListAvailable = false;
      state.shoppingListError = null;
    } else {
      state.shoppingListAvailable = true;
      state.shoppingListError = `${error.message}. Riprova ricaricando la settimana.`;
    }
    return false;
  }
}

async function loadData() {
  const [recipesResult, meals] = await Promise.all([
    client
      .from("recipes")
      .select("id,code,title")
      .eq("owner_user_id", state.ownerUserId)
      .order("title", { ascending: true }),
    fetchMealsForWeek(state.weekAnchor)
  ]);

  assertOk(recipesResult.error, "Lettura ricette");
  state.recipes = recipesResult.data ?? [];
  state.meals = meals;
  await Promise.all([
    loadMealPrepTasks(state.meals),
    loadShoppingList(state.weekAnchor)
  ]);
}

async function reloadMeals() {
  state.meals = await fetchMealsForWeek(state.weekAnchor);
  await loadMealPrepTasks(state.meals);
  if (!state.mealPrepEditingId
      || !state.mealPrepTasks.some(task => task.id === state.mealPrepEditingId)) {
    resetMealPrepForm(state.meals[0]?.id ?? "");
  }
  renderPlanner();
}

async function selectWeek(anchorDate) {
  if (state.busy || !core.isRealDate(anchorDate)) return;
  const previousAnchor = state.weekAnchor;
  const previousMeals = state.meals;
  const previousShoppingListItems = state.shoppingListItems;
  setBusy(true);
  setStatus("Caricamento della settimana…");

  try {
    const meals = await fetchMealsForWeek(anchorDate);
    state.weekAnchor = anchorDate;
    const url = new URL(window.location.href);
    url.searchParams.set("week", anchorDate);
    window.history.replaceState(null, "", url);
    state.meals = meals;
    state.shoppingListFilter = "active";
    await Promise.all([
      loadMealPrepTasks(state.meals),
      loadShoppingList(state.weekAnchor)
    ]);
    if (state.editingId && !state.meals.some(meal => meal.id === state.editingId)) {
      resetForm(anchorDate);
    }
    resetMealPrepForm(state.meals[0]?.id ?? "");
    renderPlanner();
    if (!state.shoppingListAvailable) {
      setStatus("Settimana caricata. Per attivare la Lista spesa applica la migration 046.", "warning");
    } else if (state.shoppingListError) {
      setStatus("Settimana caricata, ma la Lista spesa non è disponibile.", "warning");
    } else if (!state.mealPrepAvailable) {
      setStatus("Settimana caricata. Per attivare Meal Prep applica la migration 045.", "warning");
    } else if (state.mealPrepError) {
      setStatus("Settimana caricata, ma le attività Meal Prep non sono disponibili.", "warning");
    } else {
      setStatus("Settimana caricata.", "ok");
    }
  } catch (error) {
    state.weekAnchor = previousAnchor;
    state.meals = previousMeals;
    state.shoppingListItems = previousShoppingListItems;
    renderPlanner();
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
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
    state.weekAnchor = candidate.value.planned_date;
    await reloadMeals();
    resetForm(candidate.value.planned_date);
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
  const confirmed = window.confirm(`Eliminare ${mealDisplayLabel(meal)} dal ${formatDate(meal.planned_date)}?`);
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
    state.mealPrepTasks = state.mealPrepTasks.filter(task => task.planned_meal_id !== meal.id);
    if (state.editingId === meal.id) resetForm(state.weekAnchor);
    if (state.mealPrepEditingId
        && !state.mealPrepTasks.some(task => task.id === state.mealPrepEditingId)) {
      resetMealPrepForm(state.meals[0]?.id ?? "");
    }
    await loadShoppingList(state.weekAnchor);
    renderPlanner();
    setStatus("Pasto eliminato dal Planner.", "ok");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

function friendlyShoppingListWriteError(error) {
  if (isMissingShoppingListSchema(error)) {
    return "Lista spesa non ancora attiva. Applica la migration 046_shopping_list_core.sql.";
  }
  if (error.code === "23514") {
    return "La voce non rispetta i vincoli della settimana o dello stato selezionato.";
  }
  if (error.code === "23503") {
    return "Il pasto o la ricetta collegata non è più disponibile. Aggiorna la lista dal Planner.";
  }
  return error.message;
}

async function refreshShoppingList() {
  if (state.busy || !state.shoppingListAvailable || !shoppingListCore) return;
  const week = core.weekForDate(state.weekAnchor);
  if (!week.startDate) return;

  setBusy(true);
  setShoppingListStatus("Generazione della lista dai pasti della settimana…");
  try {
    const { data, error } = await client.rpc("refresh_weekly_shopping_list", {
      p_week_start: week.startDate
    });
    assertOk(error, "Aggiornamento Lista spesa");
    const result = Array.isArray(data) ? data[0] : data;
    await loadShoppingList(state.weekAnchor);
    renderShoppingList();
    const generated = Number(result?.generated_count ?? 0);
    setShoppingListStatus(
      `Lista aggiornata: ${generated} ${generated === 1 ? "voce automatica letta" : "voci automatiche lette"} dal Planner. Aggiunte manuali e scelte precedenti sono state conservate.`,
      "ok"
    );
  } catch (error) {
    if (isMissingShoppingListSchema(error)) {
      state.shoppingListAvailable = false;
      state.shoppingListItems = [];
      renderShoppingList();
    }
    setShoppingListStatus(friendlyShoppingListWriteError(error), "error");
  } finally {
    setBusy(false);
  }
}

async function saveShoppingItem(event) {
  event.preventDefault();
  if (state.busy || !state.shoppingListAvailable || !shoppingListCore) return;

  const candidate = shoppingListCore.normalizeManualItem({
    name: elements.shoppingItemName.value,
    quantity: elements.shoppingItemQuantity.value,
    unit: elements.shoppingItemUnit.value,
    category: elements.shoppingItemCategory.value,
    note: elements.shoppingItemNote.value
  });
  if (!candidate.valid) {
    setShoppingListStatus(candidate.errors.join(" "), "error");
    elements.shoppingListPanel.scrollIntoView?.({ behavior: "smooth", block: "start" });
    return;
  }

  const week = core.weekForDate(state.weekAnchor);
  const payload = {
    ...candidate.value,
    owner_user_id: state.ownerUserId,
    week_start: week.startDate
  };

  setBusy(true);
  setShoppingListStatus("Aggiunta della voce…");
  try {
    const { error } = await client
      .from("shopping_list_items")
      .insert(payload)
      .select("id")
      .single();
    assertOk(error, "Aggiunta Lista spesa");
    await loadShoppingList(state.weekAnchor);
    resetShoppingListForm();
    renderShoppingList();
    setShoppingListStatus(`“${candidate.value.name}” è stato aggiunto alla lista.`, "ok");
  } catch (error) {
    if (isMissingShoppingListSchema(error)) {
      state.shoppingListAvailable = false;
      renderShoppingList();
    }
    setShoppingListStatus(friendlyShoppingListWriteError(error), "error");
  } finally {
    setBusy(false);
  }
}

async function updateShoppingItemState(itemId, action) {
  const item = state.shoppingListItems.find(candidate => candidate.id === itemId);
  if (!item || state.busy) return;
  const changes = {
    check: { is_checked: true, is_excluded: false },
    reopen: { is_checked: false, is_excluded: false },
    exclude: { is_checked: false, is_excluded: true },
    restore: { is_checked: false, is_excluded: false }
  }[action];
  if (!changes) return;

  setBusy(true);
  setShoppingListStatus("Aggiornamento della voce…");
  try {
    const { error } = await client
      .from("shopping_list_items")
      .update(changes)
      .eq("id", item.id)
      .eq("owner_user_id", state.ownerUserId)
      .select("id")
      .single();
    assertOk(error, "Aggiornamento Lista spesa");
    await loadShoppingList(state.weekAnchor);
    renderShoppingList();
    const message = action === "check"
      ? `“${item.name}” segnato come acquistato.`
      : action === "exclude"
        ? `“${item.name}” escluso dalla spesa.`
        : `“${item.name}” è di nuovo tra le cose da comprare.`;
    setShoppingListStatus(message, "ok");
  } catch (error) {
    setShoppingListStatus(friendlyShoppingListWriteError(error), "error");
  } finally {
    setBusy(false);
  }
}

async function deleteShoppingItem(itemId) {
  const item = state.shoppingListItems.find(candidate => candidate.id === itemId);
  if (!item || state.busy || item.source_type !== "manual") return;
  const confirmed = window.confirm(`Eliminare “${item.name}” dalla lista?`);
  if (!confirmed) return;

  setBusy(true);
  setShoppingListStatus("Eliminazione della voce…");
  try {
    const { error } = await client
      .from("shopping_list_items")
      .delete()
      .eq("id", item.id)
      .eq("owner_user_id", state.ownerUserId);
    assertOk(error, "Eliminazione Lista spesa");
    state.shoppingListItems = state.shoppingListItems.filter(candidate => candidate.id !== item.id);
    renderShoppingList();
    setShoppingListStatus("Voce manuale eliminata.", "ok");
  } catch (error) {
    setShoppingListStatus(friendlyShoppingListWriteError(error), "error");
  } finally {
    setBusy(false);
  }
}

function friendlyMealPrepWriteError(error) {
  if (isMissingMealPrepTable(error)) {
    return "Meal Prep non è ancora attivo. Applica la migration 045_meal_prep_core.sql.";
  }
  if (error.code === "23514") {
    return "La preparazione non può essere programmata dopo il pasto collegato.";
  }
  if (error.code === "23503") {
    return "Il pasto o l’elemento collegato non è più disponibile. Ricarica la settimana.";
  }
  return error.message;
}

async function saveMealPrepTask(event) {
  event.preventDefault();
  if (state.busy || !state.mealPrepAvailable || state.mealPrepError || !mealPrepCore) return;

  const meal = mealFor(elements.mealPrepMealId.value);
  const existing = state.mealPrepTasks.find(task => task.id === state.mealPrepEditingId) ?? null;
  const candidate = mealPrepCore.normalizeTask({
    planned_meal_id: elements.mealPrepMealId.value,
    planned_meal_item_id: elements.mealPrepItemId.value,
    task_type: elements.mealPrepType.value,
    title: elements.mealPrepTaskTitle.value,
    scheduled_date: elements.mealPrepDate.value,
    scheduled_time: elements.mealPrepTime.value,
    servings: elements.mealPrepServings.value,
    quantity: elements.mealPrepQuantity.value,
    unit: elements.mealPrepUnit.value,
    storage_method: elements.mealPrepStorage.value,
    storage_note: elements.mealPrepStorageNote.value,
    note: elements.mealPrepNote.value,
    status: existing?.status ?? "todo"
  }, meal);

  if (!candidate.valid) {
    setMealPrepStatus(candidate.errors.join(" "), "error");
    elements.mealPrepPanel.scrollIntoView?.({ behavior: "smooth", block: "start" });
    return;
  }

  const wasEditing = Boolean(existing);
  const payload = {
    ...candidate.value,
    owner_user_id: state.ownerUserId,
    updated_at: new Date().toISOString()
  };

  setBusy(true);
  setMealPrepStatus(wasEditing ? "Salvataggio delle modifiche…" : "Aggiunta dell’attività…");

  try {
    const result = wasEditing
      ? await client
        .from("meal_prep_tasks")
        .update(payload)
        .eq("id", existing.id)
        .eq("owner_user_id", state.ownerUserId)
        .select("id")
        .single()
      : await client
        .from("meal_prep_tasks")
        .insert(payload)
        .select("id")
        .single();

    assertOk(result.error, wasEditing ? "Modifica Meal Prep" : "Creazione Meal Prep");
    await loadMealPrepTasks();
    resetMealPrepForm(candidate.value.planned_meal_id);
    renderMealPrep();
    setMealPrepStatus(
      wasEditing ? "Attività aggiornata correttamente." : "Attività aggiunta al Meal Prep.",
      "ok"
    );
  } catch (error) {
    if (isMissingMealPrepTable(error)) {
      state.mealPrepAvailable = false;
      renderMealPrep();
    }
    setMealPrepStatus(friendlyMealPrepWriteError(error), "error");
  } finally {
    setBusy(false);
  }
}

async function updateMealPrepTaskStatus(taskId, nextStatus) {
  const task = state.mealPrepTasks.find(item => item.id === taskId);
  if (!task || state.busy || !mealPrepCore.TASK_STATUSES[nextStatus]) return;

  setBusy(true);
  setMealPrepStatus("Aggiornamento dello stato…");
  try {
    const { error } = await client
      .from("meal_prep_tasks")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", task.id)
      .eq("owner_user_id", state.ownerUserId)
      .select("id")
      .single();
    assertOk(error, "Aggiornamento Meal Prep");
    await loadMealPrepTasks();
    renderMealPrep();
    setMealPrepStatus(`“${task.title}”: ${mealPrepCore.TASK_STATUSES[nextStatus].label.toLowerCase()}.`, "ok");
  } catch (error) {
    setMealPrepStatus(friendlyMealPrepWriteError(error), "error");
  } finally {
    setBusy(false);
  }
}

async function deleteMealPrepTask(taskId) {
  const task = state.mealPrepTasks.find(item => item.id === taskId);
  if (!task || state.busy) return;
  const confirmed = window.confirm(`Eliminare l’attività “${task.title}”?`);
  if (!confirmed) return;

  setBusy(true);
  setMealPrepStatus("Eliminazione dell’attività…");
  try {
    const { error } = await client
      .from("meal_prep_tasks")
      .delete()
      .eq("id", task.id)
      .eq("owner_user_id", state.ownerUserId);
    assertOk(error, "Eliminazione Meal Prep");
    state.mealPrepTasks = state.mealPrepTasks.filter(item => item.id !== task.id);
    if (state.mealPrepEditingId === task.id) resetMealPrepForm(task.planned_meal_id);
    renderMealPrep();
    setMealPrepStatus("Attività eliminata.", "ok");
  } catch (error) {
    setMealPrepStatus(friendlyMealPrepWriteError(error), "error");
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
    const requestedWeek = new URLSearchParams(window.location.search).get("week");
    state.weekAnchor = state.weekAnchor ?? (core.isRealDate(requestedWeek) ? requestedWeek : core.localDateValue());
    await loadData();
    populateRecipes();
    renderPlanner();
    resetForm(state.weekAnchor);
    resetShoppingListForm();
    resetMealPrepForm(state.meals[0]?.id ?? "");
    resetMenuImport();
    if (!menuPlanEngine) renderMenuPlanUnavailable();
    elements.workspace.hidden = false;
    const previewAvailable = await loadMenuPreviewRequests();
    const baseStatus = state.recipes.length
      ? "Planner pronto. I pasti sono collegati alle ricette della tua Biblioteca."
      : "Planner pronto, ma la Biblioteca non contiene ricette selezionabili.";
    const inboxStatus = state.menuPreviewRequests.length
      ? ` ${state.menuPreviewRequests.length} ${state.menuPreviewRequests.length === 1 ? "anteprima ricevuta" : "anteprime ricevute"} in attesa.`
      : "";
    const mealPrepNotice = !state.mealPrepAvailable
      ? " Per attivare Meal Prep applica la migration 045."
      : state.mealPrepError
        ? " Le attività Meal Prep non sono disponibili al momento."
        : "";
    const shoppingListNotice = !state.shoppingListAvailable
      ? " Per attivare la Lista spesa applica la migration 046."
      : state.shoppingListError
        ? " La Lista spesa non è disponibile al momento."
        : "";
    setStatus(
      previewAvailable
        ? `${baseStatus}${inboxStatus}${mealPrepNotice}${shoppingListNotice}`
        : `${baseStatus} Per le anteprime dirette applica la migration 044.${mealPrepNotice}${shoppingListNotice}`,
      previewAvailable
        && state.recipes.length
        && state.mealPrepAvailable
        && !state.mealPrepError
        && state.shoppingListAvailable
        && !state.shoppingListError
        ? "ok"
        : "warning"
    );
  } catch (error) {
    showFatalError(error);
  }
}

elements.form.addEventListener("submit", saveMeal);
elements.cancel.addEventListener("click", () => {
  resetForm(state.weekAnchor);
  setStatus("Modifica annullata.");
});
elements.list.addEventListener("click", event => {
  const button = event.target.closest("button[data-action][data-meal-id]");
  if (!button) return;
  if (button.dataset.action === "edit") editMeal(button.dataset.mealId);
  if (button.dataset.action === "delete") void deleteMeal(button.dataset.mealId);
  if (button.dataset.action === "prep") prepareNewMealPrepTask(button.dataset.mealId);
});
elements.weekGrid.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "edit") editMeal(button.dataset.mealId);
  if (button.dataset.action === "add") prepareNewMeal(button.dataset.date);
});
elements.previousWeek.addEventListener("click", () => {
  void selectWeek(core.addDays(state.weekAnchor, -7));
});
elements.currentWeek.addEventListener("click", () => {
  void selectWeek(core.localDateValue());
});
elements.nextWeek.addEventListener("click", () => {
  void selectWeek(core.addDays(state.weekAnchor, 7));
});
elements.shoppingListForm.addEventListener("submit", saveShoppingItem);
elements.shoppingListRefresh.addEventListener("click", () => void refreshShoppingList());
elements.shoppingListFilter.addEventListener("change", () => {
  state.shoppingListFilter = shoppingListCore?.FILTERS[elements.shoppingListFilter.value]
    ? elements.shoppingListFilter.value
    : "active";
  renderShoppingList();
});
elements.shoppingListItems.addEventListener("click", event => {
  const button = event.target.closest("button[data-shopping-action][data-shopping-id]");
  if (!button) return;
  if (button.dataset.shoppingAction === "delete") {
    void deleteShoppingItem(button.dataset.shoppingId);
    return;
  }
  void updateShoppingItemState(button.dataset.shoppingId, button.dataset.shoppingAction);
});
elements.mealPrepForm.addEventListener("submit", saveMealPrepTask);
elements.mealPrepCancel.addEventListener("click", () => {
  resetMealPrepForm(elements.mealPrepMealId.value);
  setMealPrepStatus("Modifica annullata.");
});
elements.mealPrepMealId.addEventListener("change", () => {
  applyMealPrepMealDefaults();
});
elements.mealPrepItemId.addEventListener("change", () => {
  if (state.mealPrepEditingId) return;
  const meal = mealFor(elements.mealPrepMealId.value);
  const item = mealItemFor(meal, elements.mealPrepItemId.value);
  elements.mealPrepTaskTitle.value = suggestedMealPrepTitle(meal, item);
});
elements.mealPrepType.addEventListener("change", () => {
  if (state.mealPrepEditingId) return;
  const meal = mealFor(elements.mealPrepMealId.value);
  const item = mealItemFor(meal, elements.mealPrepItemId.value);
  elements.mealPrepTaskTitle.value = suggestedMealPrepTitle(meal, item);
});
elements.mealPrepList.addEventListener("click", event => {
  const button = event.target.closest("button[data-prep-action][data-prep-id]");
  if (!button) return;
  if (button.dataset.prepAction === "edit") editMealPrepTask(button.dataset.prepId);
  if (button.dataset.prepAction === "delete") void deleteMealPrepTask(button.dataset.prepId);
  if (button.dataset.prepAction === "status") {
    void updateMealPrepTaskStatus(button.dataset.prepId, button.dataset.prepStatus);
  }
});
elements.menuAnalyze.addEventListener("click", () => void analyzeMenuPlan());
elements.menuStage.addEventListener("click", () => void stageMenuPlan());
elements.menuPreviewRefresh.addEventListener("click", () => void loadMenuPreviewRequests({ announce: true }));
elements.menuPreviewInbox.addEventListener("click", handleMenuPreviewInboxClick);
elements.menuResult.addEventListener("change", handleMenuResolutionChange);
elements.menuResult.addEventListener("click", handleMenuResultClick);
elements.menuClear.addEventListener("click", () => {
  resetMenuImport();
  setStatus("Analisi menu azzerata. Nessun dato è stato modificato.");
});
elements.menuFile.addEventListener("change", () => void loadMenuPlanFile());
elements.retry.addEventListener("click", () => void initialize());

void initialize();
