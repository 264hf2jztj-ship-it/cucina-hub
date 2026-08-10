"use strict";

const client = window.cucinaHubSupabase;

const TARGET_TYPES = Object.freeze({
  knowledgeObject: {
    label: "Knowledge Object",
    plural: "Knowledge Object",
    table: "knowledge_objects",
    select: "id,title",
    column: "knowledge_object_id",
    display: row => row.title ?? "Knowledge Object senza titolo"
  },
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
  tags: [],
  recipeTags: [],
  tagLinks: [],
  catalogs: {},
  selectedTagId: null,
  busy: false
};

const elements = {
  status: document.querySelector("#pageStatus"),
  authGate: document.querySelector("#authGate"),
  workspace: document.querySelector("#tagWorkspace"),
  form: document.querySelector("#tagForm"),
  formTitle: document.querySelector("#tagFormTitle"),
  tagId: document.querySelector("#tagId"),
  name: document.querySelector("#tagName"),
  saveTag: document.querySelector("#saveTag"),
  cancelEdit: document.querySelector("#cancelTagEdit"),
  tagCount: document.querySelector("#tagCount"),
  tagList: document.querySelector("#tagList"),
  detail: document.querySelector("#tagDetail")
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

function normalizeTagName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
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
  elements.saveTag.disabled = busy;
  elements.cancelEdit.disabled = busy;
  elements.detail.querySelectorAll("button, select").forEach(element => {
    element.disabled = busy;
  });
}

function selectedTag() {
  return state.tags.find(tag => tag.id === state.selectedTagId) ?? null;
}

function targetTypeForLink(link) {
  return Object.entries(TARGET_TYPES)
    .find(([type, config]) => type !== "recipe" && link[config.column])?.[0] ?? null;
}

function targetForAssignment(assignment) {
  const config = TARGET_TYPES[assignment.type];
  return (state.catalogs[assignment.type] ?? [])
    .find(row => row.id === assignment.targetId) ?? null;
}

function assignmentsForTag(tagId) {
  const recipeAssignments = state.recipeTags
    .filter(link => link.tag_id === tagId)
    .map(link => ({
      kind: "recipe",
      type: "recipe",
      targetId: link.recipe_id,
      key: `recipe:${link.recipe_id}`
    }));

  const otherAssignments = state.tagLinks
    .filter(link => link.tag_id === tagId)
    .map(link => {
      const type = targetTypeForLink(link);
      const config = TARGET_TYPES[type];
      return {
        kind: "tagLink",
        type,
        targetId: config ? link[config.column] : null,
        key: `tag-link:${link.id}`,
        linkId: link.id
      };
    })
    .filter(assignment => assignment.type && assignment.targetId);

  return [...recipeAssignments, ...otherAssignments].sort((left, right) => {
    const typeOrder = Object.keys(TARGET_TYPES);
    const typeDifference = typeOrder.indexOf(left.type) - typeOrder.indexOf(right.type);
    if (typeDifference) return typeDifference;

    const leftTarget = targetForAssignment(left);
    const rightTarget = targetForAssignment(right);
    const config = TARGET_TYPES[left.type];
    return config.display(leftTarget ?? {}).localeCompare(
      config.display(rightTarget ?? {}),
      "it-IT",
      { sensitivity: "base" }
    );
  });
}

function usageCount(tagId) {
  return assignmentsForTag(tagId).length;
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
    Object.entries(TARGET_TYPES).map(async ([type, config]) => [
      type,
      await loadCatalog(type, config)
    ])
  );
  state.catalogs = Object.fromEntries(entries);
}

async function loadTagData(preferredTagId = state.selectedTagId) {
  const [tagResult, recipeTagResult, tagLinkResult] = await Promise.all([
    client
      .from("tags")
      .select("id,owner_user_id,name")
      .eq("owner_user_id", state.ownerUserId)
      .order("name", { ascending: true }),
    client
      .from("recipe_tags")
      .select("recipe_id,tag_id"),
    client
      .from("tag_links")
      .select("*")
      .eq("owner_user_id", state.ownerUserId)
      .order("created_at", { ascending: true })
  ]);

  assertOk(tagResult.error, "Lettura tag");
  assertOk(recipeTagResult.error, "Lettura collegamenti delle ricette");
  assertOk(tagLinkResult.error, "Lettura collegamenti dei tag");

  state.tags = tagResult.data ?? [];
  state.recipeTags = recipeTagResult.data ?? [];
  state.tagLinks = tagLinkResult.data ?? [];
  state.selectedTagId = state.tags.some(tag => tag.id === preferredTagId)
    ? preferredTagId
    : state.tags[0]?.id ?? null;
}

function renderTagList() {
  elements.tagCount.textContent = String(state.tags.length);

  if (!state.tags.length) {
    elements.tagList.innerHTML = `
      <div class="source-empty">
        Crea il primo tag. Potrai collegarlo subito ai tuoi contenuti.
      </div>`;
    return;
  }

  elements.tagList.innerHTML = state.tags.map(tag => {
    const count = usageCount(tag.id);
    const selected = tag.id === state.selectedTagId;
    return `
      <button
        class="tag-card${selected ? " is-selected" : ""}"
        type="button"
        data-tag-id="${escapeHtml(tag.id)}"
        aria-pressed="${selected}"
      >
        <strong>#${escapeHtml(tag.name)}</strong>
        <span>${count} ${count === 1 ? "collegamento" : "collegamenti"}</span>
      </button>`;
  }).join("");

  elements.tagList.querySelectorAll("[data-tag-id]").forEach(button => {
    button.addEventListener("click", () => {
      state.selectedTagId = button.dataset.tagId;
      resetForm();
      renderAll();
    });
  });
}

function assignedTargetIds(type, tagId) {
  return new Set(
    assignmentsForTag(tagId)
      .filter(assignment => assignment.type === type)
      .map(assignment => assignment.targetId)
  );
}

function targetOptions(type, tagId) {
  const config = TARGET_TYPES[type];
  const assigned = assignedTargetIds(type, tagId);
  const rows = (state.catalogs[type] ?? []).filter(row => !assigned.has(row.id));

  if (!rows.length) return '<option value="">Nessun contenuto disponibile</option>';

  return [
    '<option value="">Seleziona…</option>',
    ...rows.map(row => `
      <option value="${escapeHtml(row.id)}">
        ${escapeHtml(config.display(row))}
      </option>`)
  ].join("");
}

function renderAssignments(assignments) {
  if (!assignments.length) {
    return '<p class="source-empty">Questo tag non è ancora collegato a nessun contenuto.</p>';
  }

  return `<div class="source-list">${assignments.map(assignment => {
    const config = TARGET_TYPES[assignment.type];
    const target = targetForAssignment(assignment);
    return `
      <article class="source-row">
        <div>
          <span class="badge">${escapeHtml(config.label)}</span>
          <strong>${escapeHtml(target ? config.display(target) : "Contenuto non disponibile")}</strong>
        </div>
        <button
          class="button danger"
          type="button"
          data-remove-kind="${escapeHtml(assignment.kind)}"
          data-remove-type="${escapeHtml(assignment.type)}"
          data-remove-target="${escapeHtml(assignment.targetId)}"
          data-remove-link="${escapeHtml(assignment.linkId ?? "")}"
          aria-label="Rimuovi tag da ${escapeHtml(config.label)}"
        >RIMUOVI</button>
      </article>`;
  }).join("")}</div>`;
}

function renderDetail() {
  const tag = selectedTag();
  if (!tag) {
    elements.detail.innerHTML = `
      <div class="knowledge-empty">
        <span aria-hidden="true">🏷️</span>
        <h2>Nessun tag</h2>
        <p>Crea un tag per iniziare a classificare i contenuti.</p>
      </div>`;
    return;
  }

  const assignments = assignmentsForTag(tag.id);
  const defaultType = Object.keys(TARGET_TYPES)[0];
  const inUse = assignments.length > 0;

  elements.detail.innerHTML = `
    <div class="detail-heading">
      <div>
        <p class="eyebrow">Tag personale</p>
        <h2>#${escapeHtml(tag.name)}</h2>
      </div>
      <div class="detail-actions">
        <button id="editSelectedTag" class="button secondary" type="button">RINOMINA</button>
        <button
          id="deleteSelectedTag"
          class="button danger"
          type="button"
          ${inUse ? "disabled" : ""}
        >ELIMINA</button>
      </div>
    </div>
    <p class="detail-meta">${assignments.length} ${assignments.length === 1 ? "contenuto collegato" : "contenuti collegati"}</p>
    ${inUse ? '<p class="tag-delete-note">Per eliminare il tag, rimuovilo prima da tutti i contenuti.</p>' : ""}

    <section class="source-section" aria-labelledby="assignmentTitle">
      <div class="source-heading">
        <h3 id="assignmentTitle">Contenuti classificati</h3>
        <span class="badge">${assignments.length}</span>
      </div>
      ${renderAssignments(assignments)}

      <form id="assignmentForm" class="link-form">
        <div>
          <label for="targetType">Tipo di contenuto</label>
          <select id="targetType" required>
            ${Object.entries(TARGET_TYPES).map(([type, config]) =>
              `<option value="${escapeHtml(type)}">${escapeHtml(config.label)}</option>`
            ).join("")}
          </select>
        </div>
        <div>
          <label for="targetId">Contenuto da collegare</label>
          <select id="targetId" required>${targetOptions(defaultType, tag.id)}</select>
        </div>
        <div class="link-actions">
          <button class="button" type="submit">APPLICA TAG</button>
        </div>
      </form>
    </section>`;

  document.querySelector("#editSelectedTag").addEventListener("click", startEditingSelectedTag);
  document.querySelector("#deleteSelectedTag").addEventListener("click", deleteSelectedTag);

  const targetType = document.querySelector("#targetType");
  const targetId = document.querySelector("#targetId");
  targetType.addEventListener("change", () => {
    targetId.innerHTML = targetOptions(targetType.value, tag.id);
  });

  document.querySelector("#assignmentForm").addEventListener("submit", addAssignment);
  elements.detail.querySelectorAll("[data-remove-kind]").forEach(button => {
    button.addEventListener("click", () => removeAssignment({
      kind: button.dataset.removeKind,
      type: button.dataset.removeType,
      targetId: button.dataset.removeTarget,
      linkId: button.dataset.removeLink || null
    }));
  });
}

function renderAll() {
  renderTagList();
  renderDetail();
}

function resetForm() {
  elements.form.reset();
  elements.tagId.value = "";
  elements.formTitle.textContent = "Nuovo tag";
  elements.saveTag.textContent = "SALVA TAG";
  elements.cancelEdit.hidden = true;
}

function startEditingSelectedTag() {
  const tag = selectedTag();
  if (!tag) return;
  elements.tagId.value = tag.id;
  elements.name.value = tag.name;
  elements.formTitle.textContent = "Rinomina tag";
  elements.saveTag.textContent = "SALVA MODIFICHE";
  elements.cancelEdit.hidden = false;
  elements.name.focus({ preventScroll: true });
  elements.form.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function saveTag(event) {
  event.preventDefault();
  if (state.busy) return;

  const name = normalizeTagName(elements.name.value);
  const tagId = elements.tagId.value;
  if (!name) {
    setStatus("Inserisci il nome del tag.", "error");
    elements.name.focus();
    return;
  }

  setBusy(true);
  setStatus(tagId ? "Salvataggio modifiche…" : "Creazione tag…");

  try {
    const query = tagId
      ? client
        .from("tags")
        .update({ name })
        .eq("id", tagId)
        .eq("owner_user_id", state.ownerUserId)
      : client.from("tags").insert({ owner_user_id: state.ownerUserId, name });

    const { data, error } = await query.select("id").single();
    assertOk(error, tagId ? "Rinomina tag" : "Creazione tag");

    resetForm();
    await loadTagData(data.id);
    renderAll();
    setStatus(tagId ? "Tag rinominato." : "Tag creato. Ora puoi applicarlo ai contenuti.", "ok");
  } catch (error) {
    setStatus(
      error.code === "23505"
        ? "Esiste già un tag con questo nome."
        : error.message,
      "error"
    );
  } finally {
    setBusy(false);
  }
}

async function deleteSelectedTag() {
  const tag = selectedTag();
  if (!tag || state.busy) return;
  if (usageCount(tag.id)) {
    setStatus("Rimuovi prima il tag da tutti i contenuti.", "error");
    return;
  }
  if (!window.confirm(`Eliminare il tag “${tag.name}”? I contenuti originali resteranno intatti.`)) return;

  setBusy(true);
  setStatus("Eliminazione tag…");
  try {
    const { error } = await client
      .from("tags")
      .delete()
      .eq("id", tag.id)
      .eq("owner_user_id", state.ownerUserId);
    assertOk(error, "Eliminazione tag");
    resetForm();
    await loadTagData(null);
    renderAll();
    setStatus("Tag eliminato. I contenuti originali sono rimasti intatti.", "ok");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function addAssignment(event) {
  event.preventDefault();
  if (state.busy) return;

  const tag = selectedTag();
  const type = document.querySelector("#targetType")?.value;
  const targetId = document.querySelector("#targetId")?.value;
  const config = TARGET_TYPES[type];
  if (!tag || !config || !targetId) {
    setStatus("Seleziona un contenuto da classificare.", "error");
    return;
  }

  setBusy(true);
  setStatus("Applicazione tag…");
  try {
    const query = type === "recipe"
      ? client.from("recipe_tags").insert({ recipe_id: targetId, tag_id: tag.id })
      : client.from("tag_links").insert({
        owner_user_id: state.ownerUserId,
        tag_id: tag.id,
        [config.column]: targetId
      });
    const { error } = await query;
    assertOk(error, "Applicazione tag");

    await loadTagData(tag.id);
    renderAll();
    setStatus(`${config.label} classificato con #${tag.name}.`, "ok");
  } catch (error) {
    setStatus(
      error.code === "23505"
        ? "Questo tag è già applicato al contenuto selezionato."
        : error.message,
      "error"
    );
  } finally {
    setBusy(false);
  }
}

async function removeAssignment({ kind, type, targetId, linkId }) {
  const tag = selectedTag();
  const config = TARGET_TYPES[type];
  if (!tag || !config || state.busy) return;

  setBusy(true);
  setStatus("Rimozione tag…");
  try {
    const query = kind === "recipe"
      ? client
        .from("recipe_tags")
        .delete()
        .eq("recipe_id", targetId)
        .eq("tag_id", tag.id)
      : client
        .from("tag_links")
        .delete()
        .eq("id", linkId)
        .eq("owner_user_id", state.ownerUserId);
    const { error } = await query;
    assertOk(error, "Rimozione tag");

    await loadTagData(tag.id);
    renderAll();
    setStatus(`Tag rimosso da ${config.label.toLocaleLowerCase("it-IT")}.`, "ok");
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
    setStatus("Caricamento catalogo tag e contenuti…");
    await Promise.all([loadCatalogs(), loadTagData(null)]);
    renderAll();
    elements.workspace.hidden = false;
    setStatus(
      state.tags.length
        ? `${state.tags.length} tag caricati.`
        : "Tag Engine pronto. Crea il primo tag.",
      "ok"
    );
  } catch (error) {
    const missingMigration = error.code === "42P01" || /tag_links/i.test(error.message);
    setStatus(
      missingMigration
        ? "Database non ancora pronto: applica la migration 038_tag_engine.sql."
        : error.message,
      "error"
    );
  }
}

elements.form.addEventListener("submit", saveTag);
elements.cancelEdit.addEventListener("click", resetForm);

void initialize();
