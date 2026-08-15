"use strict";

const client = window.cucinaHubSupabase;
const core = window.CucinaHubPlannerCore;
const menuPlanEngine = window.CucinaHubMenuPlanImportEngine;

const state = {
  ownerUserId: null,
  recipes: [],
  meals: [],
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

function updateFormAvailability() {
  elements.save.disabled = state.busy || state.recipes.length === 0;
  elements.cancel.disabled = state.busy;
}

function setBusy(busy) {
  state.busy = busy;
  elements.form.setAttribute("aria-busy", String(busy));
  elements.weekGrid.setAttribute("aria-busy", String(busy));
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
}

async function reloadMeals() {
  state.meals = await fetchMealsForWeek(state.weekAnchor);
  renderPlanner();
}

async function selectWeek(anchorDate) {
  if (state.busy || !core.isRealDate(anchorDate)) return;
  const previousAnchor = state.weekAnchor;
  const previousMeals = state.meals;
  setBusy(true);
  setStatus("Caricamento della settimana…");

  try {
    const meals = await fetchMealsForWeek(anchorDate);
    state.weekAnchor = anchorDate;
    state.meals = meals;
    if (state.editingId && !state.meals.some(meal => meal.id === state.editingId)) {
      resetForm(anchorDate);
    }
    renderPlanner();
    setStatus("Settimana caricata.", "ok");
  } catch (error) {
    state.weekAnchor = previousAnchor;
    state.meals = previousMeals;
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
    if (state.editingId === meal.id) resetForm(state.weekAnchor);
    renderPlanner();
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
    state.weekAnchor = state.weekAnchor ?? core.localDateValue();
    await loadData();
    populateRecipes();
    renderPlanner();
    resetForm(state.weekAnchor);
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
    setStatus(
      previewAvailable ? `${baseStatus}${inboxStatus}` : `${baseStatus} Per le anteprime dirette applica la migration 044.`,
      previewAvailable && state.recipes.length ? "ok" : "warning"
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
