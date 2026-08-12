"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.join(__dirname, "../supabase/041_planner_menu_packages.sql"), "utf8");

assert.match(sql, /create table if not exists public\.planner_menu_packages/i);
assert.match(sql, /source_external_id text not null/i);
assert.match(sql, /source_revision integer not null default 1/i);
assert.match(sql, /payload_hash text/i);
assert.match(sql, /import_status text not null default 'preview'/i);
assert.match(sql, /planner_menu_packages_owner_source_revision_key/i);
assert.match(sql, /period_end >= period_start/i);
assert.match(sql, /source_type in \('chatgpt_project', 'manual', 'other'\)/i);
assert.match(sql, /import_status in \('preview', 'confirmed', 'superseded', 'cancelled'\)/i);

assert.match(sql, /alter table public\.planned_meals[\s\S]*add column if not exists menu_package_id uuid/i);
assert.match(sql, /add column if not exists source_meal_key text/i);
assert.match(sql, /add column if not exists is_user_modified boolean not null default false/i);
assert.match(sql, /alter column recipe_id drop not null/i);
assert.match(sql, /references public\.planner_menu_packages\(id\)[\s\S]*on delete cascade/i);
assert.match(sql, /planned_meals_owner_package_source_key/i);

assert.match(sql, /create table if not exists public\.planned_meal_items/i);
assert.match(sql, /item_type in \('recipe', 'food', 'preparation'\)/i);
assert.match(sql, /recipe_id uuid references public\.recipes\(id\) on delete set null/i);
assert.match(sql, /recipe_code text/i);
assert.match(sql, /ingredients jsonb/i);
assert.match(sql, /procedure jsonb/i);
assert.match(sql, /source_item_key text/i);
assert.match(sql, /planned_meal_items_meal_position_key/i);
assert.match(sql, /planned_meal_items_meal_source_key/i);

for (const table of ["planner_menu_packages", "planned_meal_items"]) {
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  for (const operation of ["select", "insert", "update", "delete"]) {
    assert.match(sql, new RegExp(`${table}_owner_${operation}`, "i"));
  }
}

assert.match(sql, /owner_user_id = auth\.uid\(\)/i);
assert.match(sql, /recipe\.owner_user_id = auth\.uid\(\)/i);
assert.match(sql, /package\.owner_user_id = auth\.uid\(\)/i);
assert.match(sql, /meal\.owner_user_id = auth\.uid\(\)/i);

assert.match(sql, /insert into public\.planned_meal_items/i);
assert.match(sql, /'legacy-recipe'/i);
assert.match(sql, /join public\.recipes recipe/i);
assert.match(sql, /not exists \([\s\S]*from public\.planned_meal_items item/i);

assert.match(sql, /planned_meals_recipe_nullable/i);
assert.match(sql, /package_idempotency_guard/i);
assert.match(sql, /legacy_meals_backfilled/i);

console.log("Planner menu package schema: controlli statici superati.");
