"use strict";

const APP_VERSION = "1.1";

const DATA_FILES = {
  recipes: "ricette.json",
  appliances: "elettrodomestici.json",
  categories: "categorie.json",
  changelog: "changelog.json",
  huromGuide: "hurom-guide.json"
};

const state = {
  recipes: [],
  appliances: [],
  categories: [],
  changelog: [],
  huromGuide: {},
  meta: {},
  currentView: "dashboard",
  recipeQuery: "",
  recipeStatus: "all",
  recipeAppliance: "all",
  huromSection: null,
  huromIngredientQuery: ""
};

const elements = {
  root: document.querySelector("#viewRoot"),
  loading: document.querySelector("#loadingState"),
  error: document.querySelector("#errorState"),
  nav: document.querySelector("#mainNav"),
  sidebar: document.querySelector("#sidebar"),
  menuButton: document.querySelector("#menuButton"),
  version: document.querySelector("#appVersion"),
  dialog: document.querySelector("#recipeDialog"),
  dialogContent: document.querySelector("#recipeDialogContent")
};

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(value = "") {
  return String(value).toLocaleLowerCase("it-IT").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function stars(score = 0) {
  const rounded = Math.max(0, Math.min(5, Math.round(score)));
  return `${"★".repeat(rounded)}${"☆".repeat(5 - rounded)}`;
}

async function loadJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Impossibile caricare ${url}`);
  return response.json();
}

async function init() {
  try {
    const [recipesData, appliancesData, categoriesData, changelogData, huromGuideData] = await Promise.all([
      loadJson(DATA_FILES.recipes),
      loadJson(DATA_FILES.appliances),
      loadJson(DATA_FILES.categories),
      loadJson(DATA_FILES.changelog),
      loadJson(DATA_FILES.huromGuide)
    ]);

    state.recipes = recipesData.ricette ?? [];
    state.meta = recipesData.meta ?? {};
    state.appliances = appliancesData.elettrodomestici ?? [];
    state.categories = categoriesData.categorie ?? [];
    state.changelog = changelogData.versioni ?? [];
    state.huromGuide = huromGuideData;
    elements.version.textContent = APP_VERSION;

    elements.loading.hidden = true;
    elements.root.hidden = false;
    bindEvents();
    const parameters = new URLSearchParams(window.location.search);
    const requestedView = parameters.get("view");
    const allowedViews = new Set([
      "dashboard", "recipes", "hurom", "ninja", "pizza", "appliances", "changelog"
    ]);
    renderView(allowedViews.has(requestedView) ? requestedView : "dashboard");

    const requestedRecipe = parameters.get("recipe");
    if (requestedRecipe && state.recipes.some(recipe => recipe.id === requestedRecipe)) {
      window.setTimeout(() => openRecipe(requestedRecipe), 0);
    }
    registerServiceWorker();
  } catch (error) {
    console.error(error);
    elements.loading.hidden = true;
    elements.error.hidden = false;
    elements.error.innerHTML = `
      <div>
        <h2>Non riesco a caricare i dati</h2>
        <p>${escapeHtml(error.message)}</p>
        <p>Apri l’app tramite GitHub Pages o un server locale, non direttamente come file.</p>
      </div>`;
  }
}

function bindEvents() {
  elements.nav.addEventListener("click", event => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    renderView(button.dataset.view);
    closeMobileMenu();
  });

  elements.menuButton.addEventListener("click", () => {
    const open = elements.sidebar.classList.toggle("is-open");
    elements.menuButton.setAttribute("aria-expanded", String(open));
  });

  elements.root.addEventListener("click", event => {
    const viewButton = event.target.closest("[data-go-view]");
    if (viewButton) renderView(viewButton.dataset.goView);

    const huromSectionButton = event.target.closest("[data-hurom-section]");
    if (huromSectionButton) renderHuromSection(huromSectionButton.dataset.huromSection);

    const huromIndexButton = event.target.closest("[data-hurom-index]");
    if (huromIndexButton) renderHuromHub();

    const recipeButton = event.target.closest("[data-recipe-id]");
    if (recipeButton) openRecipe(recipeButton.dataset.recipeId);
  });

  elements.root.addEventListener("input", event => {
    if (!event.target.matches("#huromIngredientSearch")) return;
    state.huromIngredientQuery = event.target.value;
    updateHuromIngredientGrid();
  });
}

function closeMobileMenu() {
  elements.sidebar.classList.remove("is-open");
  elements.menuButton.setAttribute("aria-expanded", "false");
}

function renderView(view) {
  state.currentView = view;
  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });

  const renderers = {
    dashboard: renderDashboard,
    recipes: renderRecipes,
    hurom: renderHuromHub,
    ninja: () => renderCategory("ninja"),
    pizza: () => renderCategory("pizza-impasti"),
    appliances: renderAppliances,
    changelog: renderChangelog
  };

  elements.root.innerHTML = "";
  (renderers[view] ?? renderDashboard)();
  window.dispatchEvent(new CustomEvent("cucina-hub:view-rendered", { detail: { view } }));
  document.querySelector("#main-content").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderDashboard() {
  const certified = state.recipes.filter(r => r.stato === "certificata");
  const testing = state.recipes.filter(r => r.stato === "da-testare");

  elements.root.innerHTML = `
    <section class="hero">
      <div class="hero-panel">
        <p class="eyebrow" style="color:rgba(255,255,255,.72)">Dashboard personale</p>
        <h2>La tua cucina, oggi.</h2>
        <p>Controlla pasti, preparazioni, spesa e notifiche senza aprire ogni singola sezione.</p>
        <div class="hero-actions">
          <a class="button light" href="planner/index.html?v=14">APRI IL PLANNER</a>
          <a class="button ghost" href="knowledge/search.html?v=1">CERCA IN CUCINA HUB</a>
        </div>
      </div>
      <aside id="dashboardNextMeal" class="today-panel" aria-live="polite">
        <div><div class="big-icon" aria-hidden="true">⏳</div><p class="eyebrow">Prossimo pasto</p><h3>Caricamento…</h3><p>Sto leggendo il Planner personale.</p></div>
      </aside>
    </section>

    <p id="dashboardDataStatus" class="dashboard-data-status" role="status" aria-live="polite">Caricamento del riepilogo personale…</p>

    <section class="metric-grid dashboard-metrics" aria-label="Riepilogo operativo">
      ${metricCard("Pasti di oggi", "—", "lettura del Planner…", "dashboardMealMetric")}
      ${metricCard("Meal Prep", "—", "lettura delle attività…", "dashboardPrepMetric")}
      ${metricCard("Lista spesa", "—", "lettura della settimana…", "dashboardShoppingMetric")}
      ${metricCard("Notifiche", "—", "lettura degli avvisi…", "dashboardNotificationMetric")}
    </section>

    <section class="section dashboard-agenda-section" aria-labelledby="dashboardAgendaTitle">
      <div class="section-heading">
        <div><h3 id="dashboardAgendaTitle">Oggi e prossimi impegni</h3><p>Pasti e preparazioni ordinati per data e orario.</p></div>
        <a class="card-link" href="planner/calendar.html?v=3">Calendario →</a>
      </div>
      <div id="dashboardAgenda" class="dashboard-agenda" aria-live="polite">
        <div class="dashboard-agenda-empty"><span aria-hidden="true">⏳</span><strong>Caricamento agenda…</strong></div>
      </div>
    </section>

    <section class="section">
      <div class="section-heading">
        <div><h3>Azioni rapide</h3><p>Vai direttamente alla funzione che ti serve.</p></div>
      </div>
      <div class="dashboard-action-grid">
        ${dashboardAction("🗓️", "Planner Hub", "Riepilogo settimanale e pianificazione", "planner/index.html?v=14")}
        ${dashboardAction("🛒", "Lista spesa", "Controlla e spunta gli acquisti", "planner/workspace.html?v=14&section=shopping-list")}
        ${dashboardAction("🧰", "Meal Prep", "Preparazioni da fare e completare", "planner/workspace.html?v=14&section=meal-prep")}
        ${dashboardAction("🔔", "Notifiche", "Promemoria e avvisi personali", "planner/notifications.html?v=2")}
        ${dashboardAction("🍕", "Laboratorio", "Impasti, sessioni e risultati", "fermentation/index.html?v=1")}
        ${dashboardAction("🔎", "Ricerca", "Trova contenuti e conoscenza", "knowledge/search.html?v=1")}
      </div>
    </section>

    <section class="section dashboard-library-section">
      <div class="section-heading">
        <div><h3>Biblioteca in breve</h3><p>${certified.length} ricette certificate e ${testing.length} ancora da provare.</p></div>
        <button class="card-link" data-go-view="recipes" type="button">Apri ricette →</button>
      </div>
      <div class="card-grid">${certified.slice(0, 3).map(recipeCard).join("")}</div>
    </section>`;
}

function metricCard(label, value, detail, id = "") {
  return `<article${id ? ` id="${escapeHtml(id)}"` : ""} class="metric-card"><span class="metric-label">${escapeHtml(label)}</span><strong class="metric-value">${escapeHtml(value)}</strong><div class="metric-detail">${escapeHtml(detail)}</div></article>`;
}

function dashboardAction(icon, title, description, href) {
  return `<a class="dashboard-action" href="${escapeHtml(href)}"><span aria-hidden="true">${icon}</span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></div><b aria-hidden="true">→</b></a>`;
}

function categoryCard(category) {
  const count = state.recipes.filter(recipe => recipe.sezioni?.includes(category.id)).length;
  const statusLabel = category.stato === "attiva"
    ? (category.etichetta_stato ?? `${count} ricette`)
    : "In sviluppo";
  const badgeClass = category.stato === "attiva" ? "" : "pending";
  const actionLabel = `${category.etichetta_azione ?? "Apri sezione"} →`;
  const action = category.href
    ? `<a class="card-link" href="${escapeHtml(category.href)}">${escapeHtml(actionLabel)}</a>`
    : `<button class="card-link" data-go-view="${escapeHtml(category.vista)}" type="button">${escapeHtml(actionLabel)}</button>`;
  return `
    <article class="content-card">
      <div class="card-top"><span class="card-icon" aria-hidden="true">${escapeHtml(category.icona)}</span><span class="badge ${badgeClass}">${escapeHtml(statusLabel)}</span></div>
      <h4>${escapeHtml(category.titolo)}</h4>
      <p>${escapeHtml(category.descrizione)}</p>
      <div class="card-footer">${action}</div>
    </article>`;
}

function renderRecipes() {
  elements.root.innerHTML = `
    <header class="page-header">
      <div><p class="eyebrow">Archivio centrale</p><h2>Tutte le ricette</h2><p>Una ricetta può appartenere a più sezioni e utilizzare più strumenti.</p></div>
    </header>
    <section class="toolbar" aria-label="Filtri ricette">
      <div class="field"><label for="recipeSearch">Cerca per nome o ingrediente</label><input id="recipeSearch" type="search" placeholder="Es. pera, post corsa, arancia" value="${escapeHtml(state.recipeQuery)}"></div>
      <div class="field"><label for="recipeStatus">Stato</label><select id="recipeStatus"><option value="all">Tutte</option><option value="certificata">Certificate</option><option value="da-testare">Da testare</option></select></div>
      <div class="field"><label for="recipeAppliance">Elettrodomestico</label><select id="recipeAppliance"><option value="all">Tutti</option>${applianceOptions()}</select></div>
    </section>
    <p id="resultCount" class="result-count" aria-live="polite"></p>
    <section id="recipeGrid" class="card-grid"></section>`;

  const search = document.querySelector("#recipeSearch");
  const status = document.querySelector("#recipeStatus");
  const appliance = document.querySelector("#recipeAppliance");
  status.value = state.recipeStatus;
  appliance.value = state.recipeAppliance;

  const update = () => {
    state.recipeQuery = search.value;
    state.recipeStatus = status.value;
    state.recipeAppliance = appliance.value;
    updateRecipeGrid();
  };
  search.addEventListener("input", update);
  status.addEventListener("change", update);
  appliance.addEventListener("change", update);
  updateRecipeGrid();
}

function applianceOptions() {
  const ids = [...new Set(state.recipes.flatMap(recipe => recipe.elettrodomestici ?? []))];
  return ids.map(id => {
    const device = state.appliances.find(item => item.id === id);
    return `<option value="${escapeHtml(id)}">${escapeHtml(device?.nome ?? id)}</option>`;
  }).join("");
}

function updateRecipeGrid() {
  const query = normalize(state.recipeQuery);
  const filtered = state.recipes.filter(recipe => {
    const haystack = normalize([recipe.codice, recipe.titolo, recipe.categoria, ...(recipe.ingredienti ?? []).map(i => i.nome), ...(recipe.tags ?? [])].join(" "));
    const matchesQuery = !query || haystack.includes(query);
    const matchesStatus = state.recipeStatus === "all" || recipe.stato === state.recipeStatus;
    const matchesDevice = state.recipeAppliance === "all" || recipe.elettrodomestici?.includes(state.recipeAppliance);
    return matchesQuery && matchesStatus && matchesDevice;
  });

  document.querySelector("#resultCount").textContent = `${filtered.length} ricett${filtered.length === 1 ? "a" : "e"} trovate`;
  document.querySelector("#recipeGrid").innerHTML = filtered.length ? filtered.map(recipeCard).join("") : emptyStateHtml("Nessuna ricetta corrisponde ai filtri selezionati.");
}

function recipeCard(recipe) {
  const ingredients = (recipe.ingredienti ?? []).slice(0, 4).map(i => i.quantita ? `${i.quantita} ${i.nome}` : i.nome).join(" · ");
  const status = recipe.stato === "certificata" ? "Certificata" : "Da testare";
  const badgeClass = recipe.stato === "certificata" ? "" : "test";
  return `
    <article class="content-card recipe-card">
      <div class="card-top"><span class="card-icon" aria-hidden="true">${escapeHtml(recipe.icona ?? "🍽️")}</span><span class="badge ${badgeClass}">${escapeHtml(status)}</span></div>
      <h4>${escapeHtml(recipe.codice)} — ${escapeHtml(recipe.titolo)}</h4>
      <p>${escapeHtml(recipe.categoria)}</p>
      <div class="recipe-meta">
        ${recipe.filtro ? `<span class="badge">Filtro ${escapeHtml(recipe.filtro)}</span>` : ""}
        ${recipe.resa ? `<span class="badge">${escapeHtml(recipe.resa)}</span>` : ""}
      </div>
      <div class="recipe-ingredients-preview">${escapeHtml(ingredients)}</div>
      <div class="card-footer"><span class="rating" aria-label="Valutazione ${recipe.valutazione_globale ?? 0} su 5">${stars(recipe.valutazione_globale ?? 0)}</span><button class="card-link" data-recipe-id="${escapeHtml(recipe.id)}" type="button">Dettagli →</button></div>
    </article>`;
}

function renderCategory(categoryId) {
  const category = state.categories.find(item => item.id === categoryId);
  const recipes = state.recipes.filter(recipe => recipe.sezioni?.includes(categoryId));
  const appliance = state.appliances.find(item => item.sezione === categoryId);

  elements.root.innerHTML = `
    <header class="page-header"><div><p class="eyebrow">Sezione dedicata</p><h2>${escapeHtml(category?.icona ?? "🍽️")} ${escapeHtml(category?.titolo ?? "Sezione")}</h2><p>${escapeHtml(category?.descrizione ?? "")}</p></div></header>
    ${appliance ? applianceCallout(appliance) : ""}
    <section class="section">
      <div class="section-heading"><div><h3>Ricette</h3><p>${recipes.length ? "Contenuti già presenti in questa area." : "La struttura è pronta per le prossime ricette."}</p></div></div>
      <div class="card-grid">${recipes.length ? recipes.map(recipeCard).join("") : emptyStateHtml("Nessuna ricetta inserita in questa sezione.")}</div>
    </section>`;
}

function renderHuromHub() {
  state.huromSection = null;
  const category = state.categories.find(item => item.id === "hurom");
  const appliance = state.appliances.find(item => item.sezione === "hurom");
  const recipes = huromRecipes();
  const certified = recipes.filter(recipe => recipe.stato === "certificata");
  const experiments = recipes.filter(recipe => recipe.stato === "da-testare");
  const guide = state.huromGuide;

  elements.root.innerHTML = `
    <header class="page-header hurom-page-header">
      <div>
        <p class="eyebrow">Manuale personale v${escapeHtml(guide.meta?.versione_fonte ?? "3.0")}</p>
        <h2>${escapeHtml(category?.icona ?? "🥤")} ${escapeHtml(category?.titolo ?? "Hurom E30ST")}</h2>
        <p>Ricette, guida operativa e consultazione rapida dell'estrattore in un unico indice.</p>
      </div>
    </header>
    ${appliance ? applianceCallout(appliance) : ""}
    <section class="metric-grid hurom-metrics" aria-label="Riepilogo Hurom">
      ${metricCard("Ricette certificate", certified.length, "Provate e approvate")}
      ${metricCard("Ricette sperimentali", experiments.length, "Ancora da testare")}
      ${metricCard("Ingredienti", guide.ingredienti?.length ?? 0, "Schede consultabili")}
      ${metricCard("Aree della guida", guide.navigazione?.length ?? 0, "Indice completo")}
    </section>
    <section class="section hurom-index-section" aria-labelledby="huromIndexTitle">
      <div class="section-heading">
        <div>
          <h3 id="huromIndexTitle">Cosa vuoi consultare?</h3>
          <p>Tocca una card per aprire la relativa sezione.</p>
        </div>
      </div>
      <div class="hurom-topic-grid">
        ${(guide.navigazione ?? []).map(huromTopicCard).join("")}
      </div>
    </section>`;

  completeHuromNavigation();
}

function huromRecipes() {
  return state.recipes.filter(recipe => recipe.sezioni?.includes("hurom"));
}

function huromTopicCard(section) {
  const recipes = huromRecipes();
  const labels = {
    ricette: `${recipes.filter(recipe => recipe.stato === "certificata").length} certificate · ${recipes.filter(recipe => recipe.stato === "da-testare").length} sperimentali`,
    "guida-operativa": `${state.huromGuide.guida_operativa?.sequenza?.length ?? 0} passaggi`,
    filtri: `${state.huromGuide.filtri?.opzioni?.length ?? 0} filtri`,
    "tabella-rapida": `${state.huromGuide.tabella_rapida?.righe?.length ?? 0} ingredienti`,
    tecniche: "Resa e scorrevolezza",
    faq: `${state.huromGuide.faq?.length ?? 0} risposte`,
    ingredienti: `${state.huromGuide.ingredienti?.length ?? 0} schede`,
    obiettivi: `${state.huromGuide.obiettivi?.length ?? 0} obiettivi`,
    stagionalita: `${state.huromGuide.stagionalita?.ingredienti?.length ?? 0} ingredienti`,
    polpa: `${state.huromGuide.polpa?.usi?.length ?? 0} riutilizzi`,
    glossario: `${state.huromGuide.glossario?.length ?? 0} termini`
  };

  return `
    <button class="hurom-topic-card" data-hurom-section="${escapeHtml(section.id)}" type="button">
      <span class="hurom-topic-top">
        <span class="hurom-topic-icon" aria-hidden="true">${escapeHtml(section.icona)}</span>
        <span class="badge">${escapeHtml(labels[section.id] ?? "Guida pratica")}</span>
      </span>
      <strong>${escapeHtml(section.titolo)}</strong>
      <span class="hurom-topic-description">${escapeHtml(section.descrizione)}</span>
      <span class="hurom-topic-action">Apri sezione <span aria-hidden="true">→</span></span>
    </button>`;
}

function renderHuromSection(sectionId) {
  const section = state.huromGuide.navigazione?.find(item => item.id === sectionId);
  const renderers = {
    ricette: renderHuromRecipesContent,
    "guida-operativa": renderHuromOperatingGuideContent,
    filtri: renderHuromFiltersContent,
    "tabella-rapida": renderHuromQuickTableContent,
    tecniche: renderHuromTechniquesContent,
    faq: renderHuromFaqContent,
    ingredienti: renderHuromIngredientsContent,
    obiettivi: renderHuromObjectivesContent,
    stagionalita: renderHuromSeasonsContent,
    polpa: renderHuromPulpContent,
    glossario: renderHuromGlossaryContent
  };

  if (!section || !renderers[sectionId]) {
    renderHuromHub();
    return;
  }

  state.huromSection = sectionId;
  elements.root.innerHTML = `
    ${huromBackButtonHtml()}
    <header class="page-header hurom-detail-header">
      <div>
        <p class="eyebrow">Guida Hurom E30ST</p>
        <h2><span aria-hidden="true">${escapeHtml(section.icona)}</span> ${escapeHtml(section.titolo)}</h2>
        <p>${escapeHtml(section.descrizione)}</p>
      </div>
    </header>
    ${renderers[sectionId]()}
    <div class="hurom-back-footer">${huromBackButtonHtml()}</div>`;

  if (sectionId === "ingredienti") updateHuromIngredientGrid();
  completeHuromNavigation();
}

function huromBackButtonHtml() {
  return `<nav class="hurom-back-row" aria-label="Navigazione sezione Hurom"><button class="button secondary" data-hurom-index type="button"><span aria-hidden="true">←</span> Torna all'indice Hurom</button></nav>`;
}

function completeHuromNavigation() {
  document.querySelector("#main-content").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderHuromRecipesContent() {
  const recipes = huromRecipes();
  const certified = recipes.filter(recipe => recipe.stato === "certificata");
  const experiments = recipes.filter(recipe => recipe.stato === "da-testare");

  return `
    <aside class="hurom-note"><strong>Archivio unico</strong><span>Queste schede provengono dal ricettario centrale: ogni aggiornamento appare qui senza creare copie.</span></aside>
    <section class="section" aria-labelledby="huromCertifiedTitle">
      <div class="section-heading"><div><h3 id="huromCertifiedTitle">Ricette certificate</h3><p>Già preparate e approvate.</p></div><span class="badge">${certified.length} ricette</span></div>
      <div class="card-grid">${certified.map(recipeCard).join("")}</div>
    </section>
    <section class="section" aria-labelledby="huromExperimentsTitle">
      <div class="section-heading"><div><h3 id="huromExperimentsTitle">Ricette sperimentali</h3><p>Esperimenti ancora da testare o perfezionare.</p></div><span class="badge test">${experiments.length} ricette</span></div>
      <div class="card-grid">${experiments.map(recipeCard).join("")}</div>
    </section>`;
}

function renderHuromOperatingGuideContent() {
  const guide = state.huromGuide.guida_operativa;
  return `
    <section class="hurom-content-section" aria-labelledby="huromSequenceTitle">
      <h3 id="huromSequenceTitle">Sequenza standard per un estratto</h3>
      <ol class="hurom-step-list">
        ${(guide.sequenza ?? []).map(step => `<li><span>${escapeHtml(step)}</span></li>`).join("")}
      </ol>
    </section>
    <aside class="hurom-alert"><strong>Da ricordare</strong><span>${escapeHtml(guide.promemoria)}</span></aside>
    <section class="hurom-content-section hurom-list-panel" aria-labelledby="huromSafetyTitle">
      <h3 id="huromSafetyTitle">Sicurezza e pulizia</h3>
      <ul class="hurom-check-list">${(guide.sicurezza ?? []).map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>`;
}

function renderHuromFiltersContent() {
  const filters = state.huromGuide.filtri;
  return `
    <section class="hurom-filter-grid" aria-label="Confronto filtri">
      ${(filters.opzioni ?? []).map((filter, index) => `
        <article class="hurom-filter-card ${index === 0 ? "is-default" : ""}">
          <div class="card-top"><span class="hurom-filter-icon" aria-hidden="true">${index === 0 ? "💧" : "🥛"}</span>${index === 0 ? '<span class="badge">Default</span>' : '<span class="badge test">Opzionale</span>'}</div>
          <h3>Filtro ${escapeHtml(filter.nome)}</h3>
          <dl class="hurom-spec-list">
            <div><dt>Uso</dt><dd>${escapeHtml(filter.uso)}</dd></div>
            <div><dt>Risultato</dt><dd>${escapeHtml(filter.risultato)}</dd></div>
            <div><dt>Esempi</dt><dd>${escapeHtml(filter.esempi)}</dd></div>
          </dl>
        </article>`).join("")}
    </section>
    <aside class="hurom-note"><strong>Regola del ricettario</strong><span>${escapeHtml(filters.regola)}</span></aside>
    <aside class="hurom-note neutral"><strong>Accessorio</strong><span>${escapeHtml(filters.accessorio)}</span></aside>
    <section class="hurom-content-section hurom-list-panel"><h3>Acqua e altri liquidi</h3><p>${escapeHtml(filters.liquidi)}</p></section>`;
}

function renderHuromQuickTableContent() {
  const table = state.huromGuide.tabella_rapida;
  return `
    <div class="hurom-table-wrap" tabindex="0" role="region" aria-label="Tabella preparazione ingredienti">
      <table class="hurom-table">
        <thead><tr><th scope="col">Ingrediente</th><th scope="col">Buccia</th><th scope="col">Semi o parti da togliere</th><th scope="col">Sera prima</th></tr></thead>
        <tbody>${(table.righe ?? []).map(row => `<tr><th scope="row">${escapeHtml(row.ingrediente)}</th><td>${escapeHtml(row.buccia)}</td><td>${escapeHtml(row.semi)}</td><td>${escapeHtml(row.sera_prima)}</td></tr>`).join("")}</tbody>
      </table>
    </div>
    <aside class="hurom-note"><strong>Routine pratica della sera</strong><span>${escapeHtml(table.routine)}</span></aside>`;
}

function renderHuromTechniquesContent() {
  const techniques = state.huromGuide.tecniche;
  return `
    <section class="hurom-content-section hurom-list-panel" aria-labelledby="huromLayersTitle">
      <h3 id="huromLayersTitle">Come disporre gli ingredienti</h3>
      <ul class="hurom-check-list">${(techniques.disposizione ?? []).map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>
    <div class="hurom-info-grid">
      <article class="hurom-info-card"><span class="hurom-info-icon" aria-hidden="true">↩️</span><h3>Se la coclea si ferma</h3><p>${escapeHtml(techniques.coclea)}</p></article>
      <article class="hurom-info-card"><span class="hurom-info-icon" aria-hidden="true">🧊</span><h3>Conservazione del succo</h3><p>${escapeHtml(techniques.conservazione)}</p></article>
    </div>`;
}

function renderHuromFaqContent() {
  return `
    <section class="hurom-faq-list" aria-label="Domande frequenti Hurom">
      ${(state.huromGuide.faq ?? []).map((item, index) => `
        <details class="hurom-faq-item"${index === 0 ? " open" : ""}>
          <summary>${escapeHtml(item.domanda)}</summary>
          <p>${escapeHtml(item.risposta)}</p>
        </details>`).join("")}
    </section>`;
}

function renderHuromIngredientsContent() {
  return `
    <aside class="hurom-note neutral"><strong>Come leggere le schede</strong><span>${escapeHtml(state.huromGuide.nota_ingredienti)}</span></aside>
    <section class="hurom-search-panel" aria-label="Cerca nell'enciclopedia">
      <div class="field">
        <label for="huromIngredientSearch">Cerca ingrediente, nutriente o abbinamento</label>
        <input id="huromIngredientSearch" type="search" placeholder="Es. carota, vitamina C, zenzero" value="${escapeHtml(state.huromIngredientQuery)}">
      </div>
      <p id="huromIngredientCount" class="result-count" aria-live="polite"></p>
    </section>
    <section id="huromIngredientGrid" class="hurom-ingredient-grid" aria-label="Schede ingredienti"></section>`;
}

function updateHuromIngredientGrid() {
  const grid = document.querySelector("#huromIngredientGrid");
  const count = document.querySelector("#huromIngredientCount");
  if (!grid || !count) return;

  const query = normalize(state.huromIngredientQuery);
  const ingredients = (state.huromGuide.ingredienti ?? []).filter(item => {
    const haystack = normalize([item.nome, item.preparazione, item.filtro, item.nutrienti, item.ruolo, ...(item.abbinamenti ?? [])].join(" "));
    return !query || haystack.includes(query);
  });

  count.textContent = ingredients.length === 1
    ? "1 ingrediente trovato"
    : `${ingredients.length} ingredienti trovati`;
  grid.innerHTML = ingredients.length
    ? ingredients.map(huromIngredientCard).join("")
    : emptyStateHtml("Nessun ingrediente corrisponde alla ricerca.");
}

function huromIngredientCard(item) {
  return `
    <article class="hurom-ingredient-card">
      <div class="card-top"><h3>${escapeHtml(item.nome)}</h3><span class="badge">${escapeHtml(item.filtro)}</span></div>
      <dl class="hurom-spec-list">
        <div><dt>Preparazione</dt><dd>${escapeHtml(item.preparazione)}</dd></div>
        <div><dt>Nutrienti</dt><dd>${escapeHtml(item.nutrienti)}</dd></div>
        <div><dt>Ruolo</dt><dd>${escapeHtml(item.ruolo)}</dd></div>
      </dl>
      <div class="hurom-pairings"><strong>Abbina con</strong><div>${(item.abbinamenti ?? []).map(pairing => `<span class="badge">${escapeHtml(pairing)}</span>`).join("")}</div></div>
    </article>`;
}

function renderHuromObjectivesContent() {
  return `
    <section class="hurom-objective-grid" aria-label="Ricette per obiettivo">
      ${(state.huromGuide.obiettivi ?? []).map(objective => `
        <article class="hurom-objective-card">
          <span class="hurom-info-icon" aria-hidden="true">${escapeHtml(objective.icona)}</span>
          <h3>${escapeHtml(objective.nome)}</h3>
          <div class="hurom-recipe-references">${(objective.ricette ?? []).map(huromRecipeReference).join("")}</div>
          ${objective.nota ? `<p>${escapeHtml(objective.nota)}</p>` : ""}
        </article>`).join("")}
    </section>
    <aside class="hurom-note neutral"><strong>Energia reale</strong><span>${escapeHtml(state.huromGuide.nota_energia)}</span></aside>`;
}

function huromRecipeReference(code) {
  const recipe = state.recipes.find(item => item.codice === code);
  if (!recipe) return `<span class="badge pending">${escapeHtml(code)}</span>`;
  const status = recipe.stato === "certificata" ? "Certificata" : "Sperimentale";
  const badgeClass = recipe.stato === "certificata" ? "" : "test";
  return `<button class="hurom-recipe-reference ${badgeClass}" data-recipe-id="${escapeHtml(recipe.id)}" type="button"><strong>${escapeHtml(code)}</strong><span>${escapeHtml(recipe.titolo)}</span><small>${status}</small></button>`;
}

function renderHuromSeasonsContent() {
  const calendar = state.huromGuide.stagionalita;
  return `
    <aside class="hurom-note neutral"><strong>Indicazione generale</strong><span>${escapeHtml(calendar.nota)}</span></aside>
    <div class="hurom-table-wrap" tabindex="0" role="region" aria-label="Calendario stagionale ingredienti">
      <table class="hurom-table hurom-season-table">
        <thead><tr><th scope="col">Ingrediente</th>${(calendar.stagioni ?? []).map(season => `<th scope="col">${escapeHtml(season)}</th>`).join("")}</tr></thead>
        <tbody>${(calendar.ingredienti ?? []).map(item => `<tr><th scope="row">${escapeHtml(item.nome)}</th>${(calendar.stagioni ?? []).map(season => item.stagioni?.includes(season) ? `<td class="is-season"><span aria-label="Disponibile in ${escapeHtml(season)}">●</span></td>` : '<td><span aria-hidden="true">—</span></td>').join("")}</tr>`).join("")}</tbody>
      </table>
    </div>`;
}

function renderHuromPulpContent() {
  const pulp = state.huromGuide.polpa;
  return `
    <section class="hurom-pulp-grid" aria-label="Idee per riutilizzare la polpa">
      ${(pulp.usi ?? []).map(item => `<article class="hurom-info-card"><span class="hurom-info-icon" aria-hidden="true">${escapeHtml(item.icona)}</span><h3>${escapeHtml(item.tipo)}</h3><p>${escapeHtml(item.uso)}</p></article>`).join("")}
    </section>
    <aside class="hurom-alert"><strong>Regola igienica</strong><span>${escapeHtml(pulp.igiene)}</span></aside>`;
}

function renderHuromGlossaryContent() {
  return `
    <dl class="hurom-glossary-grid">
      ${(state.huromGuide.glossario ?? []).map(item => `<div><dt>${escapeHtml(item.termine)}</dt><dd>${escapeHtml(item.definizione)}</dd></div>`).join("")}
    </dl>
    <aside class="hurom-note neutral"><strong>Nota</strong><span>Le indicazioni sono descrittive e non attribuiscono agli estratti proprietà terapeutiche.</span></aside>`;
}

function applianceCallout(appliance) {
  return `<aside class="callout"><h3>${escapeHtml(appliance.nome)}</h3><p>${escapeHtml(appliance.uso_principale)}</p><div class="appliance-tags">${(appliance.usi ?? []).map(tag => `<span class="badge">${escapeHtml(tag)}</span>`).join("")}</div></aside>`;
}

function renderAppliances() {
  elements.root.innerHTML = `
    <header class="page-header"><div><p class="eyebrow">Dotazione personale</p><h2>Elettrodomestici e manuali</h2><p>Schede operative, utilizzi consigliati e stato dei manuali disponibili nel progetto. I PDF completi non vengono pubblicati nel sito.</p></div></header>
    <section class="appliance-list">
      ${state.appliances.map(applianceRow).join("")}
    </section>`;
}

function applianceRow(appliance) {
  const manualLabel = appliance.manuale?.disponibile ? "Manuale disponibile" : "Manuale da aggiungere";
  const badgeClass = appliance.manuale?.disponibile ? "" : "pending";
  return `
    <article class="appliance-row">
      <div class="device-icon" aria-hidden="true">${escapeHtml(appliance.icona)}</div>
      <div>
        <h3>${escapeHtml(appliance.nome)}</h3>
        <p>${escapeHtml(appliance.uso_principale)}</p>
        <div class="appliance-tags">${(appliance.usi ?? []).slice(0, 5).map(tag => `<span class="badge">${escapeHtml(tag)}</span>`).join("")}</div>
      </div>
      <span class="badge ${badgeClass}">${escapeHtml(manualLabel)}</span>
    </article>`;
}

function renderChangelog() {
  elements.root.innerHTML = `
    <header class="page-header"><div><p class="eyebrow">Cronologia</p><h2>Aggiornamenti dell’app</h2><p>Ogni modifica significativa resta registrata nel repository.</p></div></header>
    <section class="timeline">
      ${state.changelog.map(item => `
        <article class="timeline-item">
          <time datetime="${escapeHtml(item.data)}">${formatDate(item.data)}</time>
          <h3>Versione ${escapeHtml(item.versione)} — ${escapeHtml(item.titolo)}</h3>
          <ul>${(item.modifiche ?? []).map(change => `<li>${escapeHtml(change)}</li>`).join("")}</ul>
        </article>`).join("")}
    </section>`;
}

function openRecipe(id) {
  const recipe = state.recipes.find(item => item.id === id);
  if (!recipe) return;

  const ingredients = (recipe.ingredienti ?? []).map(item => `<li>${escapeHtml(item.quantita ? `${item.quantita} ${item.nome}` : item.nome)}</li>`).join("");
  const steps = (recipe.procedimento ?? []).map((step, index) => `<li><strong>${index + 1}.</strong> ${escapeHtml(step)}</li>`).join("");
  const appliances = (recipe.elettrodomestici ?? []).map(deviceId => state.appliances.find(item => item.id === deviceId)?.nome ?? deviceId).join(", ");

  elements.dialogContent.innerHTML = `
    <span class="badge ${recipe.stato === "certificata" ? "" : "test"}">${recipe.stato === "certificata" ? "Ricetta certificata" : "Ricetta da testare"}</span>
    <h2>${escapeHtml(recipe.codice)} — ${escapeHtml(recipe.titolo)}</h2>
    <p>${escapeHtml(recipe.categoria)}</p>
    <div class="detail-grid">
      <div class="detail-box"><strong>Elettrodomestico</strong>${escapeHtml(appliances)}</div>
      <div class="detail-box"><strong>Filtro/accessorio</strong>${escapeHtml(recipe.filtro ?? "Non specificato")}</div>
      <div class="detail-box"><strong>Resa</strong>${escapeHtml(recipe.resa ?? "Da definire")}</div>
      <div class="detail-box"><strong>Preparazione anticipata</strong>${escapeHtml(recipe.preparazione_serale ?? "Non indicata")}</div>
    </div>
    <h3>Ingredienti</h3><ul>${ingredients}</ul>
    <h3>Procedimento</h3><ol class="steps">${steps}</ol>
    ${recipe.perche_funziona ? `<h3>Perché funziona</h3><p>${escapeHtml(recipe.perche_funziona)}</p>` : ""}
    ${recipe.nutrienti ? `<h3>Nutrienti caratteristici</h3><p>${escapeHtml(recipe.nutrienti)}</p>` : ""}
    ${recipe.abbinamento ? `<h3>Abbinamento consigliato</h3><p>${escapeHtml(recipe.abbinamento)}</p>` : ""}
    ${recipe.nota_degustatore ? `<blockquote><strong>Nota del degustatore</strong><br>“${escapeHtml(recipe.nota_degustatore)}”</blockquote>` : ""}`;

  elements.dialog.showModal();
}

function emptyStateHtml(message) {
  return `<div class="empty-state" style="grid-column:1/-1"><span aria-hidden="true">🗂️</span><h2>Nessun contenuto</h2><p>${escapeHtml(message)}</p></div>`;
}

function formatDate(dateString) {
  if (!dateString) return "Data non disponibile";
  const date = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(error => console.warn("Service worker non registrato", error));
  }
}

document.addEventListener("DOMContentLoaded", init);
