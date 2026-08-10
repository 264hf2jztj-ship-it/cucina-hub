"use strict";

const client = window.cucinaHubSupabase;
const engine = window.CucinaHubGlobalSearchEngine;

const DATA_SOURCES = Object.freeze([
  { key: "knowledgeObjects", table: "knowledge_objects", ownerScoped: true },
  { key: "knowledgeObjectLinks", table: "knowledge_object_links", ownerScoped: true },
  { key: "recipes", table: "recipes", ownerScoped: true },
  { key: "manuals", table: "manuals", ownerScoped: true },
  { key: "courses", table: "courses", ownerScoped: true },
  { key: "courseContents", table: "course_contents", ownerScoped: true },
  { key: "appliances", table: "appliances", ownerScoped: true },
  { key: "bakingSessions", table: "baking_sessions", ownerScoped: true },
  { key: "bakingSessionNotes", table: "baking_session_notes", ownerScoped: true },
  { key: "bakingSessionEvaluations", table: "baking_session_evaluations", ownerScoped: true },
  { key: "ingredients", table: "ingredients", ownerScoped: true },
  { key: "recipeIngredients", table: "recipe_ingredients", ownerScoped: false },
  { key: "tags", table: "tags", ownerScoped: true },
  { key: "recipeTags", table: "recipe_tags", ownerScoped: false },
  { key: "tagLinks", table: "tag_links", ownerScoped: true },
  { key: "applianceManuals", table: "appliance_manuals", ownerScoped: false }
]);

const state = {
  ownerUserId: null,
  index: [],
  tags: [],
  renderTimer: null
};

const elements = {
  status: document.querySelector("#pageStatus"),
  authGate: document.querySelector("#authGate"),
  workspace: document.querySelector("#searchWorkspace"),
  query: document.querySelector("#globalQuery"),
  type: document.querySelector("#typeFilter"),
  tag: document.querySelector("#tagFilter"),
  reset: document.querySelector("#resetSearch"),
  indexedCount: document.querySelector("#indexedCount"),
  resultCount: document.querySelector("#resultCount"),
  results: document.querySelector("#searchResults")
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
  elements.status.className = `knowledge-status${type ? ` ${type}` : ""}`;
}

function assertOk(error, context) {
  if (!error) return;
  const wrapped = new Error(`${context}: ${error.message}`);
  wrapped.code = error.code;
  throw wrapped;
}

async function loadSource(source) {
  let query = client.from(source.table).select("*");
  if (source.ownerScoped) query = query.eq("owner_user_id", state.ownerUserId);
  const { data, error } = await query;
  assertOk(error, `Lettura ${source.table}`);
  return [source.key, data ?? []];
}

async function loadSearchData() {
  const entries = await Promise.all(DATA_SOURCES.map(loadSource));
  const data = Object.fromEntries(entries);
  state.tags = [...data.tags].sort((left, right) =>
    String(left.name ?? "").localeCompare(String(right.name ?? ""), "it-IT", { sensitivity: "base" })
  );
  state.index = engine.buildIndex(data);
}

function typeCounts() {
  const counts = new Map();
  for (const item of state.index) counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
  return counts;
}

function populateFilters() {
  const counts = typeCounts();
  elements.type.innerHTML = [
    `<option value="all">Tutti i tipi (${state.index.length})</option>`,
    ...Object.entries(engine.TYPE_DEFINITIONS).map(([type, config]) =>
      `<option value="${escapeHtml(type)}">${escapeHtml(config.label)} (${counts.get(type) ?? 0})</option>`
    )
  ].join("");

  elements.tag.innerHTML = [
    '<option value="all">Tutti i tag</option>',
    ...state.tags.map(tag => `<option value="${escapeHtml(tag.id)}">#${escapeHtml(tag.name)}</option>`)
  ].join("");
}

function renderTags(item) {
  if (!item.tagNames.length) return "";
  const visible = item.tagNames.slice(0, 4);
  const remaining = item.tagNames.length - visible.length;
  return `
    <div class="search-result-tags" aria-label="Tag">
      ${visible.map(name => `<span class="badge">#${escapeHtml(name)}</span>`).join("")}
      ${remaining ? `<span class="badge pending">+${remaining}</span>` : ""}
    </div>`;
}

function resultCard(item) {
  return `
    <article class="search-result-card">
      <div class="search-result-heading">
        <span class="search-result-icon" aria-hidden="true">${escapeHtml(item.icon)}</span>
        <div>
          <span class="badge">${escapeHtml(item.typeLabel)}</span>
          <h2>${escapeHtml(item.title)}</h2>
        </div>
      </div>
      <p>${escapeHtml(item.summary)}</p>
      ${item.meta ? `<p class="search-result-meta">${escapeHtml(item.meta)}</p>` : ""}
      ${renderTags(item)}
      <div class="search-result-actions">
        <a class="button secondary" href="${escapeHtml(item.href)}">APRI SEZIONE</a>
      </div>
    </article>`;
}

function renderResults() {
  const results = engine.search(state.index, {
    query: elements.query.value,
    type: elements.type.value,
    tagId: elements.tag.value
  });

  elements.indexedCount.textContent = `${state.index.length} contenuti indicizzati`;
  elements.resultCount.textContent = `${results.length} ${results.length === 1 ? "risultato" : "risultati"}`;

  if (!results.length) {
    elements.results.innerHTML = `
      <div class="knowledge-empty search-empty">
        <span aria-hidden="true">🔎</span>
        <h2>Nessun risultato</h2>
        <p>Prova una parola più generale oppure rimuovi uno dei filtri.</p>
      </div>`;
    return;
  }

  elements.results.innerHTML = results.map(resultCard).join("");
}

function scheduleRender() {
  window.clearTimeout(state.renderTimer);
  state.renderTimer = window.setTimeout(renderResults, 90);
}

function resetSearch() {
  elements.query.value = "";
  elements.type.value = "all";
  elements.tag.value = "all";
  renderResults();
  elements.query.focus();
}

function applyInitialQuery() {
  const parameters = new URLSearchParams(window.location.search);
  elements.query.value = parameters.get("q") ?? "";
  const requestedType = parameters.get("type");
  const requestedTag = parameters.get("tag");
  if ([...elements.type.options].some(option => option.value === requestedType)) {
    elements.type.value = requestedType;
  }
  if ([...elements.tag.options].some(option => option.value === requestedTag)) {
    elements.tag.value = requestedTag;
  }
}

async function initialize() {
  if (!client || !engine) {
    elements.authGate.hidden = false;
    setStatus("Il motore di ricerca o il collegamento a Supabase non è disponibile.", "error");
    return;
  }

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
    setStatus("Costruzione dell’indice personale…");
    await loadSearchData();
    populateFilters();
    applyInitialQuery();
    renderResults();
    elements.workspace.hidden = false;
    setStatus(
      state.index.length
        ? "Ricerca globale pronta. L’indice usa soltanto i tuoi dati correnti."
        : "Ricerca pronta, ma non ci sono ancora contenuti da indicizzare.",
      "ok"
    );
  } catch (error) {
    setStatus(`${error.message}. Ricarica la pagina; se il problema continua, verifica le migration 017–038.`, "error");
  }
}

elements.query.addEventListener("input", scheduleRender);
elements.type.addEventListener("change", renderResults);
elements.tag.addEventListener("change", renderResults);
elements.reset.addEventListener("click", resetSearch);

void initialize();
