"use strict";

(() => {
  const status = document.querySelector("#aiStatus");
  const authGate = document.querySelector("#aiAuthGate");
  const workspace = document.querySelector("#aiWorkspace");

  function setStatus(message, type = "") {
    status.textContent = message;
    status.className = `ai-status${type ? ` ${type}` : ""}`;
  }

  async function initialize() {
    const client = window.cucinaHubSupabase;
    if (!client) {
      setStatus(window.cucinaHubSupabaseError?.message || "Supabase non inizializzato.", "error");
      return;
    }

    const { data, error } = await client.auth.getSession();
    if (error) {
      setStatus(error.message || "Non è stato possibile verificare la sessione.", "error");
      return;
    }

    if (!data.session?.user) {
      authGate.hidden = false;
      setStatus("Accesso richiesto per usare gli assistenti personali.", "error");
      return;
    }

    workspace.hidden = false;
    setStatus(
      "Assistente AI pronto come hub. Scegli il modulo adatto; la generazione reale resta soggetta alla configurazione del provider.",
      "ok",
    );
  }

  void initialize();
})();
