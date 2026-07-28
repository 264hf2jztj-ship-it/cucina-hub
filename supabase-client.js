"use strict";

(() => {
  const wait = milliseconds =>
    new Promise(resolve =>
      setTimeout(resolve, milliseconds)
    );

  /*
   * Safari può generare sporadicamente "Load failed"
   * anche quando Supabase è raggiungibile.
   *
   * I tentativi vengono ripetuti soltanto quando fetch
   * non riceve alcuna risposta. Errori HTTP come password
   * errata non vengono ripetuti.
   */
  async function fetchWithRetry(input, init) {
    const maximumAttempts = 3;
    let lastError;

    for (
      let attempt = 1;
      attempt <= maximumAttempts;
      attempt += 1
    ) {
      try {
        const request = new Request(input, init);

        return await window.fetch(request);
      } catch (error) {
        lastError = error;

        console.warn(
          `Richiesta Supabase fallita, tentativo ${attempt}/${maximumAttempts}`,
          error
        );

        if (attempt === maximumAttempts) {
          throw error;
        }

        await wait(500 * attempt);
      }
    }

    throw lastError;
  }

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
          },

          global: {
            fetch: fetchWithRetry
          }
        }
      );

    window.cucinaHubSupabaseError = null;

    console.info(
      "Client Supabase inizializzato."
    );
  } catch (error) {
    console.error(
      "Supabase non inizializzato:",
      error
    );

    window.cucinaHubSupabase = null;
    window.cucinaHubSupabaseError = error;
  }
})();