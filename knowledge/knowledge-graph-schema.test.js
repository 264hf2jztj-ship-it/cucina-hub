"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.join(__dirname, "../supabase/039_knowledge_graph.sql"), "utf8");

assert.match(sql, /create table if not exists public\.knowledge_relations/i);
assert.match(sql, /source_knowledge_object_id uuid not null/i);
assert.match(sql, /target_knowledge_object_id uuid not null/i);
assert.match(sql, /knowledge_relations_distinct_objects/i);
assert.match(sql, /knowledge_relations_type_allowed/i);
assert.match(sql, /knowledge_relations_symmetric_key/i);
assert.match(sql, /where relation_type in \('compatible_with', 'related_to'\)/i);
assert.match(sql, /alter table public\.knowledge_relations enable row level security/i);

for (const operation of ["select", "insert", "update", "delete"]) {
  assert.match(sql, new RegExp(`knowledge_relations_owner_${operation}`, "i"));
}

const ownerChecks = sql.match(/owner_user_id = auth\.uid\(\)/g) ?? [];
assert.ok(ownerChecks.length >= 8, "RLS deve verificare proprietario e nodi collegati");
assert.match(sql, /grant select, insert, update, delete on public\.knowledge_relations to authenticated/i);
assert.match(sql, /distinct_objects_constraint/i);
assert.match(sql, /allowed_types_constraint/i);
assert.match(sql, /symmetric_unique_index/i);

console.log("Knowledge Graph schema: 16 controlli statici superati.");
