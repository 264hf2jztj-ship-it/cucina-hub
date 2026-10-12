"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.join(__dirname, "../supabase/056_nutrition_plan_core.sql"), "utf8");

assert.match(sql, /create table if not exists public\.nutrition_plan_weeks/i);
assert.match(sql, /planner_menu_package_id uuid primary key/i);
assert.match(sql, /owner_user_id uuid not null default auth\.uid\(\) references auth\.users\(id\) on delete cascade/i);
assert.match(sql, /foreign key \(owner_user_id, planner_menu_package_id\)[\s\S]*references public\.planner_menu_packages\(owner_user_id, id\)/i);
assert.match(sql, /weight_kg numeric\(5,2\) not null/i);
assert.match(sql, /waist_cm numeric\(5,2\) not null/i);
assert.match(sql, /body_fat_percent numeric\(4,1\)/i);
assert.match(sql, /protein_target_min_g smallint not null/i);
assert.match(sql, /protein_target_max_g smallint not null/i);
assert.match(sql, /source_payload jsonb not null/i);
assert.match(sql, /cucina-hub\.nutrition-plan/i);
assert.match(sql, /auto_if_conflict_free/i);
assert.match(sql, /require_confirmation/i);
assert.match(sql, /preserve_current_on_error/i);
assert.match(sql, /octet_length\(source_payload::text\) <= 2097152/i);
assert.match(sql, /source_payload #>> '\{check_in,note\}' is not distinct from check_in_note/i);
assert.match(sql, /coalesce\(source_payload #> '\{check_in,body_fat_percent\}', 'null'::jsonb\)/i);
assert.match(sql, /alter table public\.nutrition_plan_weeks enable row level security/i);
assert.match(sql, /revoke all on table public\.nutrition_plan_weeks from anon, authenticated/i);
assert.match(sql, /grant select on table public\.nutrition_plan_weeks to authenticated/i);
assert.doesNotMatch(sql, /grant select, insert|grant insert/i);
assert.match(sql, /nutrition_plan_weeks_owner_select/i);
assert.match(sql, /\(select auth\.uid\(\)\) = owner_user_id/i);
assert.match(sql, /drop constraint if exists planned_meals_slot_allowed/i);
assert.match(sql, /'pre_workout'/i);
assert.match(sql, /'post_workout'/i);

console.log("Nutrition plan schema: 26 controlli statici superati.");
