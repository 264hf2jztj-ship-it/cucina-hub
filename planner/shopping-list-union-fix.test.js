"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(
  __dirname,
  "..",
  "supabase",
  "047_shopping_list_union_uuid_fix.sql"
);
const sql = fs.readFileSync(migrationPath, "utf8");
const originalSql = fs.readFileSync(
  path.join(__dirname, "..", "supabase", "046_shopping_list_core.sql"),
  "utf8"
);

function extractRefreshFunction(source) {
  const match = source.match(
    /create or replace function public\.refresh_weekly_shopping_list\(p_week_start date\)[\s\S]*?\n\$\$;/i
  );
  assert.ok(match, "weekly refresh function definition must exist");
  return match[0];
}

assert.match(
  sql,
  /create or replace function public\.refresh_weekly_shopping_list\(p_week_start date\)/i,
  "migration 047 must replace the weekly refresh function"
);

const nullUuidCasts = sql.match(/null::uuid/gi) || [];
assert.ok(
  nullUuidCasts.length >= 3,
  "every nullable UUID output in the UNION must be explicitly typed"
);

assert.match(
  sql,
  /item\.id,\s*null::uuid,\s*left\(item\.note, 1000\)/i,
  "food and preparation branches must type recipe_id as UUID"
);

assert.match(
  sql,
  /meal\.id,\s*null::uuid,\s*recipe\.id,/i,
  "meal recipe branch must type planned_meal_item_id as UUID"
);

assert.match(
  sql,
  /revoke all on function public\.refresh_weekly_shopping_list\(date\)[\s\S]*from public, anon, authenticated;/i,
  "replacement must preserve restricted function execution"
);

assert.match(
  sql,
  /grant execute on function public\.refresh_weekly_shopping_list\(date\)[\s\S]*to authenticated;/i,
  "authenticated users must retain access to the refresh RPC"
);

const normalizedFixedFunction = extractRefreshFunction(sql)
  .replaceAll("null::uuid", "null")
  .replaceAll("null::text", "null")
  .replaceAll("null::numeric(12, 3)", "null");
assert.equal(
  normalizedFixedFunction,
  extractRefreshFunction(originalSql),
  "migration 047 must change only the explicit NULL types inside the RPC"
);

console.log("Shopping list UNION UUID regression test passed.");
