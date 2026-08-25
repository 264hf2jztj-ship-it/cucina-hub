"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "notifications.html"), "utf8");
const js = fs.readFileSync(path.join(__dirname, "notifications.js"), "utf8");
const serviceWorker = fs.readFileSync(path.join(__dirname, "../sw.js"), "utf8");

for (const id of [
  "notificationsStatus",
  "notificationsWorkspace",
  "mealsEnabled",
  "mealLeadMinutes",
  "mealPrepEnabled",
  "mealPrepLeadMinutes",
  "enableSystemNotifications",
  "notificationList"
]) {
  assert.equal((html.match(new RegExp(`id=["']${id}["']`, "g")) || []).length, 1, `${id} deve essere univoco`);
}

assert.match(html, /apple-mobile-web-app-capable/i);
assert.match(html, /Gli elementi senza orario[\s\S]*non generano promemoria/i);
assert.match(js, /Notification\.requestPermission\(\)/);
assert.match(js, /registration\.showNotification/);
assert.match(js, /setAppBadge/);
assert.match(js, /onConflict: "owner_user_id,source_type,source_id"/);
assert.match(serviceWorker, /notificationclick/);
assert.match(serviceWorker, /clients\.openWindow/);

console.log("Notifiche Core: UI e integrazione PWA verificate.");
