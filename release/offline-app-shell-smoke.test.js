"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const serviceWorkerSource = fs.readFileSync(path.join(root, "sw.js"), "utf8");

function appShellAssets() {
  const block = serviceWorkerSource.match(/const APP_SHELL = \[([\s\S]*?)\];/);
  assert.ok(block, "APP_SHELL deve essere dichiarata");
  return [...block[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
}

function normalizeAsset(page, asset) {
  const clean = asset.split(/[?#]/)[0];
  return `./${path.posix.normalize(path.posix.join(path.posix.dirname(page), clean))}`;
}

function localDependencies(page) {
  const html = fs.readFileSync(path.join(root, page), "utf8");
  const references = [
    ...html.matchAll(/<script[^>]+src="([^"]+)"/g),
    ...html.matchAll(/<link[^>]+href="([^"]+)"/g)
  ].map(match => match[1]);

  return references
    .filter(reference => !/^(?:https?:|data:|#)/.test(reference))
    .map(reference => normalizeAsset(page, reference));
}

function createWorkerHarness({ offline = false, cached = {} } = {}) {
  const listeners = new Map();
  const stores = new Map();
  const deletedCaches = [];
  const putCalls = [];

  for (const [cacheName, entries] of Object.entries(cached)) {
    stores.set(cacheName, new Map(Object.entries(entries)));
  }

  const caches = {
    async open(cacheName) {
      if (!stores.has(cacheName)) stores.set(cacheName, new Map());
      const store = stores.get(cacheName);
      return {
        async addAll(assets) {
          for (const asset of assets) store.set(asset, new Response(asset));
        },
        async put(request, response) {
          const key = typeof request === "string" ? request : request.url;
          putCalls.push(key);
          store.set(key, response);
        }
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(cacheName) {
      deletedCaches.push(cacheName);
      return stores.delete(cacheName);
    },
    async match(request) {
      const key = typeof request === "string" ? request : request.url;
      for (const store of stores.values()) {
        if (store.has(key)) return store.get(key).clone();
      }
      return undefined;
    }
  };

  const self = {
    location: { href: "https://example.test/cucina-hub/sw.js", origin: "https://example.test" },
    clients: { claim() {}, openWindow() {}, matchAll: async () => [] },
    skipWaiting() {},
    addEventListener(type, listener) {
      listeners.set(type, listener);
    }
  };

  const fetch = async request => {
    if (offline) throw new Error("offline");
    return new Response(`network:${request.url}`, { status: 200 });
  };

  vm.runInNewContext(serviceWorkerSource, { caches, fetch, Response, URL, self });

  return { listeners, stores, deletedCaches, putCalls };
}

async function dispatchWaitable(listener, event = {}) {
  let pending;
  listener({ ...event, waitUntil(promise) { pending = promise; } });
  await pending;
}

async function dispatchFetch(listener, request) {
  let responsePromise;
  listener({ request, respondWith(promise) { responsePromise = promise; } });
  return responsePromise ? responsePromise : null;
}

test("l'app shell contiene ogni destinazione principale e le sue dipendenze locali", () => {
  const assets = new Set(appShellAssets());
  const destinations = [
    "planner/index.html",
    "learning/index.html",
    "analytics/index.html",
    "experiments/index.html",
    "versions/index.html",
    "ai/index.html",
    "library/reader.html",
    "fermentation/index.html",
    "knowledge/index.html",
    "knowledge/search.html"
  ];

  for (const destination of destinations) {
    assert.ok(assets.has(`./${destination}`), `Destinazione offline mancante: ${destination}`);
    for (const dependency of localDependencies(destination)) {
      assert.ok(assets.has(dependency), `Dipendenza offline mancante per ${destination}: ${dependency}`);
    }
  }
});

test("la home offline include tutti i cataloghi statici necessari all'avvio", () => {
  const assets = new Set(appShellAssets());
  for (const dataFile of [
    "./ricette.json",
    "./elettrodomestici.json",
    "./categorie.json",
    "./changelog.json",
    "./hurom-guide.json",
    "./weber-guide.json"
  ]) {
    assert.ok(assets.has(dataFile), `Catalogo offline mancante: ${dataFile}`);
  }
});

test("installazione e attivazione preparano v48 e rimuovono soltanto le cache precedenti", async () => {
  const harness = createWorkerHarness({ cached: { "cucina-hub-v47": {} } });
  await dispatchWaitable(harness.listeners.get("install"));

  const current = harness.stores.get("cucina-hub-v48");
  assert.ok(current);
  for (const asset of appShellAssets()) assert.ok(current.has(asset), `Asset non precached: ${asset}`);

  await dispatchWaitable(harness.listeners.get("activate"));
  assert.deepEqual(harness.deletedCaches, ["cucina-hub-v47"]);
  assert.ok(harness.stores.has("cucina-hub-v48"));
});

test("offline restituisce la pagina richiesta dalla cache e usa la home solo come fallback", async () => {
  const harness = createWorkerHarness({
    offline: true,
    cached: {
      "cucina-hub-v48": {
        "/cucina-hub/planner/index.html": new Response("planner-offline"),
        "./index.html": new Response("home-offline")
      }
    }
  });

  const fetchListener = harness.listeners.get("fetch");
  const planner = await dispatchFetch(fetchListener, {
    method: "GET",
    mode: "navigate",
    url: "https://example.test/cucina-hub/planner/index.html"
  });
  assert.equal(await (await planner).text(), "planner-offline");

  const unknown = await dispatchFetch(fetchListener, {
    method: "GET",
    mode: "navigate",
    url: "https://example.test/cucina-hub/not-cached.html"
  });
  assert.equal(await (await unknown).text(), "home-offline");
});

test("il service worker non intercetta API, CDN o richieste non GET", async () => {
  const harness = createWorkerHarness();
  const fetchListener = harness.listeners.get("fetch");

  for (const request of [
    { method: "POST", mode: "cors", url: "https://example.test/cucina-hub/api" },
    { method: "GET", mode: "cors", url: "https://project.supabase.co/rest/v1/recipes" },
    { method: "GET", mode: "cors", url: "https://cdn.jsdelivr.net/npm/library.js" }
  ]) {
    assert.equal(await dispatchFetch(fetchListener, request), null);
  }
});
