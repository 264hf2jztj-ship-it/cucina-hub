"use strict";

(() => {
  const ENGINE_PATH = "../workflow-engine/fermentation-assistant-response-engine.js?v=1";

  function esc(value) {
    return String(value ?? "").replace(/[&<>\"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    })[char]);
  }

  function loadEngine() {
    if (window.CucinaHubFermentationAssistantResponseEngine) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = ENGINE_PATH;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Impossibile caricare il validatore della risposta AI."));
      document.head.appendChild(script);
    });
  }

  function requestPacket() {
    const raw = document.querySelector("#packet")?.value?.trim();
    if (!raw) throw new Error("Prima prepara la richiesta AI, così il validatore può confrontare la risposta con il contesto.");
    try { return JSON.parse(raw); }
    catch (error) { throw new Error("Il pacchetto della richiesta non è un JSON valido."); }
  }

  function issueList(items, emptyMessage) {
    if (!items.length) return `<div class="response-ok">${esc(emptyMessage)}</div>`;
    return items.map(item => `<div class="response-issue ${esc(item.severity)}"><strong>${esc(item.path)}</strong><br>${esc(item.message)}</div>`).join("");
  }

  function preview(response, result) {
    const proposal = response.proposal || {};
    const ingredients = Array.isArray(proposal.ingredients) ? proposal.ingredients : [];
    const phases = Array.isArray(proposal.fermentation?.phases) ? proposal.fermentation.phases : [];
    return `
      <div class="response-preview-grid">
        <div class="response-stat"><span>Esito</span><strong>${result.valid ? "VALIDA" : "DA CORREGGERE"}</strong></div>
        <div class="response-stat"><span>Impasto totale</span><strong>${result.metrics.declared_total_g ?? "—"} g</strong></div>
        <div class="response-stat"><span>Idratazione verificata</span><strong>${result.metrics.hydration_percent ?? "—"}%</strong></div>
        <div class="response-stat"><span>Fermentazione totale</span><strong>${result.metrics.fermentation_total_minutes ?? "—"} min</strong></div>
      </div>
      <h4>Ingredienti controllati</h4>
      <div class="response-items">${ingredients.map(item => `<div><strong>${esc(item.name || item.role)}</strong><span>${esc(item.grams)} g · ${esc(item.source_id || "fonte non dichiarata")}</span></div>`).join("") || "Nessun ingrediente disponibile."}</div>
      <h4>Fasi controllate</h4>
      <div class="response-items">${phases.map(item => `<div><strong>${esc(item.name)}</strong><span>${esc(item.duration_minutes)} min${item.temperature_c == null ? "" : ` · ${esc(item.temperature_c)} °C`}</span></div>`).join("") || "Nessuna fase disponibile."}</div>
    `;
  }

  function addStyles() {
    if (document.querySelector("#assistant-response-style")) return;
    const style = document.createElement("style");
    style.id = "assistant-response-style";
    style.textContent = `
      .response-contract{background:#fff;border:1px solid #ddd5ca;border-radius:18px;padding:18px;margin-bottom:18px}
      .response-contract textarea{min-height:300px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.84rem;background:#1f2428;color:#f6f8fa;border:0}
      .response-contract .response-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:12px}
      .response-contract .response-actions button{width:auto}
      .response-contract .example-button{background:#6d408f}
      .response-validation{margin-top:14px}
      .response-preview-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:13px}
      .response-stat{background:#faf8f4;border-radius:11px;padding:11px}
      .response-stat span{display:block;color:#6d655c;font-size:.82rem}.response-stat strong{display:block;margin-top:4px}
      .response-issue{border-radius:11px;padding:10px;margin-top:8px}.response-issue.error{background:#fff0f0;border-left:4px solid #a62424}.response-issue.warning{background:#fff8df;border-left:4px solid #8d4b12}
      .response-ok{background:#eef5f0;border-left:4px solid #176b35;border-radius:11px;padding:10px;margin-top:8px}
      .response-items{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px}.response-items div{background:#faf8f4;border-radius:10px;padding:10px}.response-items span{display:block;color:#6d655c;margin-top:3px;font-size:.86rem}
      .response-boundary{background:#edf4fb;border:1px solid #bfd1e2;border-radius:12px;padding:12px;margin-top:12px}
      @media(max-width:760px){.response-preview-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.response-contract .response-actions button{width:100%}}
      @media(max-width:430px){.response-preview-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function initialize() {
    if (document.querySelector("#assistantResponseContract")) return true;
    const resultRoot = document.querySelector("#result");
    if (!resultRoot) return false;
    addStyles();
    const section = document.createElement("section");
    section.id = "assistantResponseContract";
    section.className = "response-contract";
    section.innerHTML = `
      <h2>8. Controllo della risposta AI</h2>
      <p class="muted">Incolla qui il JSON restituito dal futuro provider. Il sistema verifica formato, ingredienti, bilanci, fermentazione, forno, fonti, confidenza e conferma obbligatoria.</p>
      <textarea id="assistantResponseJson" placeholder="La risposta JSON del provider comparirà qui nel prossimo sottostep."></textarea>
      <div class="response-actions">
        <button id="loadTechnicalExample" class="example-button" type="button">CARICA ESEMPIO TECNICO</button>
        <button id="validateAssistantResponse" type="button">VALIDA RISPOSTA</button>
      </div>
      <div class="response-boundary"><strong>Nessuna applicazione automatica</strong><br>Una risposta valida è soltanto un’anteprima. Questo step non crea ricette, profili o sessioni e non contiene ancora un provider AI.</div>
      <div id="assistantResponseValidation" class="response-validation muted">Prepara prima la richiesta AI, poi carica l’esempio tecnico o incolla una risposta JSON.</div>
    `;
    resultRoot.appendChild(section);

    const input = section.querySelector("#assistantResponseJson");
    const output = section.querySelector("#assistantResponseValidation");
    const engine = window.CucinaHubFermentationAssistantResponseEngine;

    section.querySelector("#loadTechnicalExample").addEventListener("click", () => {
      try {
        const example = engine.buildTechnicalExample(requestPacket());
        input.value = JSON.stringify(example, null, 2);
        output.className = "response-validation muted";
        output.textContent = "Esempio tecnico caricato. Ora premi VALIDA RISPOSTA.";
      } catch (error) {
        output.className = "response-validation error";
        output.textContent = error.message;
      }
    });

    section.querySelector("#validateAssistantResponse").addEventListener("click", () => {
      try {
        const packet = requestPacket();
        const response = engine.parse(input.value);
        const validation = engine.validate(response, packet);
        output.className = `response-validation ${validation.valid ? "ok" : "error"}`;
        output.innerHTML = `
          <h3>${validation.valid ? "Risposta conforme al contratto" : "Risposta non applicabile"}</h3>
          ${preview(response, validation)}
          <h4>Errori bloccanti (${validation.errors.length})</h4>
          ${issueList(validation.errors, "Nessun errore bloccante.")}
          <h4>Avvisi (${validation.warnings.length})</h4>
          ${issueList(validation.warnings, "Nessun avviso.")}
          <div class="response-boundary"><strong>Conferma ancora necessaria</strong><br>Anche una risposta valida non viene salvata o trasferita al Wizard in questo sottostep.</div>
        `;
        output.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (error) {
        output.className = "response-validation error";
        output.textContent = error.message;
      }
    });
    return true;
  }

  loadEngine().then(() => {
    if (initialize()) return;
    const wait = window.setInterval(() => {
      if (!initialize()) return;
      window.clearInterval(wait);
    }, 100);
    window.setTimeout(() => window.clearInterval(wait), 10000);
  }).catch(error => console.error(error));
})();
