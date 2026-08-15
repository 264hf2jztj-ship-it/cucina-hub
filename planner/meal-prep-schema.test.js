"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.join(__dirname, "../supabase/045_meal_prep_core.sql"), "utf8");

assert.match(sql, /create table if not exists public\.meal_prep_tasks/i);
assert.match(sql, /planned_meal_id uuid not null[\s\S]*references public\.planned_meals\(id\) on delete cascade/i);
assert.match(sql, /planned_meal_item_id uuid[\s\S]*references public\.planned_meal_items\(id\) on delete set null/i);
assert.match(sql, /status in \('todo', 'in_progress', 'done'\)/i);
assert.match(sql, /task_type in \('prepare', 'cook', 'portion', 'store', 'defrost', 'other'\)/i);
assert.match(sql, /meal prep cannot be scheduled after the linked meal/i);
assert.match(sql, /linked meal cannot be moved before an existing meal prep task/i);
assert.match(sql, /planned_meal_item_id must belong to the linked meal and user/i);
assert.match(sql, /create trigger planned_meals_meal_prep_schedule_guard/i);
assert.match(sql, /alter table public\.meal_prep_tasks enable row level security/i);
assert.match(sql, /create policy meal_prep_tasks_owner_select/i);
assert.match(sql, /create policy meal_prep_tasks_owner_insert/i);
assert.match(sql, /create policy meal_prep_tasks_owner_update/i);
assert.match(sql, /create policy meal_prep_tasks_owner_delete/i);
assert.match(sql, /owner_user_id = auth\.uid\(\)/i);
assert.match(sql, /grant select, insert, update, delete on public\.meal_prep_tasks to authenticated/i);

console.log("Meal Prep Core: schema migration verificato.");
