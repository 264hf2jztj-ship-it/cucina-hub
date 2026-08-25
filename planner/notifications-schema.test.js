"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.join(__dirname, "../supabase/049_planner_notifications_core.sql"), "utf8");

assert.match(sql, /create table if not exists public\.planner_notification_preferences/i);
assert.match(sql, /create table if not exists public\.planner_notification_states/i);
assert.match(sql, /source_type in \('planned_meal', 'meal_prep_task'\)/i);
assert.match(sql, /status in \('unread', 'read', 'dismissed'\)/i);
assert.match(sql, /unique \(\s*owner_user_id,\s*source_type,\s*source_id\s*\)/i);
assert.match(sql, /alter table public\.planner_notification_preferences enable row level security/i);
assert.match(sql, /alter table public\.planner_notification_states enable row level security/i);
assert.match(sql, /to authenticated\s+using \(\(select auth\.uid\(\)\) = owner_user_id\)/i);
assert.match(sql, /to authenticated\s+with check \(\(select auth\.uid\(\)\) = owner_user_id\)/i);
assert.match(sql, /revoke all on table public\.planner_notification_preferences from anon/i);
assert.match(sql, /revoke all on table public\.planner_notification_states from anon/i);
assert.match(sql, /grant select, insert, update, delete[\s\S]*planner_notification_preferences[\s\S]*to authenticated/i);
assert.match(sql, /grant select, insert, update, delete[\s\S]*planner_notification_states[\s\S]*to authenticated/i);

console.log("Notifiche Core: schema migration verificato.");
