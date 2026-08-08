"use strict";

(() => {
  try {
    const config = window.CUCINA_HUB_CONFIG;
    const supabaseLibrary = window.supabase;

    if (!supabaseLibrary?.createClient) throw new Error("La libreria Supabase JS non è stata caricata.");
    if (!config?.supabaseUrl || !config?.supabasePublishableKey) throw new Error("La configurazione Supabase è incompleta.");
    if (!config.supabaseUrl.startsWith("https://") || !config.supabasePublishableKey.startsWith("sb_publishable_")) throw new Error("URL o publishable key Supabase non validi.");

    window.cucinaHubSupabase = supabaseLibrary.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      db: { schema: "public" },
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "cucina-hub-auth" }
    });

    window.cucinaHubSupabaseError = null;
    const path = window.location.pathname;
    let modulePath = null;
    if (path.endsWith("/workflow-engine/guided-session.html")) modulePath = "./photo-diary-v2.js?v=2";
    else if (path.endsWith("/fermentation/baking-session-history.html")) modulePath = "./history-photos.js?v=1";
    if (modulePath) {
      const script = document.createElement("script");
      script.src = modulePath;
      script.defer = true;
      document.head.appendChild(script);
    }
  } catch (error) {
    console.error("Supabase non inizializzato:", error);
    window.cucinaHubSupabase = null;
    window.cucinaHubSupabaseError = error;
  }
})();
