"use strict";

(() => {
  const FUNCTION_NAME = "fermentation-assistant";

  function esc(value) {
    return String(value ?? "").replace(/[&<>\"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    })[char]);
  }

  function ensureAiHubLink() {
    const actions = document.querySelector(".head-actions");
    if (!actions || actions.querySelector("[data-ai-hub-link]")) return;
    const link = document.createElement("a");
    link.className = "button secondary";
    link.href = "../ai/index.html?v=2";
    link.dataset.aiHubLink = "true";
    link.textContent = "← ASSISTENTE AI";
    actions.insertBefore(link, actions.firstChild);
  }

  function addStyles() {
    if (document.querySelector("#assistant-provider-style")) return;
    const style = document.createElement("style");
    style.id = "assistant-provider-style";
    style.textContent = `
      .provider-panel{background:#fff;border:1px solid #ddd5ca;border-radius:18px;padding:18px;margin-bottom:18px}
      .provider-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:13px}
      .provider-actions button{width:auto}
      .provider-health{background:#eee8df!important;color:#26221d!important}
      .provider-generate{background:#245987!important}
      .provider-status{margin-top:13px;border-radius:12px;padding:12px;background:#faf8f4;border:1px solid #e4ddd3}
      .provider-status.ok{background:#eef5f0;border-color:#bdd1c2;color:#176b35}
      .provider-status.error{background:#fff0f0;border-color:#e3b4b4;color:#a62424}
      .provider-status.working{background:#edf4fb;border-color:#bfd1e2;color:#245987}
      .provider-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:12px}
      .provider-meta div{background:#faf8f4;border-radius:10px;padding:10px}
      .provider-meta span{display:block;color:#6d655c;font-size:.82rem}.provider-meta strong{display:block;margin-top:3px}
      .provider-boundary{background:#fff8df;border:1px solid #e4cf7d;border-radius:12px;padding:12px;margin-top:12px}
      @media(max-width:760px){.provider-actions button{width:100%}.provider-meta{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function packet() {
    const raw = document.querySelector("#packet")?.value?.trim();
    if (!raw) throw new Error("Prima premi PREPARA RICHIESTA AI.");
    let value;
    try { value = JSON.parse(raw); }
    catch { throw new Error("Il pacchetto della richiesta non è un JSON valido."); }
    const validation = window.CucinaHubFermentationAssistantContextEngine?.validate(value);
    if (!validation?.valid) throw new Error(validation?.errors?.join(" ") || "Pacchetto richiesta non valido.");
    return value;
  }

  async function functionErrorMessage(error) {
    const response = error?.context;
    if (response instanceof Response) {
      try {
        const body = await response.clone().json();
        if (body?.message) return body.message;
      } catch {}
    }
    return error?.message || "Chiamata alla Edge Function non riuscita.";
  }

  function usageLabel(usage) {
    if (!usage) return "Non disponibile";
    const input = usage.input_tokens ?? usage.prompt_tokens ?? 0;
    const output = usage.output_tokens ?? usage.completion_tokens ?? 0;
    return `${input} input · ${output} output`;
  }

  function setStatus(node, message, kind = "") {
    node.className = `provider-status ${kind}`.trim();
    node.textContent = message;
  }

  async function health(status, meta) {
    const client = window.cucinaHubSupabase;
    if (!client) throw new Error("Supabase non inizializzato.");
    setStatus(status, "Verifica della Edge Function…", "working");
    const { data, error } = await client.functions.invoke(FUNCTION_NAME, { body: { action: "health" } });
    if (error) throw new Error(await functionErrorMessage(error));
    meta.hidden = false;
    meta.querySelector("[data-provider]").textContent = data?.provider || "—";
    meta.querySelector("[data-model]").textContent = data?.model || "—";
    meta.querySelector("[data-usage]").textContent = data?.configured ? "Chiave configurata" : "Chiave mancante";
    if (!data?.configured) throw new Error("La funzione è raggiungibile, ma OPENAI_API_KEY non è ancora configurata nei secret Supabase.");
    setStatus(status, "Provider configurato. La generazione reale è disponibile.", "ok");
  }

  async function generate(button, status, meta) {
    const client = window.cucinaHubSupabase;
    if (!client) throw new Error("Supabase non inizializzato.");
    const requestPacket = packet();
    button.disabled = true;
    setStatus(status, "Generazione della proposta AI in corso… può richiedere fino a circa un minuto.", "working");
    try {
      const { data, error } = await client.functions.invoke(FUNCTION_NAME, { body: { packet: requestPacket } });
      if (error) throw new Error(await functionErrorMessage(error));
      if (!data?.response) throw new Error("La Edge Function non ha restituito una proposta.");
      if (data?.guardrails?.automatic_writes !== false || data?.guardrails?.requires_user_confirmation !== true) {
        throw new Error("La risposta del provider non rispetta i guardrail dell’applicazione.");
      }

      const responseInput = document.querySelector("#assistantResponseJson");
      const validateButton = document.querySelector("#validateAssistantResponse");
      if (!responseInput || !validateButton) throw new Error("Il validatore della risposta non è disponibile.");
      responseInput.value = JSON.stringify(data.response, null, 2);

      meta.hidden = false;
      meta.querySelector("[data-provider]").textContent = data.provider?.name || "openai";
      meta.querySelector("[data-model]").textContent = data.provider?.model || "—";
      meta.querySelector("[data-usage]").textContent = usageLabel(data.usage);
      setStatus(status, "Proposta ricevuta. Il validatore la controlla ora; nessun dato è stato salvato.", "ok");
      validateButton.click();
    } finally {
      button.disabled = false;
    }
  }

  function initialize() {
    ensureAiHubLink();
    if (document.querySelector("#assistantProviderPanel")) return true;
    const resultRoot = document.querySelector("#result");
    const responseContract = document.querySelector("#assistantResponseContract");
    if (!resultRoot || !responseContract) return false;

    addStyles();
    const responseHeading = responseContract.querySelector("h2");
    if (responseHeading) responseHeading.textContent = "9. Controllo della risposta AI";

    const section = document.createElement("section");
    section.id = "assistantProviderPanel";
    section.className = "provider-panel";
    section.innerHTML = `
      <h2>8. Generazione con provider AI</h2>
      <p class="muted">La richiesta viene inviata a OpenAI tramite una Supabase Edge Function autenticata. La chiave API resta sul server e la risposta torna sempre come anteprima.</p>
      <div class="provider-actions">
        <button id="checkAssistantProvider" class="provider-health" type="button">VERIFICA CONFIGURAZIONE</button>
        <button id="generateAssistantProposal" class="provider-generate" type="button">GENERA PROPOSTA AI</button>
      </div>
      <div id="assistantProviderStatus" class="provider-status">Prepara la richiesta, poi verifica la configurazione o genera la proposta.</div>
      <div id="assistantProviderMeta" class="provider-meta" hidden>
        <div><span>Provider</span><strong data-provider>—</strong></div>
        <div><span>Modello</span><strong data-model>—</strong></div>
        <div><span>Utilizzo</span><strong data-usage>—</strong></div>
      </div>
      <div class="provider-boundary"><strong>Limite di sicurezza</strong><br>La generazione usa credito API separato e non crea sessioni. Anche una risposta valida richiede ancora la conferma dell’utente.</div>
    `;
    resultRoot.insertBefore(section, responseContract);

    const status = section.querySelector("#assistantProviderStatus");
    const meta = section.querySelector("#assistantProviderMeta");
    const generateButton = section.querySelector("#generateAssistantProposal");

    section.querySelector("#checkAssistantProvider").addEventListener("click", async () => {
      try { await health(status, meta); }
      catch (error) { setStatus(status, error.message, "error"); }
    });

    generateButton.addEventListener("click", async () => {
      try { await generate(generateButton, status, meta); }
      catch (error) { setStatus(status, error.message, "error"); generateButton.disabled = false; }
    });
    return true;
  }

  if (initialize()) return;
  const wait = window.setInterval(() => {
    if (!initialize()) return;
    window.clearInterval(wait);
  }, 100);
  window.setTimeout(() => window.clearInterval(wait), 12_000);
})();
