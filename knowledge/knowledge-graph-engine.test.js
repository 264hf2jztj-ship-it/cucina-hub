"use strict";

const assert = require("node:assert/strict");
const engine = require("./knowledge-graph-engine.js");

const objects = [
  { id: "pizza", title: "Pizza in teglia" },
  { id: "forno", title: "Forno Samsung" },
  { id: "impasto", title: "Impasto ad alta idratazione" },
  { id: "hurom", title: "Hurom E30ST" }
];

const relations = [
  {
    id: "relation-1",
    source_knowledge_object_id: "pizza",
    target_knowledge_object_id: "forno",
    relation_type: "executed_with"
  },
  {
    id: "relation-2",
    source_knowledge_object_id: "pizza",
    target_knowledge_object_id: "impasto",
    relation_type: "requires"
  },
  {
    id: "relation-3",
    source_knowledge_object_id: "hurom",
    target_knowledge_object_id: "forno",
    relation_type: "related_to"
  }
];

assert.equal(Object.keys(engine.RELATION_TYPES).length, 8);
assert.equal(engine.relationLabel("compatible_with"), "compatibile con");

const valid = engine.validateCandidate({
  source_knowledge_object_id: "pizza",
  target_knowledge_object_id: "forno",
  relation_type: "uses",
  note: "Accessorio dedicato"
}, objects);
assert.equal(valid.valid, true);
assert.equal(valid.value.note, "Accessorio dedicato");

const selfRelation = engine.validateCandidate({
  source_knowledge_object_id: "pizza",
  target_knowledge_object_id: "pizza",
  relation_type: "uses"
}, objects);
assert.equal(selfRelation.valid, false);
assert.match(selfRelation.errors.join(" "), /se stesso/i);

const unknownType = engine.validateCandidate({
  source_knowledge_object_id: "pizza",
  target_knowledge_object_id: "forno",
  relation_type: "invented"
}, objects);
assert.equal(unknownType.valid, false);

const missingObject = engine.validateCandidate({
  source_knowledge_object_id: "pizza",
  target_knowledge_object_id: "missing",
  relation_type: "uses"
}, objects);
assert.equal(missingObject.valid, false);

const tooLongNote = engine.validateCandidate({
  source_knowledge_object_id: "pizza",
  target_knowledge_object_id: "forno",
  relation_type: "uses",
  note: "x".repeat(1001)
}, objects);
assert.equal(tooLongNote.valid, false);

assert.equal(engine.hasDuplicate([
  {
    id: "symmetric",
    source_knowledge_object_id: "pizza",
    target_knowledge_object_id: "forno",
    relation_type: "related_to"
  }
], {
  source_knowledge_object_id: "forno",
  target_knowledge_object_id: "pizza",
  relation_type: "related_to"
}), true);

assert.equal(engine.hasDuplicate([
  {
    id: "directional",
    source_knowledge_object_id: "pizza",
    target_knowledge_object_id: "forno",
    relation_type: "uses"
  }
], {
  source_knowledge_object_id: "forno",
  target_knowledge_object_id: "pizza",
  relation_type: "uses"
}), false);

const neighborhood = engine.buildNeighborhood(objects, relations, "pizza");
assert.equal(neighborhood.focus.id, "pizza");
assert.deepEqual(neighborhood.nodes.map(node => node.id), ["pizza", "forno", "impasto"]);
assert.equal(neighborhood.edges.length, 2);

const layout = engine.layoutNeighborhood(objects, relations, "pizza");
assert.equal(layout.nodes[0].isFocus, true);
assert.equal(layout.nodes[0].x, 450);
assert.equal(layout.nodes[0].y, 260);
assert.equal(layout.edges.length, 2);
assert.ok(layout.edges.every(edge => Number.isFinite(edge.startX) && Number.isFinite(edge.endY)));

const fallback = engine.buildNeighborhood(objects, relations, "missing");
assert.equal(fallback.focus.id, "pizza");

assert.equal(engine.truncateLabel("a".repeat(30), 10), "aaaaaaaaa…");

console.log("Knowledge Graph engine: 13 controlli superati.");
