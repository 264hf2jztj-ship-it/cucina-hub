"use strict";

const DATA_FILES = {
  recipes: "data/ricette.json",
  appliances: "data/elettrodomestici.json",
  categories: "data/categorie.json",
  changelog: "data/changelog.json"
};

const state = {
  recipes: [],
  appliances: [],
  categories: [],
  changelog: [],
  meta: {},
  currentView: "dashboard",
  recipeQuery: "",
  recipeStatus: "all",
  recipeAppliance: "all"
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
    const [recipesData, appliancesData, categoriesData, changelogData] = await Promise.all([
      loadJson(DATA_FILES.recipes),
      loadJson(DATA_FILES.appliances),
      loadJson(DATA_FILES.categories),
      loadJson(DATA_FILES.changelog)
    ]);

    state.recipes = recipesData.ricette ?? [];
    state.meta = recipesData.meta ?? {};
    state.appliances = appliancesData.elettrodomestici ?? [];
    state.categories = categoriesData.categorie ?? [];
    state.changelog = changelogData.versioni ?? [];
    elements.version.textContent = state.meta.versione ?? "1.0";

    elements.loading.hidden = true;
    elements.root.hidden = false;
    bindEvents();
    renderView("dashboard");
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

    const recipeButton = event.target.closest("[data-recipe-id]");
    if (recipeButton) openRecipe(recipeButton.dataset.recipeId);
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
    hurom: () => renderCategory("hurom"),
    ninja: () => renderCategory("ninja"),
    pizza: () => renderCategory("pizza-impasti"),
    appliances: renderAppliances,
    changelog: renderChangelog
  };

  elements.root.innerHTML = "";
  (renderers[view] ?? renderDashboard)();
  document.querySelector("#main-content").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderDashboard() {
  const certified = state.recipes.filter(r => r.stato === "certificata");
  const testing = state.recipes.filter(r => r.stato === "da-testare");
  const manualCount = state.appliances.filter(a => a.manuale?.disponibile).length;
  const latestRecipe = [...state.recipes].sort((a, b) => String(b.data_prova ?? "").localeCompare(String(a.data_prova ?? "")))[0];

  elements.root.innerHTML = `
    <section class="hero">
      <div class="hero-panel">
        <p class="eyebrow" style="color:rgba(255,255,255,.72)">Web Edition ${escapeHtml(state.meta.versione ?? "1.0")}</p>
        <h2>Ricette, strumenti e appunti di cucina in un unico posto.</h2>
        <p>Cucina Hub raccoglie le preparazioni provate, gli esperimenti da affinare e le guide pratiche dei tuoi elettrodomestici.</p>
        <div class="hero-actions">
          <button class="button light" data-go-view="recipes" type="button">Sfoglia le ricette</button>
          <button class="button ghost" data-go-view="appliances" type="button">I miei elettrodomestici</button>
        </div>
      </div>
      <aside class="today-panel">
        <div>
          <div class="big-icon" aria-hidden="true">${escapeHtml(latestRecipe?.icona ?? "🍽️")}</div>
          <p class="eyebrow">Ultima ricetta inserita</p>
          <h3>${escapeHtml(latestRecipe?.titolo ?? "Nessuna ricetta")}</h3>
          <p>${escapeHtml(latestRecipe?.nota_degustatore ?? "Il ricettario è pronto per il primo contenuto.")}</p>
        </div>
        ${latestRecipe ? `<button class="button secondary" data-recipe-id="${escapeHtml(latestRecipe.id)}" type="button">Apri la scheda</button>` : ""}
      </aside>
    </section>

    <section class="metric-grid" aria-label="Riepilogo">
      ${metricCard("Ricette certificate", certified.length, "Provate e approvate")}
      ${metricCard("Ricette in prova", testing.length, "Da testare o perfezionare")}
      ${metricCard("Elettrodomestici", state.appliances.length, `${manualCount} manuali disponibili nel progetto`)}
      ${metricCard("Aree attive", state.categories.filter(c => c.stato === "attiva").length, "Sezioni già consultabili")}
    </section>

    <section class="section">
      <div class="section-heading">
        <div><h3>Sezioni principali</h3><p>Entra direttamente nell’area che ti serve.</p></div>
      </div>
      <div class="card-grid">
        ${state.categories.map(categoryCard).join("")}
      </div>
    </section>

    <section class="section">
      <div class="section-heading">
        <div><h3>Ricette certificate recenti</h3><p>Le preparazioni già promosse nel ricettario personale.</p></div>
        <button class="card-link" data-go-view="recipes" type="button">Vedi tutte →</button>
      </div>
      <div class="card-grid">
        ${certified.slice(0, 3).map(recipeCard).join("")}
      </div>
    </section>`;
}

function metricCard(label, value, detail) {
  return `<article class="metric-card"><span class="metric-label">${escapeHtml(label)}</span><strong class="metric-value">${escapeHtml(value)}</strong><div class="metric-detail">${escapeHtml(detail)}</div></article>`;
}

function categoryCard(category) {
  const count = state.recipes.filter(recipe => recipe.sezioni?.includes(category.id)).length;
  const statusLabel = category.stato === "attiva" ? `${count} ricette` : "In sviluppo";
  const badgeClass = category.stato === "attiva" ? "" : "pending";
  return `
    <article class="content-card">
      <div class="card-top"><span class="card-icon" aria-hidden="true">${escapeHtml(category.icona)}</span><span class="badge ${badgeClass}">${escapeHtml(statusLabel)}</span></div>
      <h4>${escapeHtml(category.titolo)}</h4>
      <p>${escapeHtml(category.descrizione)}</p>
      <div class="card-footer"><button class="card-link" data-go-view="${escapeHtml(category.vista)}" type="button">Apri sezione →</button></div>
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
