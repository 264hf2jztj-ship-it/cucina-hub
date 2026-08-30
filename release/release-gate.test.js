"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const home = read("index.html");
const auth = read("auth.js");
const plannerHub = read("planner/index.html");
const plannerWorkspace = read("planner/workspace.html");
const serviceWorker = read("sw.js");

function appShellAssets() {
  const block = serviceWorker.match(/const APP_SHELL = \[([\s\S]*?)\];/);
  assert.ok(block, "APP_SHELL deve essere dichiarata nel service worker");
  return [...block[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
}

test("Release gate keeps the private home locked until administrator validation", () => {
  assert.match(home, /<body class="auth-locked">/);
  assert.match(home, /id="authView"/);
  assert.match(home, /id="appShell"[^>]+hidden/);
  assert.match(auth, /auth\.getSession\(\)/);
  assert.match(auth, /from\("profiles"\)[\s\S]*select\("role"\)/);
  assert.match(auth, /data\?\.role === "admin"/);
  assert.match(auth, /SIGNED_OUT[\s\S]*clearPrivateData: true/);
});

test("Release gate exposes the main operational navigation", () => {
  for (const destination of [
    "fermentation/index.html",
    "planner/index.html",
    "learning/index.html",
    "analytics/index.html",
    "experiments/index.html",
    "versions/index.html",
    "library/reader.html",
    "knowledge/search.html"
  ]) {
    assert.match(home, new RegExp(destination.replaceAll(".", "\\.")));
  }
});

test("Release gate keeps Planner modules behind their session gates", () => {
  assert.match(plannerHub, /id="hubAuthGate"[^>]+hidden/);
  assert.match(plannerHub, /id="hubWorkspace"[^>]+hidden/);
  assert.match(plannerWorkspace, /id="authGate"[^>]+hidden/);
  assert.match(plannerWorkspace, /id="plannerWorkspace"[^>]+hidden/);

  for (const section of ["meal-plan", "shopping-list", "meal-prep", "menu-package"]) {
    assert.match(plannerWorkspace, new RegExp(`data-planner-module="${section}"`));
  }
});

test("Release gate caches a complete and valid Planner app shell", () => {
  const assets = appShellAssets();
  assert.equal(new Set(assets).size, assets.length, "APP_SHELL non deve contenere duplicati");

  for (const asset of assets) {
    if (asset === "./") continue;
    const localPath = asset.replace(/^\.\//, "").split("?")[0];
    assert.ok(fs.existsSync(path.join(root, localPath)), `Asset offline mancante: ${asset}`);
  }

  for (const asset of [
    "./planner/index.html",
    "./planner/workspace.html",
    "./planner/planner.js",
    "./planner/calendar.html",
    "./planner/notifications.html"
  ]) {
    assert.ok(assets.includes(asset), `Planner offline incompleto: ${asset}`);
  }

  assert.match(serviceWorker, /caches\.match\(url\.pathname\)/);
  assert.match(serviceWorker, /if \(cachedPath\)[\s\S]*return cachedPath/);
});
