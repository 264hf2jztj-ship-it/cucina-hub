"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.join(__dirname, "../supabase/040_planner_core.sql"), "utf8");

assert.match(sql, /create table if not exists public\.planned_meals/i);
assert.match(sql, /owner_user_id uuid not null default auth\.uid\(\)/i);
assert.match(sql, /recipe_id uuid not null references public\.recipes\(id\) on delete cascade/i);
assert.match(sql, /planned_date date not null/i);
assert.match(sql, /planned_time time without time zone/i);
assert.match(sql, /planned_meals_slot_allowed/i);
assert.match(sql, /planned_meals_servings_range/i);
assert.match(sql, /planned_meals_note_length/i);
assert.match(sql, /planned_meals_owner_schedule_idx/i);
assert.match(sql, /planned_meals_owner_recipe_idx/i);
assert.match(sql, /planned_meals_owner_schedule_recipe_key/i);
assert.match(sql, /alter table public\.planned_meals enable row level security/i);

for (const operation of ["select", "insert", "update", "delete"]) {
  assert.match(sql, new RegExp(`planned_meals_owner_${operation}`, "i"));
}

const ownerChecks = sql.match(/owner_user_id = auth\.uid\(\)/g) ?? [];
assert.ok(ownerChecks.length >= 5, "RLS deve verificare la proprietà dei pasti pianificati");

const recipeChecks = sql.match(/recipe\.owner_user_id = auth\.uid\(\)/g) ?? [];
assert.ok(recipeChecks.length >= 4, "RLS deve verificare la proprietà della ricetta collegata");

assert.match(sql, /grant select, insert, update, delete on public\.planned_meals to authenticated/i);
assert.match(sql, /recipe_foreign_key/i);
assert.match(sql, /rls_enabled/i);
assert.match(sql, /policy_count/i);

console.log("Planner schema: 22 controlli statici superati.");
