"use strict";

(() => {
  try {
    const config = window.CUCINA_HUB_CONFIG;
    const supabaseLibrary = window.supabase;

    if (!supabaseLibrary?.createClient) throw new Error("La libreria Supabase JS non è stata caricata.");
    if (!config?.supabaseUrl || !config.supabasePublishableKey) throw new Error("La configurazione Supabase è incompleta.");
    if (!config.supabaseUrl.startsWith("https://") || !config.supabasePublishableKey.startsWith("sb_publishable_")) throw new Error("URL o publishable key Supabase non validi.");

    window.cucinaHubSupabase = supabaseLibrary.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      db: { schema: "public" },
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "cucina-hub-auth" }
    });

    window.cucinaHubSupabaseError = null;
    const path = window.location.pathname;
    const modulePaths = [];
    if (path.endsWith("/workflow-engine/guided-session.html")) {
      modulePaths.push("./photo-diary-v2.js?v=2");
      modulePaths.push("./guided-session-notes.js?v=1");
    } else if (path.endsWith("/fermentation/baking-session-history.html")) {
      modulePaths.push("./history-photos.js?v=1");
      modulePaths.push("./history-learning-link.js?v=1");
      modulePaths.push("./assistant-link.js?v=1");
    } else if (path.endsWith("/fermentation/fermentation-diary.html")) {
      modulePaths.push("./diary-photos.js?v=2");
      modulePaths.push("./diary-notes.js?v=1");
    } else if (path.endsWith("/fermentation/baking-wizard.html")) {
      modulePaths.push("./dough-sizing-ui.js?v=1");
      modulePaths.push("./calendar-ui-cleanup.js?v=1");
      modulePaths.push("./assistant-link.js?v=1");
    } else if (path.endsWith("/fermentation/baking-sessions.html")) {
      modulePaths.push("./dough-sizing-ui.js?v=1");
      modulePaths.push("./history-learning-link.js?v=1");
      modulePaths.push("./assistant-link.js?v=1");
    } else if (path.endsWith("/fermentation/fermentation-learning.html")) {
      modulePaths.push("./assistant-link.js?v=1");
    } else if (path.endsWith("/fermentation/fermentation-assistant.html")) {
      modulePaths.push("./assistant-response-ui.js?v=1");
    }

    modulePaths.forEach(modulePath => {
      const script = document.createElement("script");
      script.src = modulePath;
      script.defer = true;
      document.head.appendChild(script);
    });
  } catch (error) {
    console.error("Supabase non inizializzato:", error);
    window.cucinaHubSupabase = null;
    window.cucinaHubSupabaseError = error;
  }
})();
