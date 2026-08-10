"use strict";

const client = window.cucinaHubSupabase;
const engine = window.CucinaHubKnowledgeGraphEngine;

const state = {
  ownerUserId: null,
  objects: [],
  relations: [],
  focusObjectId: null,
  busy: false
};

const elements = {
  status: document.querySelector("#pageStatus"),
  authGate: document.querySelector("#authGate"),
  workspace: document.querySelector("#graphWorkspace"),
  form: document.querySelector("#relationForm"),
  source: document.querySelector("#sourceObject"),
  type: document.querySelector("#relationType"),
  target: document.querySelector("#targetObject"),
  note: document.querySelector("#relationNote"),
  save: document.querySelector("#saveRelation"),
  formHint: document.querySelector("#relationFormHint"),
  focus: document.querySelector("#focusObject"),
  objectCount: document.querySelector("#objectCount"),
  relationCount: document.querySelector("#relationCount"),
  neighborCount: document.querySelector("#neighborCount"),
  focusBadge: document.querySelector("#focusBadge"),
  summary: document.querySelector("#graphSummary"),
  graph: document.querySelector("#knowledgeGraph"),
  visibleRelationCount: document.querySelector("#visibleRelationCount"),
  relationList: document.querySelector("#relationList")
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

function setBusy(busy) {
  state.busy = busy;
  elements.form.querySelectorAll("button, select, textarea").forEach(element => {
    element.disabled = busy || state.objects.length < 2;
  });
  elements.focus.disabled = busy || !state.objects.length;
  elements.relationList.querySelectorAll("button").forEach(button => {
    button.disabled = busy;
  });
}

function objectById(objectId) {
  return state.objects.find(object => object.id === objectId) ?? null;
}

function objectTitle(objectId) {
  return objectById(objectId)?.title ?? "Knowledge Object non disponibile";
}

function objectOptions(selectedId = "", excludedId = null) {
  const options = state.objects
    .filter(object => object.id !== excludedId)
    .map(object => `
      <option value="${escapeHtml(object.id)}"${object.id === selectedId ? " selected" : ""}>
        ${escapeHtml(object.title)}
      </option>`);
  return options.length ? options.join("") : '<option value="">Nessun oggetto disponibile</option>';
}

function populateRelationTypes() {
  elements.type.innerHTML = Object.entries(engine.RELATION_TYPES)
    .map(([type, definition]) =>
      `<option value="${escapeHtml(type)}">${escapeHtml(definition.label)}</option>`
    )
    .join("");
}

function populateTargetOptions(preferredTargetId = elements.target.value) {
  const sourceId = elements.source.value;
  const fallbackTarget = state.objects.find(object => object.id !== sourceId)?.id ?? "";
  const selectedTarget = preferredTargetId && preferredTargetId !== sourceId
    ? preferredTargetId
    : fallbackTarget;
  elements.target.innerHTML = objectOptions(selectedTarget, sourceId);
  if ([...elements.target.options].some(option => option.value === selectedTarget)) {
    elements.target.value = selectedTarget;
  }
}

function populateObjectControls() {
  const fallbackFocus = state.objects[0]?.id ?? "";
  state.focusObjectId = objectById(state.focusObjectId)?.id ?? fallbackFocus;
  elements.focus.innerHTML = objectOptions(state.focusObjectId);
  elements.source.innerHTML = objectOptions(state.focusObjectId);
  elements.focus.value = state.focusObjectId;
  elements.source.value = state.focusObjectId;
  populateTargetOptions();

  const canCreate = state.objects.length >= 2;
  elements.formHint.hidden = canCreate;
  elements.form.querySelectorAll("button, select, textarea").forEach(element => {
    element.disabled = !canCreate;
  });
}

function relationSentence(relation) {
  return `${objectTitle(relation.source_knowledge_object_id)} ${engine.relationLabel(
    relation.relation_type
  )} ${objectTitle(relation.target_knowledge_object_id)}`;
}

function renderGraph() {
  const layout = engine.layoutNeighborhood(
    state.objects,
    state.relations,
    state.focusObjectId,
    { width: 900, height: 520 }
  );

  elements.objectCount.textContent = String(state.objects.length);
  elements.relationCount.textContent = String(state.relations.length);
  elements.neighborCount.textContent = String(Math.max(0, layout.nodes.length - 1));

  if (!layout.focus) {
    elements.focusBadge.textContent = "Nessun oggetto";
    elements.summary.textContent = "Crea almeno un Knowledge Object per iniziare il grafo.";
    elements.graph.innerHTML = `
      <text class="graph-empty" x="450" y="260">Nessun Knowledge Object disponibile</text>`;
    return;
  }

  elements.focusBadge.textContent = layout.focus.title;
  elements.summary.textContent = layout.edges.length
    ? `${layout.focus.title}: ${layout.edges.length} ${layout.edges.length === 1 ? "relazione diretta" : "relazioni dirette"}. Tocca un nodo per portarlo al centro.`
    : `${layout.focus.title} non ha ancora relazioni. Puoi crearne una dal pannello a sinistra.`;

  const edgeMarkup = layout.edges.map(edge => `
    <g>
      <line
        class="graph-edge${edge.symmetric ? " is-symmetric" : ""}"
        x1="${edge.startX.toFixed(1)}"
        y1="${edge.startY.toFixed(1)}"
        x2="${edge.endX.toFixed(1)}"
        y2="${edge.endY.toFixed(1)}"
        ${edge.symmetric ? "" : 'marker-end="url(#graphArrow)"'}
      ></line>
      <text class="graph-edge-label" x="${edge.labelX.toFixed(1)}" y="${edge.labelY.toFixed(1)}">
        ${escapeHtml(edge.label)}
      </text>
    </g>`).join("");

  const nodeMarkup = layout.nodes.map(node => `
    <g
      class="graph-node${node.isFocus ? " is-focus" : ""}"
      data-graph-object="${escapeHtml(node.id)}"
      role="button"
      tabindex="0"
      aria-label="Porta al centro ${escapeHtml(node.title)}"
    >
      <rect x="${(node.x - 82).toFixed(1)}" y="${(node.y - 35).toFixed(1)}" width="164" height="70" rx="18"></rect>
      <text x="${node.x.toFixed(1)}" y="${(node.y + 5).toFixed(1)}">${escapeHtml(node.shortTitle)}</text>
    </g>`).join("");

  elements.graph.innerHTML = `
    <defs>
      <marker id="graphArrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
        <path class="graph-arrow" d="M0,0 L0,6 L9,3 z"></path>
      </marker>
    </defs>
    <g aria-hidden="true">${edgeMarkup}</g>
    <g>${nodeMarkup}</g>`;
}

function renderRelationList() {
  const visibleRelations = engine.relationsForObject(state.relations, state.focusObjectId);
  elements.visibleRelationCount.textContent = String(visibleRelations.length);

  if (!visibleRelations.length) {
    elements.relationList.innerHTML = '<p class="graph-list-empty">Nessuna relazione per questo oggetto.</p>';
    return;
  }

  elements.relationList.innerHTML = visibleRelations.map(relation => {
    const otherObjectId = relation.source_knowledge_object_id === state.focusObjectId
      ? relation.target_knowledge_object_id
      : relation.source_knowledge_object_id;
    return `
      <article class="graph-relation-row">
        <div>
          <p><strong>${escapeHtml(relationSentence(relation))}</strong></p>
          ${relation.note ? `<p class="graph-relation-note">${escapeHtml(relation.note)}</p>` : ""}
        </div>
        <div class="graph-relation-actions">
          <button class="button secondary" type="button" data-focus-object="${escapeHtml(otherObjectId)}">CENTRA</button>
          <button class="button danger" type="button" data-delete-relation="${escapeHtml(relation.id)}">ELIMINA</button>
        </div>
      </article>`;
  }).join("");
}

function renderAll() {
  renderGraph();
  renderRelationList();
  setBusy(state.busy);
}

function setFocus(objectId) {
  if (!objectById(objectId)) return;
  state.focusObjectId = objectId;
  elements.focus.value = objectId;
  elements.source.value = objectId;
  populateTargetOptions();

  const url = new URL(window.location.href);
  url.searchParams.set("object", objectId);
  window.history.replaceState({}, "", url);
  renderAll();
}

async function loadGraphData(preferredFocusId = state.focusObjectId) {
  const [objectResult, relationResult] = await Promise.all([
    client
      .from("knowledge_objects")
      .select("id,title,description,created_at,updated_at")
      .eq("owner_user_id", state.ownerUserId)
      .order("title", { ascending: true }),
    client
      .from("knowledge_relations")
      .select("*")
      .eq("owner_user_id", state.ownerUserId)
      .order("created_at", { ascending: true })
  ]);

  assertOk(objectResult.error, "Lettura Knowledge Object");
  assertOk(relationResult.error, "Lettura relazioni");

  state.objects = objectResult.data ?? [];
  state.relations = relationResult.data ?? [];
  state.focusObjectId = state.objects.some(object => object.id === preferredFocusId)
    ? preferredFocusId
    : state.objects[0]?.id ?? null;

  populateObjectControls();
  renderAll();
}

async function saveRelation(event) {
  event.preventDefault();
  if (state.busy) return;

  const validation = engine.validateCandidate({
    source_knowledge_object_id: elements.source.value,
    target_knowledge_object_id: elements.target.value,
    relation_type: elements.type.value,
    note: elements.note.value
  }, state.objects);

  if (!validation.valid) {
    setStatus(validation.errors[0], "error");
    return;
  }

  if (engine.hasDuplicate(state.relations, validation.value)) {
    setStatus("Questa relazione esiste già.", "error");
    return;
  }

  try {
    setBusy(true);
    const payload = {
      owner_user_id: state.ownerUserId,
      source_knowledge_object_id: validation.value.source_knowledge_object_id,
      target_knowledge_object_id: validation.value.target_knowledge_object_id,
      relation_type: validation.value.relation_type,
      note: validation.value.note || null
    };
    const { error } = await client.from("knowledge_relations").insert(payload);
    assertOk(error, "Creazione relazione");

    state.focusObjectId = validation.value.source_knowledge_object_id;
    elements.note.value = "";
    await loadGraphData(state.focusObjectId);
    setStatus("Relazione aggiunta. I Knowledge Object originali non sono stati modificati.", "ok");
  } catch (error) {
    const message = error.code === "23505"
      ? "Questa relazione esiste già."
      : error.message;
    setStatus(message, "error");
  } finally {
    setBusy(false);
  }
}

async function deleteRelation(relationId) {
  const relation = state.relations.find(item => item.id === relationId);
  if (!relation || state.busy) return;
  if (!window.confirm(`Eliminare la relazione “${relationSentence(relation)}”?`)) return;

  try {
    setBusy(true);
    const { error } = await client
      .from("knowledge_relations")
      .delete()
      .eq("id", relation.id)
      .eq("owner_user_id", state.ownerUserId);
    assertOk(error, "Eliminazione relazione");
    await loadGraphData(state.focusObjectId);
    setStatus("Relazione eliminata. I Knowledge Object e le fonti restano disponibili.", "ok");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

function activateGraphNode(event) {
  const node = event.target.closest?.("[data-graph-object]");
  if (node) setFocus(node.dataset.graphObject);
}

elements.form.addEventListener("submit", saveRelation);
elements.source.addEventListener("change", () => populateTargetOptions());
elements.focus.addEventListener("change", () => setFocus(elements.focus.value));
elements.graph.addEventListener("click", activateGraphNode);
elements.graph.addEventListener("keydown", event => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  activateGraphNode(event);
});
elements.relationList.addEventListener("click", event => {
  const focusButton = event.target.closest("[data-focus-object]");
  if (focusButton) {
    setFocus(focusButton.dataset.focusObject);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-relation]");
  if (deleteButton) void deleteRelation(deleteButton.dataset.deleteRelation);
});

async function initialize() {
  if (!client || !engine) {
    elements.authGate.hidden = false;
    setStatus("Il Knowledge Graph o il collegamento a Supabase non è disponibile.", "error");
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
    populateRelationTypes();
    const requestedFocusId = new URLSearchParams(window.location.search).get("object");
    setStatus("Caricamento Knowledge Graph…");
    await loadGraphData(requestedFocusId);
    elements.workspace.hidden = false;
    setStatus(
      state.objects.length
        ? "Knowledge Graph pronto. Sono mostrate soltanto le relazioni che hai creato."
        : "Knowledge Graph pronto, ma non ci sono ancora Knowledge Object.",
      "ok"
    );
  } catch (error) {
    setStatus(`${error.message}. Verifica di aver applicato la migration 039.`, "error");
  }
}

void initialize();
