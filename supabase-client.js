"use strict";

(() => {
  const config = window.CUCINA_HUB_CONFIG;
  const supabaseLibrary = window.supabase;

  if (!supabaseLibrary?.createClient) {
    throw new Error(
      "La libreria Supabase JS non è stata caricata."
    );
  }

  if (
    !config?.supabaseUrl ||
    !config?.supabasePublishableKey
  ) {
    throw new Error(
      "La configurazione Supabase è incompleta."
    );
  }

  if (
    !config.supabaseUrl.startsWith("https://") ||
    !config.supabasePublishableKey.startsWith("sb_publishable_")
  ) {
    throw new Error(
      "URL o publishable key Supabase non validi."
    );
  }

  const client = supabaseLibrary.createClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
    {
      db: {
        schema: "public"
      },

      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "cucina-hub-auth"
      }
    }
  );

  Object.defineProperty(
    window,
    "cucinaHubSupabase",
    {
      value: client,
      writable: false,
      configurable: false
    }
  );
})();
