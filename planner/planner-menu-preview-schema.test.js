"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(
  path.join(__dirname, "../supabase/044_planner_menu_preview_staging.sql"),
  "utf8"
);
const main = fs.readFileSync(
  path.join(__dirname, "../supabase/functions/planner-menu-preview/main.ts"),
  "utf8"
);
const config = fs.readFileSync(path.join(__dirname, "../supabase/config.toml"), "utf8");

assert.match(sql, /create table if not exists public\.planner_menu_import_requests/i);
assert.match(sql, /planner_menu_import_requests_owner_source_revision_key/i);
assert.match(sql, /alter table public\.planner_menu_import_requests enable row level security/i);
assert.match(sql, /create policy planner_menu_import_requests_owner_select[\s\S]*owner_user_id = auth\.uid\(\)/i);
assert.match(sql, /grant select on public\.planner_menu_import_requests to authenticated/i);
assert.doesNotMatch(sql, /grant (?:insert|update|delete)[^;]*planner_menu_import_requests to authenticated/i);

assert.match(sql, /create or replace function public\.stage_planner_menu_preview/i);
assert.match(sql, /security definer/i);
assert.match(sql, /v_owner_user_id uuid := auth\.uid\(\)/i);
assert.match(sql, /v_source_type <> 'chatgpt_project'/i);
assert.match(sql, /digest\(convert_to\(p_canonical_payload, 'UTF8'\), 'sha256'\)/i);
assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\('planner-menu:' \|\| v_owner_user_id::text/i);
assert.match(sql, /menu_preview_same_revision_payload_mismatch/i);
assert.match(sql, /insert into public\.planner_menu_import_requests/i);
assert.match(sql, /'preview_only', true/i);
assert.match(sql, /'requires_user_confirmation', true/i);
assert.doesNotMatch(sql, /insert into public\.planned_meals/i);
assert.doesNotMatch(sql, /insert into public\.planned_meal_items/i);

assert.match(sql, /create or replace function public\.update_planner_menu_preview_request/i);
assert.match(sql, /p_action not in \('open', 'cancel'\)/i);
assert.match(sql, /planner_menu_import_request_commit_sync/i);
assert.match(sql, /after insert or update of import_status, payload_hash, confirmed_at/i);
assert.match(sql, /status = 'committed'/i);
assert.match(sql, /committed_package_id = new\.id/i);
assert.match(sql, /revoke all on function public\.stage_planner_menu_preview[\s\S]*from public/i);
assert.match(sql, /grant execute on function public\.stage_planner_menu_preview[\s\S]*to authenticated/i);
assert.doesNotMatch(sql, /service_role/i);
assert.doesNotMatch(sql, /p_owner_user_id/i);

assert.match(main, /withSupabase\(\{ auth: "user" \}/i);
assert.match(main, /context\.supabase\.rpc\("stage_planner_menu_preview"/i);
assert.match(main, /direct_source_required/i);
assert.match(main, /owner_from_jwt:\s*true/i);
assert.match(main, /preview_only:\s*true/i);
assert.match(main, /automatic_writes:\s*false/i);
assert.match(main, /requires_user_confirmation:\s*true/i);
assert.doesNotMatch(main, /service_role|SUPABASE_SERVICE_ROLE_KEY/i);
assert.match(config, /\[functions\.planner-menu-preview\][\s\S]*verify_jwt = true/i);

const firstBegin = sql.search(/^begin;/im);
const firstCommit = sql.search(/^commit;/im);
assert.ok(firstBegin >= 0 && firstCommit > firstBegin, "La migration 044 deve essere transazionale.");

console.log("Planner menu preview staging ed Edge Function: controlli statici superati.");
