"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const sql = fs.readFileSync("supabase/053_rag_controlled_ingestion.sql", "utf8");
const html = fs.readFileSync("knowledge/rag.html", "utf8");
const js = fs.readFileSync("knowledge/rag.js", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

test("controlled ingestion is atomic, owner-scoped and invoker-secured", () => {
  for (const index of ["manual_id", "course_id", "knowledge_object_id"]) {
    assert.match(sql, new RegExp(`rag_source_indexes_${index}_idx`));
  }
  assert.match(sql, /create or replace function public\.replace_rag_source_chunks/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /source\.owner_user_id = v_owner_id/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /delete from public\.rag_source_chunks/);
  assert.match(sql, /insert into public\.rag_source_chunks/);
  assert.match(sql, /revoke all on function public\.replace_rag_source_chunks\(uuid, jsonb, text\) from public, anon/);
  assert.match(sql, /grant execute on function public\.replace_rag_source_chunks\(uuid, jsonb, text\) to authenticated/);
  assert.doesNotMatch(sql, /security definer/);
});

test("ingestion UI requires preview and explicit confirmation", () => {
  assert.match(html, /accept="\.pdf,\.txt,\.md,application\/pdf,text\/plain,text\/markdown"/);
  assert.match(html, /PREPARA ANTEPRIMA/);
  assert.match(html, /CONFERMA INDICIZZAZIONE/);
  assert.match(html, /rag-ingestion-core\.js\?v=1/);
  assert.match(html, /rag-pdf-core\.js\?v=2/);
  assert.match(html, /rag\.js\?v=5/);
  assert.match(fs.readFileSync("knowledge/rag-pdf-core.js", "utf8"), /streamTextContent/);
  assert.match(fs.readFileSync("knowledge/rag-pdf-core.js", "utf8"), /getReader/);
  assert.match(js, /window\.confirm/);
  assert.match(js, /rpc\("replace_rag_source_chunks"/);
  assert.match(js, /p_content_hash: ingestionHash/);
  assert.match(js, /pdfjs-dist@\$\{PDFJS_VERSION\}/);
  assert.match(js, /pageResult\.canonical_text/);
  assert.doesNotMatch(js, /storage\.from|\.upload\(/);
});

test("offline shell includes the ingestion engine without private content", () => {
  assert.match(sw, /knowledge\/rag-ingestion-core\.js/);
  assert.match(sw, /knowledge\/rag-pdf-core\.js/);
  assert.match(sw, /knowledge\/rag-ingestion\.css/);
  assert.doesNotMatch(sw, /rag_source_chunks/);
});
