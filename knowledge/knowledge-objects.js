"use strict";

const client = window.cucinaHubSupabase;

const SOURCE_TYPES = Object.freeze({
  recipe: {
    label: "Ricetta",
    plural: "Ricette",
    table: "recipes",
    select: "id,code,title",
    column: "recipe_id",
    display: row => [row.code, row.title ?? row.name].filter(Boolean).join(" — ")
  },
  manual: {
    label: "Manuale",
    plural: "Manuali",
    table: "manuals",
    select: "id,title",
    column: "manual_id",
    display: row => row.title ?? row.name ?? "Manuale senza titolo"
  },
  course: {
    label: "Corso",
    plural: "Corsi",
    table: "courses",
    select: "id,title",
    column: "course_id",
    display: row => row.title ?? row.name ?? "Corso senza titolo"
  },
  appliance: {
    label: "Elettrodomestico",
    plural: "Elettrodomestici",
    table: "appliances",
    select: "id,name",
    column: "appliance_id",
    display: row => row.name ?? row.title ?? "Elettrodomestico senza nome"
  },
  bakingSession: {
    label: "Sessione",
    plural: "Sessioni",
    table: "baking_sessions",
    select: "id,title,target_meal_at",
    column: "baking_session_id",
    display: row => {
      const date = row.target_meal_at ? formatDate(row.target_meal_at) : null;
      return [row.title ?? "Sessione senza titolo", date].filter(Boolean).join(" — ");
    }
  }
});

const state = {
  ownerUserId: null,
  objects: [],
  links: [],
  catalogs: {},
  selectedObjectId: null,
  busy: false
};

const elements = {
  status: document.querySelector("#pageStatus"),
  authGate: document.querySelector("#authGate"),
  workspace: document.querySelector("#knowledgeWorkspace"),
  form: document.querySelector("#objectForm"),
  formTitle: document.querySelector("#objectFormTitle"),
  objectId: document.querySelector("#objectId"),
  title: document.querySelector("#objectTitle"),
  description: document.querySelector("#objectDescription"),
  saveObject: document.querySelector("#saveObject"),
  cancelEdit: document.querySelector("#cancelEdit"),
  objectCount: document.querySelector("#objectCount"),
  objectList: document.querySelector("#objectList"),
  detail: document.querySelector("#objectDetail")
};

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
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

function setBusy(busy) {
  state.busy = busy;
  elements.saveObject.disabled = busy;
  elements.cancelEdit.disabled = busy;
  elements.detail.querySelectorAll("button, select").forEach(element => {
    element.disabled = busy;
  });
}

function selectedObject() {
  return state.objects.find(item => item.id === state.selectedObjectId) ?? null;
}

function linksForObject(objectId) {
  return state.links.filter(link => link.knowledge_object_id === objectId);
}

function sourceTypeForLink(link) {
  return Object.entries(SOURCE_TYPES).find(([, config]) => link[config.column])?.[0] ?? null;
}

function sourceForLink(link, type) {
  const config = SOURCE_TYPES[type];
  if (!config) return null;
  return (state.catalogs[type] ?? []).find(row => row.id === link[config.column]) ?? null;
}

async function loadCatalog(type, config) {
  const { data, error } = await client
    .from(config.table)
    .select(config.select)
    .eq("owner_user_id", state.ownerUserId);
  assertOk(error, `Lettura ${config.plural.toLocaleLowerCase("it-IT")}`);

  return (data ?? []).sort((left, right) =>
    config.display(left).localeCompare(config.display(right), "it-IT", { sensitivity: "base" })
  );
}

async function loadCatalogs() {
  const entries = await Promise.all(
    Object.entries(SOURCE_TYPES).map(async ([type, config]) => [
      type,
      await loadCatalog(type, config)
    ])
  );
  state.catalogs = Object.fromEntries(entries);
}

async function loadKnowledgeData(preferredObjectId = state.selectedObjectId) {
  const [objectResult, linkResult] = await Promise.all([
    client
      .from("knowledge_objects")
      .select("*")
      .eq("owner_user_id", state.ownerUserId)
      .order("updated_at", { ascending: false }),
    client
      .from("knowledge_object_links")
      .select("*")
      .eq("owner_user_id", state.ownerUserId)
      .order("created_at", { ascending: true })
  ]);

  assertOk(objectResult.error, "Lettura Knowledge Objects");
  assertOk(linkResult.error, "Lettura collegamenti");

  state.objects = objectResult.data ?? [];
  state.links = linkResult.data ?? [];
  state.selectedObjectId = state.objects.some(item => item.id === preferredObjectId)
    ? preferredObjectId
    : state.objects[0]?.id ?? null;

  renderAll();
}

function renderObjectList() {
  elements.objectCount.textContent = String(state.objects.length);

  if (!state.objects.length) {
    elements.objectList.innerHTML = `
      <div class="source-empty">
        Crea il primo Knowledge Object. Potrai aggiungere le fonti subito dopo.
      </div>`;
    return;
  }

  elements.objectList.innerHTML = state.objects.map(item => {
    const count = linksForObject(item.id).length;
    const selected = item.id === state.selectedObjectId;
    return `
      <button
        class="object-card${selected ? " is-selected" : ""}"
        type="button"
        data-object-id="${escapeHtml(item.id)}"
        aria-pressed="${selected}"
      >
        <strong>${escapeHtml(item.title)}</strong>
        <span>${count} ${count === 1 ? "collegamento" : "collegamenti"}</span>
      </button>`;
  }).join("");

  elements.objectList.querySelectorAll("[data-object-id]").forEach(button => {
    button.addEventListener("click", () => {
      state.selectedObjectId = button.dataset.objectId;
      resetForm();
      renderAll();
    });
  });
}

function sourceOptions(type, selectedId = "") {
  const config = SOURCE_TYPES[type];
  const rows = state.catalogs[type] ?? [];
  if (!rows.length) return '<option value="">Nessuna fonte disponibile</option>';

  return [
    '<option value="">Seleziona…</option>',
    ...rows.map(row => `
      <option value="${escapeHtml(row.id)}"${row.id === selectedId ? " selected" : ""}>
        ${escapeHtml(config.display(row))}
      </option>`)
  ].join("");
}

function renderSourceRows(objectLinks) {
  if (!objectLinks.length) {
    return '<p class="source-empty">Nessuna fonte collegata. Aggiungine una dal riquadro qui sotto.</p>';
  }

  return `<div class="source-list">${objectLinks.map(link => {
    const type = sourceTypeForLink(link);
    const config = SOURCE_TYPES[type];
    const source = sourceForLink(link, type);
    return `
      <article class="source-row">
        <div>
          <span class="badge">${escapeHtml(config?.label ?? "Fonte")}</span>
          <strong>${escapeHtml(source ? config.display(source) : "Fonte non disponibile")}</strong>
        </div>
        <button
          class="button danger"
          type="button"
          data-remove-link="${escapeHtml(link.id)}"
          aria-label="Rimuovi ${escapeHtml(config?.label ?? "fonte")}"
        >RIMUOVI</button>
      </article>`;
  }).join("")}</div>`;
}

function renderDetail() {
  const object = selectedObject();
  if (!object) {
    elements.detail.innerHTML = `
      <div class="knowledge-empty">
        <span aria-hidden="true">🔗</span>
        <h2>Nessun Knowledge Object</h2>
        <p>Crea un oggetto per iniziare a collegare le fonti.</p>
      </div>`;
    return;
  }

  const objectLinks = linksForObject(object.id);
  const defaultType = Object.keys(SOURCE_TYPES)[0];
  const updated = formatDate(object.updated_at);

  elements.detail.innerHTML = `
    <div class="detail-heading">
      <div>
        <p class="eyebrow">Knowledge Object</p>
        <h2>${escapeHtml(object.title)}</h2>
      </div>
      <div class="detail-actions">
        <button id="editSelectedObject" class="button secondary" type="button">MODIFICA</button>
        <button id="deleteSelectedObject" class="button danger" type="button">ELIMINA</button>
      </div>
    </div>
    <p class="detail-description">${escapeHtml(object.description || "Nessuna descrizione.")}</p>
    <p class="detail-meta">${objectLinks.length} ${objectLinks.length === 1 ? "fonte collegata" : "fonti collegate"}${updated ? ` · aggiornato ${escapeHtml(updated)}` : ""}</p>

    <section class="source-section" aria-labelledby="sourceTitle">
      <div class="source-heading">
        <h3 id="sourceTitle">Fonti originali</h3>
        <span class="badge">${objectLinks.length}</span>
      </div>
      ${renderSourceRows(objectLinks)}

      <form id="linkForm" class="link-form">
        <div>
          <label for="sourceType">Tipo di fonte</label>
          <select id="sourceType" required>
            ${Object.entries(SOURCE_TYPES).map(([type, config]) =>
              `<option value="${escapeHtml(type)}">${escapeHtml(config.label)}</option>`
            ).join("")}
          </select>
        </div>
        <div>
          <label for="sourceId">Fonte da collegare</label>
          <select id="sourceId" required>${sourceOptions(defaultType)}</select>
        </div>
        <div class="link-actions">
          <button class="button" type="submit">AGGIUNGI COLLEGAMENTO</button>
        </div>
      </form>
    </section>`;

  document.querySelector("#editSelectedObject").addEventListener("click", startEditingSelectedObject);
  document.querySelector("#deleteSelectedObject").addEventListener("click", deleteSelectedObject);

  const sourceType = document.querySelector("#sourceType");
  const sourceId = document.querySelector("#sourceId");
  sourceType.addEventListener("change", () => {
    sourceId.innerHTML = sourceOptions(sourceType.value);
  });

  document.querySelector("#linkForm").addEventListener("submit", addLink);
  elements.detail.querySelectorAll("[data-remove-link]").forEach(button => {
    button.addEventListener("click", () => removeLink(button.dataset.removeLink));
  });
}

function renderAll() {
  renderObjectList();
  renderDetail();
}

function resetForm() {
  elements.form.reset();
  elements.objectId.value = "";
  elements.formTitle.textContent = "Nuovo Knowledge Object";
  elements.saveObject.textContent = "SALVA OGGETTO";
  elements.cancelEdit.hidden = true;
}

function startEditingSelectedObject() {
  const object = selectedObject();
  if (!object) return;
  elements.objectId.value = object.id;
  elements.title.value = object.title;
  elements.description.value = object.description ?? "";
  elements.formTitle.textContent = "Modifica Knowledge Object";
  elements.saveObject.textContent = "SALVA MODIFICHE";
  elements.cancelEdit.hidden = false;
  elements.title.focus({ preventScroll: true });
  elements.form.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function saveObject(event) {
  event.preventDefault();
  if (state.busy) return;

  const title = elements.title.value.trim();
  const description = elements.description.value.trim();
  const objectId = elements.objectId.value;
  if (!title) {
    setStatus("Inserisci il titolo del Knowledge Object.", "error");
    elements.title.focus();
    return;
  }

  setBusy(true);
  setStatus(objectId ? "Salvataggio modifiche…" : "Creazione Knowledge Object…");

  try {
    const row = {
      owner_user_id: state.ownerUserId,
      title,
      description: description || null,
      updated_at: new Date().toISOString()
    };

    const query = objectId
      ? client
        .from("knowledge_objects")
        .update(row)
        .eq("id", objectId)
        .eq("owner_user_id", state.ownerUserId)
      : client.from("knowledge_objects").insert(row);

    const { data, error } = await query.select("*").single();
    assertOk(error, objectId ? "Aggiornamento oggetto" : "Creazione oggetto");

    resetForm();
    await loadKnowledgeData(data.id);
    setStatus(objectId ? "Knowledge Object aggiornato." : "Knowledge Object creato. Ora puoi collegare le fonti.", "ok");
  } catch (error) {
    setStatus(
      error.code === "23505"
        ? "Esiste già un Knowledge Object con questo titolo."
        : error.message,
      "error"
    );
  } finally {
    setBusy(false);
  }
}

async function deleteSelectedObject() {
  const object = selectedObject();
  if (!object || state.busy) return;
  if (!window.confirm(`Eliminare “${object.title}”? Le fonti originali non verranno eliminate.`)) return;

  setBusy(true);
  setStatus("Eliminazione Knowledge Object…");
  try {
    const { error } = await client
      .from("knowledge_objects")
      .delete()
      .eq("id", object.id)
      .eq("owner_user_id", state.ownerUserId);
    assertOk(error, "Eliminazione oggetto");
    resetForm();
    await loadKnowledgeData(null);
    setStatus("Knowledge Object eliminato. Le fonti originali sono rimaste intatte.", "ok");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function addLink(event) {
  event.preventDefault();
  if (state.busy) return;

  const object = selectedObject();
  const type = document.querySelector("#sourceType")?.value;
  const sourceId = document.querySelector("#sourceId")?.value;
  const config = SOURCE_TYPES[type];
  if (!object || !config || !sourceId) {
    setStatus("Seleziona una fonte da collegare.", "error");
    return;
  }

  setBusy(true);
  setStatus("Aggiunta collegamento…");
  try {
    const row = {
      owner_user_id: state.ownerUserId,
      knowledge_object_id: object.id,
      [config.column]: sourceId
    };
    const { error } = await client.from("knowledge_object_links").insert(row);
    assertOk(error, "Aggiunta collegamento");
    await loadKnowledgeData(object.id);
    setStatus(`${config.label} collegato senza duplicare la fonte.`, "ok");
  } catch (error) {
    setStatus(
      error.code === "23505"
        ? "Questa fonte è già collegata al Knowledge Object."
        : error.message,
      "error"
    );
  } finally {
    setBusy(false);
  }
}

async function removeLink(linkId) {
  if (!linkId || state.busy) return;
  const objectId = state.selectedObjectId;
  setBusy(true);
  setStatus("Rimozione collegamento…");
  try {
    const { error } = await client
      .from("knowledge_object_links")
      .delete()
      .eq("id", linkId)
      .eq("owner_user_id", state.ownerUserId);
    assertOk(error, "Rimozione collegamento");
    await loadKnowledgeData(objectId);
    setStatus("Collegamento rimosso. La fonte originale è rimasta intatta.", "ok");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function initialize() {
  if (!client) {
    elements.authGate.hidden = false;
    setStatus("Il collegamento a Supabase non è disponibile.", "error");
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
    setStatus("Caricamento Knowledge Objects e fonti…");
    const requestedObjectId = new URLSearchParams(window.location.search).get("object");
    await Promise.all([loadCatalogs(), loadKnowledgeData(requestedObjectId)]);
    renderAll();
    elements.workspace.hidden = false;
    setStatus(
      state.objects.length
        ? `${state.objects.length} Knowledge Object caricati.`
        : "Struttura pronta. Crea il primo Knowledge Object.",
      "ok"
    );
  } catch (error) {
    const missingMigration = error.code === "42P01" || /knowledge_objects|knowledge_object_links/i.test(error.message);
    setStatus(
      missingMigration
        ? "Database non ancora pronto: applica la migration 037_knowledge_objects.sql."
        : error.message,
      "error"
    );
  }
}

elements.form.addEventListener("submit", saveObject);
elements.cancelEdit.addEventListener("click", resetForm);

void initialize();
