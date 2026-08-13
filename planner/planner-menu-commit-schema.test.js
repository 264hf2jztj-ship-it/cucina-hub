"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(
  path.join(__dirname, "../supabase/042_planner_menu_atomic_commit.sql"),
  "utf8"
);

assert.match(sql, /create or replace function public\.commit_planner_menu_package\s*\(/i);
assert.match(sql, /language plpgsql/i);
assert.match(sql, /security invoker/i);
assert.match(sql, /v_owner_user_id uuid := auth\.uid\(\)/i);
assert.match(sql, /p_confirmed is not true/i);
assert.match(sql, /digest\(convert_to\(p_canonical_payload, 'UTF8'\), 'sha256'\)/i);
assert.match(sql, /pg_advisory_xact_lock/i);
assert.match(sql, /lock table public\.planned_meals in share row exclusive mode/i);
assert.match(sql, /lock table public\.planned_meal_items in share row exclusive mode/i);
assert.match(sql, /for update/i);
assert.match(sql, /menu_commit_same_revision_payload_mismatch/i);
assert.match(sql, /menu_commit_stale_revision/i);
assert.match(sql, /menu_commit_conflicts_changed/i);
assert.match(sql, /menu_commit_library_resolution_changed/i);

assert.match(sql, /insert into public\.planner_menu_packages/i);
assert.match(sql, /insert into public\.planned_meals/i);
assert.match(sql, /insert into public\.planned_meal_items/i);
assert.match(sql, /import_status,\s*confirmed_at/i);
assert.match(sql, /'confirmed',\s*now\(\)/i);
assert.match(sql, /update public\.planner_menu_packages[\s\S]*import_status = 'superseded'/i);
assert.match(sql, /delete from public\.planned_meals/i);
assert.match(sql, /'status', 'committed'/i);
assert.match(sql, /'status', 'already_imported'/i);

assert.match(sql, /revoke all on function public\.commit_planner_menu_package[\s\S]*from public/i);
assert.match(sql, /grant execute on function public\.commit_planner_menu_package[\s\S]*to authenticated/i);
assert.doesNotMatch(sql, /service_role/i);
assert.doesNotMatch(sql, /p_owner_user_id/i);

const firstBegin = sql.search(/^begin;/im);
const firstCommit = sql.search(/^commit;/im);
assert.ok(firstBegin >= 0 && firstCommit > firstBegin, "La migration deve essere transazionale.");

console.log("Planner menu atomic commit RPC: controlli statici superati.");
