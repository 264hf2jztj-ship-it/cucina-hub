"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sql = fs.readFileSync(path.join(root, "supabase/055_weber_cook_sessions.sql"), "utf8");
const html = fs.readFileSync(path.join(root, "weber/diary.html"), "utf8");
const js = fs.readFileSync(path.join(root, "weber/diary.js"), "utf8");
const css = fs.readFileSync(path.join(root, "weber/diary.css"), "utf8");
const worker = fs.readFileSync(path.join(root, "sw.js"), "utf8");

test("lo schema Weber registra il setup tecnico senza duplicare le ricette", () => {
  assert.match(sql, /create table if not exists public\.weber_cook_sessions/);
  for (const field of [
    "recipe_id", "cooking_method", "fuel_type", "fuel_amount", "fuel_unit",
    "vent_bottom_percent", "vent_top_percent", "target_grate_temp_c",
    "peak_grate_temp_c", "food_core_temp_c", "duration_minutes", "next_change"
  ]) assert.match(sql, new RegExp(`\\b${field}\\b`));
  assert.doesNotMatch(sql, /create table(?: if not exists)? public\.recipes\b/i);
  assert.match(sql, /recipe_id uuid references public\.recipes\(id\) on delete set null/);
});

test("la tabella è owner-scoped con RLS CRUD e controllo della ricetta", () => {
  assert.match(sql, /alter table public\.weber_cook_sessions enable row level security/);
  assert.match(sql, /revoke all on table public\.weber_cook_sessions from anon, authenticated/);
  assert.match(sql, /grant select, insert, update, delete on table public\.weber_cook_sessions to authenticated/);
  assert.equal((sql.match(/create policy weber_cook_sessions_owner_/g) ?? []).length, 4);
  assert.match(sql, /using \(\(select auth\.uid\(\)\) = owner_user_id\)/);
  assert.match(sql, /recipe\.owner_user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /with check/);
});

test("l'interfaccia usa auth amministratore e CRUD owner-scoped", () => {
  assert.match(html, /auth-guard\.js\?v=1/);
  assert.match(html, /Una cottura, un setup misurabile/);
  assert.match(js, /CucinaHubAuthGuard\.requireAdministrator\(client\)/);
  assert.match(js, /\.from\("weber_cook_sessions"\)/);
  for (const action of ["insert", "update", "delete"]) assert.match(js, new RegExp(`\\.${action}\\(`));
  assert.ok((js.match(/\.eq\("owner_user_id", state\.user\.id\)/g) ?? []).length >= 3);
});

test("il diario resta touch-first, offline e distinto dagli Esperimenti", () => {
  assert.match(html, /Diario ≠ Esperimento/);
  assert.match(css, /min-height:48px/);
  assert.match(css, /@media\(max-width:600px\)/);
  for (const asset of ["diary.html", "diary-core.js", "diary.js", "diary.css"]) {
    assert.match(worker, new RegExp(`"\\.\\/weber\\/${asset.replace(".", "\\.")}"`));
  }
  assert.match(worker, /const CACHE_NAME = "cucina-hub-v49"/);
});
