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
  menuAnalyzing: false,
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

function menuImportIdleHtml(message = "Nessun pacchetto analizzato.") {
  return `
    <div class="menu-import-idle">
      <strong>${escapeHtml(message)}</strong>
      <span>Il flusso si fermerà dopo l'analisi dei conflitti, senza salvare dati.</span>
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

function menuReferenceHtml(reference) {
  const isResolved = reference.status === "resolved";
  const badge = isResolved
    ? '<span class="badge">RISOLTA</span>'
    : reference.status === "missing_library_reference"
      ? '<span class="badge pending">MANCANTE</span>'
      : '<span class="badge pending">AMBIGUA</span>';
  const title = isResolved
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
      <span class="menu-reference-meta">${escapeHtml(reference.status)} · ${escapeHtml(reference.meal_key)} · ${escapeHtml(reference.path)}</span>
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

function menuConflictHtml(conflict) {
  const presentations = {
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
    <article class="menu-conflict-card">
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
      </div>
    </article>`;
}

function menuConflictAnalysisHtml(analysis) {
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
  if (!analysis.has_conflicts) {
    return `
      <section class="menu-import-section" aria-label="Analisi conflitti completata">
        <h3>Analisi conflitti</h3>
        <div class="menu-conflict-summary ok">
          <strong>Nessun conflitto rilevato</strong>
          <span>Periodo, pasti manuali e contenuti importati protetti sono stati controllati.</span>
          <small>${escapeHtml(scanned.menu_packages ?? 0)} menu · ${escapeHtml(scanned.planned_meals ?? 0)} pasti · ${escapeHtml(scanned.planned_meal_items ?? 0)} elementi esaminati</small>
        </div>
      </section>`;
  }

  return `
    <section class="menu-import-section" aria-label="Conflitti rilevati">
      <h3>Conflitti da risolvere (${analysis.conflicts.length})</h3>
      <p>Nessun record verrà sovrascritto: le scelte di risoluzione saranno aggiunte nella prossima anteprima operativa.</p>
      <div class="menu-conflict-list">${analysis.conflicts.map(menuConflictHtml).join("")}</div>
    </section>`;
}

function renderMenuPlanAnalysis(result) {
  const phaseLabels = {
    parsing: "Parsing",
    validation: "Validazione contratto",
    library_resolution: "Risoluzione Biblioteca",
    idempotency: "Identità e retry",
    conflict_analysis: "Analisi conflitti"
  };
  const phase = phaseLabels[result.stage] ?? "Analisi";
  const resolutionComplete = result.resolution?.complete === true;
  const idempotency = result.idempotency ?? null;
  const conflictAnalysis = result.conflictAnalysis ?? null;
  const duplicateRetry = idempotency?.status === "already_imported";
  const conflictUnavailable = conflictAnalysis?.status === "check_unavailable";
  const hasConflicts = conflictAnalysis?.has_conflicts === true;
  const success = result.valid
    && resolutionComplete
    && idempotency?.blocking !== true
    && !conflictUnavailable
    && !hasConflicts;
  let tone = "error";
  let heading = "Il JSON non è stato letto";
  let description = `Il flusso si è fermato nella fase: ${phase}. Nessun dato è stato salvato.`;

  if (idempotency?.blocking) {
    heading = "Controllo retry bloccato";
  } else if (conflictUnavailable) {
    heading = "Analisi conflitti non disponibile";
  } else if (duplicateRetry) {
    tone = "warning";
    heading = "Retry riconosciuto e fermato";
    description = "Il contenuto coincide con una revisione già nota. Nessun duplicato è stato creato.";
  } else if (hasConflicts) {
    tone = "warning";
    heading = "Conflitti da risolvere";
    description = `Sono stati rilevati ${conflictAnalysis.conflicts.length} conflitti. Nessun dato è stato salvato o sovrascritto.`;
  } else if (success) {
    tone = "ok";
    heading = "Analisi tecnica completata";
    description = conflictAnalysis
      ? "Parsing, validazione, risoluzione, retry e conflitti sono stati controllati. Nessun dato è stato salvato."
      : idempotency
        ? "Parsing, validazione, risoluzione e controllo retry sono riusciti. Nessun dato è stato salvato."
        : "Parsing, validazione e risoluzione sono riusciti. Nessun dato è stato salvato.";
  } else if (result.stage === "library_resolution") {
    heading = "Riferimenti Biblioteca da correggere";
  } else if (result.stage === "validation") {
    heading = "Pacchetto non conforme al contratto";
  }
  const structuralErrors = result.stage === "library_resolution"
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
          ? `<div class="menu-reference-list">${result.resolution.references.map(menuReferenceHtml).join("")}</div>`
          : '<div class="menu-import-idle"><strong>Nessun item recipe.</strong><span>Il menu contiene soltanto alimenti o preparazioni autonome.</span></div>'}
      </section>` : ""}
    ${idempotency ? menuIdempotencyHtml(idempotency) : ""}
    ${conflictAnalysis ? menuConflictAnalysisHtml(conflictAnalysis) : ""}
    <div class="menu-import-boundary">
      <strong>Limite attuale del flusso: “Analisi conflitti”.</strong><br>
      Scelte di risoluzione, conferma e commit non sono attivi in questo incremento.
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
}

async function analyzeMenuPlan() {
  if (!menuPlanEngine) {
    renderMenuPlanUnavailable();
    return;
  }
  if (state.menuAnalyzing || state.busy) return;

  setMenuAnalysisBusy(true);
  elements.menuResult.setAttribute("aria-busy", "true");
  setStatus("Analisi del menu, retry e conflitti…");

  try {
    let result = menuPlanEngine.analyze(elements.menuInput.value, state.recipes);
    if (result.valid) {
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
          valid: result.valid && !idempotency.blocking,
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

    renderMenuPlanAnalysis(result);
    const idempotency = result.idempotency;
    const conflictAnalysis = result.conflictAnalysis;
    if (conflictAnalysis?.status === "check_unavailable") {
      setStatus("Analisi conflitti non disponibile. Nessun dato salvato.", "error");
    } else if (conflictAnalysis?.has_conflicts) {
      setStatus(`${conflictAnalysis.conflicts.length} conflitti da risolvere. Nessun dato salvato o sovrascritto.`, "warning");
    } else if (conflictAnalysis?.complete) {
      setStatus("Menu valido: nessun conflitto rilevato. Nessun dato salvato.", "ok");
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
  elements.menuInput.value = "";
  elements.menuFile.value = "";
  elements.menuFileStatus.textContent = "Puoi scegliere un file JSON, Markdown o testo fino a 2 MB.";
  elements.menuResult.innerHTML = menuImportIdleHtml();
  elements.menuResult.setAttribute("aria-busy", "false");
}

async function loadMenuPlanFile() {
  const file = elements.menuFile.files?.[0];
  if (!file) return;
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
  elements.workspace.querySelectorAll("button").forEach(button => {
    button.disabled = busy;
  });
  elements.menuAnalyze.disabled = busy || state.menuAnalyzing || !menuPlanEngine;
  elements.menuClear.disabled = busy || state.menuAnalyzing;
  elements.menuInput.disabled = busy || state.menuAnalyzing;
  elements.menuFile.disabled = busy || state.menuAnalyzing;
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
  const recipe = recipeFor(meal.recipe_id);
  const label = recipeLabel(recipe);
  const time = core.normalizeTime(meal.planned_time);
  const ariaLabel = `Modifica ${slot.label}: ${label}${time ? ` alle ${time}` : ""}`;

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
    .select("*")
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
elements.menuClear.addEventListener("click", () => {
  resetMenuImport();
  setStatus("Analisi menu azzerata. Nessun dato è stato modificato.");
});
elements.menuFile.addEventListener("change", () => void loadMenuPlanFile());
elements.retry.addEventListener("click", () => void initialize());

void initialize();
