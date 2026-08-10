"use strict";

(function exposeKnowledgeGraphEngine(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) root.CucinaHubKnowledgeGraphEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createKnowledgeGraphEngine() {
  const RELATION_TYPES = Object.freeze({
    uses: Object.freeze({ label: "usa", symmetric: false }),
    compatible_with: Object.freeze({ label: "compatibile con", symmetric: true }),
    derives_from: Object.freeze({ label: "deriva da", symmetric: false }),
    replaces: Object.freeze({ label: "sostituisce", symmetric: false }),
    requires: Object.freeze({ label: "richiede", symmetric: false }),
    related_to: Object.freeze({ label: "correlato a", symmetric: true }),
    executed_with: Object.freeze({ label: "eseguito con", symmetric: false }),
    improved_by: Object.freeze({ label: "migliorato da", symmetric: false })
  });

  function relationDefinition(type) {
    return RELATION_TYPES[type] ?? null;
  }

  function relationLabel(type) {
    return relationDefinition(type)?.label ?? type ?? "relazione";
  }

  function normalizeCandidate(candidate = {}) {
    return {
      source_knowledge_object_id: String(candidate.source_knowledge_object_id ?? "").trim(),
      target_knowledge_object_id: String(candidate.target_knowledge_object_id ?? "").trim(),
      relation_type: String(candidate.relation_type ?? "").trim(),
      note: String(candidate.note ?? "").trim()
    };
  }

  function validateCandidate(candidate, objects = []) {
    const value = normalizeCandidate(candidate);
    const objectIds = new Set(objects.map(object => object.id));
    const errors = [];

    if (!value.source_knowledge_object_id || !objectIds.has(value.source_knowledge_object_id)) {
      errors.push("Seleziona un Knowledge Object di partenza valido.");
    }

    if (!value.target_knowledge_object_id || !objectIds.has(value.target_knowledge_object_id)) {
      errors.push("Seleziona un Knowledge Object di arrivo valido.");
    }

    if (
      value.source_knowledge_object_id
      && value.source_knowledge_object_id === value.target_knowledge_object_id
    ) {
      errors.push("Un Knowledge Object non può essere collegato a se stesso.");
    }

    if (!relationDefinition(value.relation_type)) {
      errors.push("Seleziona un tipo di relazione valido.");
    }

    if (value.note.length > 1000) {
      errors.push("La nota non può superare 1000 caratteri.");
    }

    return { valid: errors.length === 0, errors, value };
  }

  function canonicalRelationKey(relation = {}) {
    const type = relation.relation_type;
    const definition = relationDefinition(type);
    let source = String(relation.source_knowledge_object_id ?? "");
    let target = String(relation.target_knowledge_object_id ?? "");

    if (definition?.symmetric && source.localeCompare(target) > 0) {
      [source, target] = [target, source];
    }

    return `${type}:${source}:${target}`;
  }

  function hasDuplicate(relations, candidate, ignoredRelationId = null) {
    const key = canonicalRelationKey(candidate);
    return relations.some(relation =>
      relation.id !== ignoredRelationId && canonicalRelationKey(relation) === key
    );
  }

  function relationsForObject(relations = [], objectId) {
    return relations.filter(relation =>
      relation.source_knowledge_object_id === objectId
      || relation.target_knowledge_object_id === objectId
    );
  }

  function buildNeighborhood(objects = [], relations = [], requestedFocusId = null) {
    const objectMap = new Map(objects.map(object => [object.id, object]));
    const focusId = objectMap.has(requestedFocusId) ? requestedFocusId : objects[0]?.id ?? null;

    if (!focusId) {
      return { focusId: null, focus: null, nodes: [], edges: [] };
    }

    const edges = relationsForObject(relations, focusId).filter(relation =>
      objectMap.has(relation.source_knowledge_object_id)
      && objectMap.has(relation.target_knowledge_object_id)
    );
    const neighborIds = new Set();

    for (const relation of edges) {
      if (relation.source_knowledge_object_id !== focusId) {
        neighborIds.add(relation.source_knowledge_object_id);
      }
      if (relation.target_knowledge_object_id !== focusId) {
        neighborIds.add(relation.target_knowledge_object_id);
      }
    }

    const neighbors = [...neighborIds]
      .map(id => objectMap.get(id))
      .sort((left, right) => String(left.title ?? "").localeCompare(
        String(right.title ?? ""),
        "it-IT",
        { sensitivity: "base" }
      ));

    return {
      focusId,
      focus: objectMap.get(focusId),
      nodes: [objectMap.get(focusId), ...neighbors],
      edges
    };
  }

  function shortenLine(source, target, padding = 68) {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const length = Math.hypot(dx, dy) || 1;
    const unitX = dx / length;
    const unitY = dy / length;

    return {
      startX: source.x + unitX * padding,
      startY: source.y + unitY * padding,
      endX: target.x - unitX * padding,
      endY: target.y - unitY * padding
    };
  }

  function truncateLabel(value, maxLength = 24) {
    const text = String(value ?? "").trim() || "Senza titolo";
    return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trimEnd()}…`;
  }

  function layoutNeighborhood(objects, relations, requestedFocusId, options = {}) {
    const width = Number(options.width) || 900;
    const height = Number(options.height) || 520;
    const neighborhood = buildNeighborhood(objects, relations, requestedFocusId);

    if (!neighborhood.focusId) {
      return { ...neighborhood, width, height, nodes: [], edges: [] };
    }

    const center = { x: width / 2, y: height / 2 };
    const radiusX = Math.min(320, Math.max(170, width / 2 - 120));
    const radiusY = Math.min(190, Math.max(130, height / 2 - 80));
    const positionedNodes = neighborhood.nodes.map((node, index) => {
      if (index === 0) {
        return {
          ...node,
          x: center.x,
          y: center.y,
          isFocus: true,
          shortTitle: truncateLabel(node.title)
        };
      }

      const neighborCount = neighborhood.nodes.length - 1;
      const angle = -Math.PI / 2 + ((index - 1) * 2 * Math.PI) / Math.max(neighborCount, 1);
      return {
        ...node,
        x: center.x + Math.cos(angle) * radiusX,
        y: center.y + Math.sin(angle) * radiusY,
        isFocus: false,
        shortTitle: truncateLabel(node.title)
      };
    });
    const positionedById = new Map(positionedNodes.map(node => [node.id, node]));
    const positionedEdges = neighborhood.edges.map(relation => {
      const source = positionedById.get(relation.source_knowledge_object_id);
      const target = positionedById.get(relation.target_knowledge_object_id);
      const line = shortenLine(source, target);

      return {
        ...relation,
        ...line,
        labelX: (line.startX + line.endX) / 2,
        labelY: (line.startY + line.endY) / 2 - 8,
        label: relationLabel(relation.relation_type),
        symmetric: Boolean(relationDefinition(relation.relation_type)?.symmetric)
      };
    });

    return {
      ...neighborhood,
      width,
      height,
      nodes: positionedNodes,
      edges: positionedEdges
    };
  }

  return Object.freeze({
    RELATION_TYPES,
    buildNeighborhood,
    canonicalRelationKey,
    hasDuplicate,
    layoutNeighborhood,
    normalizeCandidate,
    relationDefinition,
    relationLabel,
    relationsForObject,
    truncateLabel,
    validateCandidate
  });
});
