"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = name => fs.readFileSync(path.resolve(__dirname, "..", name), "utf8");
const sql = read("supabase/migrations/20261018151912_weber_session_photos.sql");
const html = read("weber/photos.html");
const js = read("weber/photos.js");

test("schema foto: registro centrale, riferimenti protetti, RLS e indici", () => {
  assert.match(sql, /storage_file_id uuid not null unique references public\.storage_files\(id\) on delete restrict/);
  assert.match(sql, /references public\.weber_cook_sessions\(id\) on delete restrict/);
  assert.match(sql, /enable row level security/);
  assert.equal((sql.match(/create policy weber_photos_/g) ?? []).length, 4);
  assert.match(sql, /s\.owner_user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /f\.owner_user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /grant update \(photo_kind, caption\)/);
  assert.match(sql, /weber_photos_session_idx/);
});

test("RPC foto: registrazione e pulizia atomiche senza bypass RLS", () => {
  assert.equal((sql.match(/security invoker/g) ?? []).length, 2);
  assert.doesNotMatch(sql, /security definer/i);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /insert into public\.storage_files/);
  assert.match(sql, /delete from public\.storage_files/);
  assert.match(sql, /from public, anon/);
});

test("UI foto: autenticazione, fase, didascalia, camera e URL temporanei", () => {
  assert.match(js, /requireAdministrator\(client\)/);
  assert.match(js, /\.eq\("owner_user_id", state\.owner\)/);
  assert.match(html, /capture="environment"/);
  assert.match(html, /maxlength="1000"/);
  assert.match(js, /createSignedUrl\(file\.object_path, 300\)/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|getPublicUrl/);
  assert.match(js, /committed \? "Foto salvata/);
  assert.match(read("weber/diary.js"), /photos\.html\?session=/);
  assert.match(read("weber/diary.js"), /Elimina prima le foto/);
});

test("app shell contiene solo codice foto, non immagini personali", () => {
  const worker = read("sw.js");
  for (const file of ["photos.html", "photos.js", "photos-core.js", "photos.css"]) assert.ok(worker.includes(`"./weber/${file}"`));
  assert.match(worker, /if \(url\.origin !== self\.location\.origin\) return/);
  assert.match(read("weber/photos.css"), /min-height:48px/);
});
