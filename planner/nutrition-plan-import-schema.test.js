"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(
  path.join(__dirname, "../supabase/057_nutrition_plan_atomic_import.sql"),
  "utf8"
);

assert.match(sql, /add column if not exists source_payload_hash text/i);
assert.match(sql, /source_payload_hash ~ '\^\[0-9a-f\]\{64\}\$'/i);
assert.match(sql, /create policy nutrition_plan_weeks_owner_insert/i);
assert.match(sql, /for insert[\s\S]*with check/i);
assert.match(sql, /grant insert on table public\.nutrition_plan_weeks to authenticated/i);
assert.match(sql, /create or replace function public\.commit_nutrition_plan/i);
assert.match(sql, /security invoker/i);
assert.match(sql, /v_owner_user_id uuid := auth\.uid\(\)/i);
assert.match(sql, /nutrition_commit_auth_required/i);
assert.match(sql, /digest\(convert_to\(p_canonical_payload, 'UTF8'\), 'sha256'\)/i);
assert.match(sql, /nutrition_commit_hash_mismatch/i);
assert.match(sql, /cucina-hub\.nutrition-plan/i);
assert.match(sql, /auto_if_conflict_free/i);
assert.match(sql, /require_confirmation/i);
assert.match(sql, /preserve_current_on_error/i);
assert.match(sql, /nutrition_commit_conflict_confirmation_required/i);
assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\('planner-menu:' \|\| v_owner_user_id::text, 0\)\)/i);
assert.match(sql, /public\.commit_planner_menu_package\(/i);
assert.match(sql, /insert into public\.nutrition_plan_weeks/i);
assert.match(sql, /nutrition_commit_same_revision_payload_mismatch/i);
assert.match(sql, /nutrition_commit_identity_collision/i);
assert.match(sql, /'pre_workout'/i);
assert.match(sql, /'post_workout'/i);
assert.match(sql, /revoke all on function public\.commit_nutrition_plan[\s\S]*from public, anon, authenticated/i);
assert.match(sql, /grant execute on function public\.commit_nutrition_plan[\s\S]*to authenticated/i);
assert.doesNotMatch(sql, /service_role/i);
assert.doesNotMatch(sql, /p_owner_user_id/i);

console.log("Nutrition plan atomic import schema: 27 controlli statici superati.");
