"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.join(__dirname, "../supabase/046_shopping_list_core.sql"), "utf8");

assert.match(sql, /create table if not exists public\.shopping_list_items/i);
assert.match(sql, /extract\(isodow from week_start\) = 1/i);
assert.match(sql, /source_type in \([\s\S]*'manual'[\s\S]*'planner_food'[\s\S]*'planner_preparation'[\s\S]*'planner_recipe'/i);
assert.match(sql, /create unique index if not exists shopping_list_items_owner_week_source_key/i);
assert.match(sql, /create trigger shopping_list_items_prepare_guard/i);
assert.match(sql, /alter table public\.shopping_list_items enable row level security/i);
assert.match(sql, /create policy shopping_list_items_owner_select/i);
assert.match(sql, /create policy shopping_list_items_owner_insert/i);
assert.match(sql, /create policy shopping_list_items_owner_update/i);
assert.match(sql, /create policy shopping_list_items_owner_delete/i);
assert.match(sql, /auth\.uid\(\)\) = owner_user_id/i);
assert.match(sql, /grant select, insert, update, delete[\s\S]*on public\.shopping_list_items[\s\S]*to authenticated/i);
assert.match(sql, /create or replace function public\.refresh_weekly_shopping_list\(p_week_start date\)/i);
assert.match(sql, /p_week_start must be a Monday/i);
assert.match(sql, /item\.item_type = 'food'/i);
assert.match(sql, /item\.item_type = 'preparation'/i);
assert.match(sql, /join public\.recipe_ingredients/i);
assert.match(sql, /on conflict \(owner_user_id, week_start, source_key\)/i);
assert.match(sql, /grant execute on function public\.refresh_weekly_shopping_list\(date\)[\s\S]*to authenticated/i);
assert.match(sql, /preservando voci manuali, acquisti ed esclusioni/i);

console.log("Lista spesa Core: schema migration verificato.");
