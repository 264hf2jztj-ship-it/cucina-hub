"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const sql = fs.readFileSync("supabase/054_rag_natural_language_search.sql", "utf8");

test("natural-language RAG search preserves strict matches and adds a bounded fallback", () => {
  assert.match(sql, /create or replace function public\.search_rag_sources/);
  assert.match(sql, /websearch_to_tsquery/);
  assert.match(sql, /plainto_tsquery/);
  assert.match(sql, /' & ',\s*' \| '/);
  assert.match(sql, /where scored\.strict_match/);
  assert.match(sql, /not exists/);
  assert.match(sql, /limit least\(greatest\(coalesce\(p_limit, 8\), 1\), 12\)/);
});

test("natural-language RAG search remains owner-scoped and invoker-secured", () => {
  assert.match(sql, /security invoker/);
  assert.match(sql, /source\.owner_user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /chunk\.owner_user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /revoke all on function public\.search_rag_sources\(text, integer\) from public, anon/);
  assert.match(sql, /grant execute on function public\.search_rag_sources\(text, integer\) to authenticated/);
  assert.doesNotMatch(sql, /security definer/);
});
