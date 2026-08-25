"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(
  __dirname,
  "..",
  "supabase",
  "048_shopping_list_conflict_target_fix.sql"
);
const previousMigrationPath = path.join(
  __dirname,
  "..",
  "supabase",
  "047_shopping_list_union_uuid_fix.sql"
);

const sql = fs.readFileSync(migrationPath, "utf8");
const previousSql = fs.readFileSync(previousMigrationPath, "utf8");

function extractRefreshFunction(source) {
  const match = source.match(
    /create or replace function public\.refresh_weekly_shopping_list\(p_week_start date\)[\s\S]*?\n\$\$;/i
  );
  assert.ok(match, "weekly refresh function definition must exist");
  return match[0];
}

const fixedFunction = extractRefreshFunction(sql);
const previousFunction = extractRefreshFunction(previousSql);

assert.match(
  fixedFunction,
  /as \$\$\s*#variable_conflict use_column\s*declare/i,
  "the function must prefer table columns before PL/pgSQL variables"
);

assert.equal(
  fixedFunction.replace(/#variable_conflict use_column\s*/i, ""),
  previousFunction,
  "migration 048 must preserve the function logic from migration 047"
);

assert.match(
  sql,
  /variable_conflict_use_column/i,
  "the migration verification must check the conflict-resolution directive"
);

assert.match(
  sql,
  /null::uuid/i,
  "the UUID casts introduced by migration 047 must remain present"
);

assert.match(
  sql,
  /grant execute on function public\.refresh_weekly_shopping_list\(date\)[\s\S]*to authenticated;/i,
  "authenticated users must retain access to the refresh RPC"
);

assert.doesNotMatch(
  sql,
  /alter function[\s\S]*set plpgsql\.variable_conflict/i,
  "the fix must not rely on a superuser-only runtime parameter"
);

console.log("Shopping list ON CONFLICT ambiguity regression test passed.");

