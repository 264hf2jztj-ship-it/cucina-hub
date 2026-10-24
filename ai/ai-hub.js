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

    const session = window.CucinaHubAuthGuard.watchAdministrator(client, access => {
      workspace.hidden = !access.authorized;
      authGate.hidden = access.authorized;
      workspace.inert = !access.authorized;
      setStatus(access.authorized
        ? "Assistente AI pronto come hub. Scegli il modulo adatto; la generazione reale resta soggetta alla configurazione del provider."
        : "Accesso amministratore richiesto. Accedi dalla Dashboard.", access.authorized ? "ok" : "error");
    });
    workspace.addEventListener("click", async event => {
      const link = event.target.closest("a");
      if (!link) return;
      event.preventDefault();
      if (await session.authorize()) window.location.href = link.href;
    });
    await session.start();
  }

  void initialize();
})();
