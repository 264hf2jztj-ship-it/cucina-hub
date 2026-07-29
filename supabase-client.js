"use strict";

(() => {
  try {
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
      !config.supabasePublishableKey.startsWith(
        "sb_publishable_"
      )
    ) {
      throw new Error(
        "URL o publishable key Supabase non validi."
      );
    }

    window.cucinaHubSupabase =
      supabaseLibrary.createClient(
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

    window.cucinaHubSupabaseError = null;
  } catch (error) {
    console.error(
      "Supabase non inizializzato:",
      error
    );

    window.cucinaHubSupabase = null;
    window.cucinaHubSupabaseError = error;
  }
})();
