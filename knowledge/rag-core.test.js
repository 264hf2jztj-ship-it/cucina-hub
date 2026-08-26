"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const sql=fs.readFileSync("supabase/052_private_rag_core.sql","utf8");
const html=fs.readFileSync("knowledge/rag.html","utf8");
const js=fs.readFileSync("knowledge/rag.js","utf8");
const assistant=fs.readFileSync("fermentation/fermentation-assistant.html","utf8");
const context=fs.readFileSync("workflow-engine/fermentation-assistant-context-engine.js","utf8");
const edge=fs.readFileSync("supabase/functions/fermentation-assistant/main.ts","utf8");

test("RAG schema keeps source metadata separate from private chunks",()=>{
  assert.match(sql,/create table if not exists public\.rag_source_indexes/);
  assert.match(sql,/create table if not exists public\.rag_source_chunks/);
  assert.match(sql,/num_nonnulls\(manual_id, course_id, knowledge_object_id\) = 1/);
  assert.match(sql,/access_status in \('indexed', 'metadata_only', 'unavailable'\)/);
  assert.match(sql,/generated always as[\s\S]*to_tsvector\('italian'/);
  assert.match(sql,/using gin\(search_vector\)/);
});

test("RAG tables and search RPC are private to the authenticated owner",()=>{
  assert.equal((sql.match(/enable row level security/g)||[]).length,2);
  assert.equal((sql.match(/create policy rag_source_indexes_owner_/g)||[]).length,4);
  assert.equal((sql.match(/create policy rag_source_chunks_owner_/g)||[]).length,4);
  assert.match(sql,/security invoker/);
  assert.match(sql,/revoke all on function public\.search_rag_sources\(text, integer\) from public, anon/);
  assert.match(sql,/grant execute on function public\.search_rag_sources\(text, integer\) to authenticated/);
});

test("Fonti AI exposes explicit access states and authenticated retrieval",()=>{
  assert.match(html,/Indicizzate per l’AI/);
  assert.match(html,/Solo metadati/);
  assert.match(html,/Non disponibili/);
  assert.match(js,/auth\.getSession\(\)/);
  assert.match(js,/\.from\("rag_source_indexes"\)/);
  assert.match(js,/\.eq\("owner_user_id", session\.user\.id\)/);
  assert.match(js,/rpc\("search_rag_sources"/);
  assert.match(js,/retryNetwork/);
  assert.match(html,/id="retryLoad"/);
  assert.match(html,/rag\.js\?v=3/);
});

test("Fermentation Assistant retrieves and cites bounded library chunks",()=>{
  assert.match(assistant,/rpc\('search_rag_sources'/);
  assert.match(assistant,/p_limit:6/);
  assert.match(context,/retrieval_context:\{library\}/);
  assert.match(context,/source_id:`library\.\$\{item\.chunk_id\}`/);
  assert.match(context,/slice\(0,8\)/);
  assert.match(edge,/retrieval_context\.library\.results/);
});
