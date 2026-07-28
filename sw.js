const CACHE_NAME = "cucina-hub-v6";

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./supabase-config.js",
  "./supabase-client.js",
  "./manifest.json",
  "./icon.svg",
  "./ricette.json",
  "./elettrodomestici.json",
  "./categorie.json",
  "./changelog.json"
];

const APP_SHELL_PATHS = new Set(
  APP_SHELL.map(path => new URL(path, self.location.href).pathname)
);

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );

  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Non intercetta Supabase, CDN, URL firmati o altre origini.
  if (url.origin !== self.location.origin) return;

  const isNavigation = request.mode === "navigate";
  const isAppShellAsset = APP_SHELL_PATHS.has(url.pathname);

  // Memorizza soltanto la struttura statica dell'app.
  if (!isNavigation && !isAppShellAsset) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();

          caches
            .open(CACHE_NAME)
            .then(cache => cache.put(request, copy));
        }

        return response;
      })
      .catch(async () => {
        if (isNavigation) {
          return (
            (await caches.match("./index.html")) ??
            Response.error()
          );
        }

        return (
          (await caches.match(request)) ??
          Response.error()
        );
      })
  );
});
