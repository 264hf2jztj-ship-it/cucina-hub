const CACHE_NAME = "cucina-hub-v34";

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./dashboard-core.js",
  "./dashboard.js",
  "./dashboard.css",
  "./learning/index.html",
  "./learning/learning-core.js",
  "./learning/learning.js",
  "./learning/learning.css",
  "./analytics/index.html",
  "./analytics/analytics-core.js",
  "./analytics/analytics.js",
  "./analytics/analytics.css",
  "./experiments/index.html",
  "./experiments/experiments-core.js",
  "./experiments/experiments.js",
  "./experiments/experiments.css",
  "./versions/index.html",
  "./versions/versions-core.js",
  "./versions/versions.js",
  "./versions/versions.css",
  "./chef/index.html",
  "./chef/chef.js",
  "./chef/chef.css",
  "./library/reader.html",
  "./library/reader.css",
  "./library/epub-reader-core.js",
  "./library/reader.js",
  "./library/reader-lifecycle.js",
  "./planner/ai.html",
  "./planner/planner-ai.css",
  "./planner/planner-ai-core.js",
  "./planner/planner-ai.js",
  "./fermentation/index.html",
  "./fermentation/lab.css",
  "./fermentation/lab.js",
  "./fermentation/fermentation-assistant.html",
  "./fermentation/assistant-response-ui.js",
  "./fermentation/assistant-provider-ui.js",
  "./knowledge/rag.html",
  "./knowledge/rag.css",
  "./knowledge/rag-ingestion.css",
  "./knowledge/rag-ingestion-core.js",
  "./knowledge/rag-pdf-core.js",
  "./knowledge/rag.js",
  "./workflow-engine/fermentation-learning-engine.js",
  "./workflow-engine/fermentation-assistant-context-engine.js",
  "./workflow-engine/fermentation-assistant-response-engine.js",
  "./supabase-config.js",
  "./supabase-client.js",
  "./recipe-library-supabase.js",
  "./auth.js",
  "./manifest.json",
  "./icon.svg"
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

  // Memorizza soltanto la struttura pubblica e statica dell'app.
  // JSON personali, token, sessioni e risposte Supabase non vengono salvati.
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

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const destination = event.notification.data?.url || new URL("./planner/notifications.html?v=2", self.location.href).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(openClients => {
      const matchingClient = openClients.find(client => client.url === destination);
      if (matchingClient) return matchingClient.focus();
      return clients.openWindow(destination);
    })
  );
});
