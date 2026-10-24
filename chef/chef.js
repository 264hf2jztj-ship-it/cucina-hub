"use strict";
(() => {
  const FUNCTION_NAME = "chef-assistant";
  const $ = selector => document.querySelector(selector);
  function esc(value) { return String(value ?? "").replace(/[&<>\"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[char]); }
  function setStatus(message, kind = "") { const node=$("#pageStatus"); node.textContent=message; node.className=`chef-status ${kind}`.trim(); }
  async function functionErrorMessage(error) { const response=error?.context; if(response instanceof Response){try{const body=await response.clone().json();if(body?.message)return body.message;}catch{}} return error?.message||"Chiamata a Chef AI non riuscita."; }
  function renderList(blockSelector,listSelector,items){const values=Array.isArray(items)?items.filter(Boolean):[];$(blockSelector).hidden=values.length===0;$(listSelector).innerHTML=values.map(item=>`<li>${esc(item)}</li>`).join("");}
  function usageLabel(usage){if(!usage)return"Non disponibile";const input=Number(usage.input_tokens??usage.prompt_tokens??0);const output=Number(usage.output_tokens??usage.completion_tokens??0);return`${input.toLocaleString("it-IT")} input · ${output.toLocaleString("it-IT")} output`;}
  function renderSources(citations){const values=Array.isArray(citations)?citations:[];if(!values.length){$("#sourceList").innerHTML='<p class="source-empty">Nessuna fonte personale citata: la risposta è basata su conoscenza generale dichiarata.</p>';return;}$("#sourceList").innerHTML=values.map(item=>`<article class="source-card"><strong>${esc(item.source_id)} · ${esc(item.display_name)}</strong><span>${esc(item.heading||"Sezione senza titolo")}${item.locator?` · ${esc(item.locator)}`:""}</span><p>${esc(item.usage)}</p></article>`).join("");}
  function renderAnswer(data){const answer=data?.response;if(!answer?.answer)throw new Error("La risposta ricevuta non è completa.");$("#answerText").textContent=answer.answer;const badge=$("#evidenceBadge");const labels={sources:"Basata sulle fonti",mixed:"Fonti + conoscenza generale",general:"Conoscenza generale"};badge.textContent=labels[answer.evidence_mode]||"Origine non definita";badge.className=`evidence-badge ${answer.evidence_mode||"general"}`;renderList("#cautionsBlock","#cautionsList",answer.cautions);renderList("#assumptionsBlock","#assumptionsList",answer.assumptions);renderSources(data.citations);$("#modelName").textContent=data?.provider?.model||"—";$("#usageCount").textContent=usageLabel(data.usage);$("#answerPanel").hidden=false;$("#answerPanel").scrollIntoView({behavior:"smooth",block:"start"});}
  async function initialize() {
    const client = window.cucinaHubSupabase;
    if (!client) { setStatus("Supabase non inizializzato.", "error"); return; }
    let busy = false;
    const session = window.CucinaHubAuthGuard.watchAdministrator(client, access => {
      $("#workspace").hidden = !access.authorized;
      $("#authGate").hidden = access.authorized;
      $("#askChef").disabled = !access.authorized;
      if (!access.authorized) {
        busy = false;
        $("#chefQuestion").value = "";
        $("#answerPanel").hidden = true;
        for (const id of ["answerText", "evidenceBadge", "sourceList", "cautionsList", "assumptionsList", "modelName", "usageCount"]) $("#" + id).textContent = "";
      }
      setStatus(access.authorized ? "Pronto. Ogni domanda recupera al massimo sei frammenti privati pertinenti." : "Accesso amministratore richiesto. Accedi dalla Dashboard.", access.authorized ? "ok" : "error");
    });
    $("#chefForm").addEventListener("submit", async event => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      const ticket = await session.authorize();
      if (!ticket) { busy = false; return; }
      const question = $("#chefQuestion").value.trim();
      if (question.length < 3) { busy = false; return; }
      $("#askChef").disabled = true;
      $("#answerPanel").hidden = true;
      setStatus("Ricerca nelle fonti e generazione in corso… può richiedere fino a circa un minuto.", "working");
      try {
        const { data, error } = await client.functions.invoke(FUNCTION_NAME, { body: { question } });
        session.reject(error, ticket);
        if (!await session.confirm(ticket)) return;
        if (error) throw new Error(await functionErrorMessage(error));
        if (!session.isCurrent(ticket)) return;
        if (data?.guardrails?.automatic_writes !== false || data?.guardrails?.stored !== false) throw new Error("La risposta non rispetta i limiti di sicurezza di Cucina Hub.");
        renderAnswer(data);
        setStatus(`Risposta pronta. Recuperati ${Array.isArray(data.retrieval) ? data.retrieval.length : 0} frammenti; nessun dato è stato salvato.`, "ok");
      } catch (error) {
        session.reject(error, ticket);
        if (session.isCurrent(ticket)) setStatus(error.message, "error");
      } finally {
        if (session.isCurrent(ticket)) { busy = false; $("#askChef").disabled = false; }
      }
    });
    await session.start();
  }
  void initialize();
})();
