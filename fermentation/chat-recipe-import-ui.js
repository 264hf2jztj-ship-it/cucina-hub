"use strict";

(() => {
  const ENGINE_PATH="../workflow-engine/chat-recipe-import-engine.js?v=1";
  let activeImport=null;
  let originalPresets=null;

  function esc(value){return String(value??"").replace(/[&<>\"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[char]);}
  function waitFor(check,timeoutMs=12000){return new Promise((resolve,reject)=>{const started=Date.now();const timer=setInterval(()=>{try{const value=check();if(value){clearInterval(timer);resolve(value);}else if(Date.now()-started>timeoutMs){clearInterval(timer);reject(new Error("Il Wizard non è pronto per l’importazione."));}}catch(error){clearInterval(timer);reject(error);}},80);});}
  function loadEngine(){if(window.CucinaHubChatRecipeImportEngine)return Promise.resolve();return new Promise((resolve,reject)=>{const script=document.createElement("script");script.src=ENGINE_PATH;script.onload=resolve;script.onerror=()=>reject(new Error("Motore importazione chat non disponibile."));document.head.appendChild(script);});}
  function localValue(date){return new Date(date-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
  function profileDisplay(profile){return window.CucinaHubChatRecipeImportEngine.profileLabel(profile);}
  function restorePresets(){if(!originalPresets||typeof presets==="undefined")return;Object.keys(originalPresets).forEach(key=>{presets[key]={...originalPresets[key]};});}
  function addStyles(){if(document.querySelector("#chat-import-style"))return;const style=document.createElement("style");style.id="chat-import-style";style.textContent=`
    .chat-import{background:#fff;border:1px solid #d8cfe2;border-radius:18px;padding:18px;margin-bottom:18px}
    .chat-import-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.chat-import-head h2{margin:0}
    .chat-import textarea{width:100%;min-height:220px;box-sizing:border-box;padding:12px;border-radius:11px;border:1px solid #bbb2c6;font:inherit;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.84rem;background:#fcfbfd}
    .chat-import-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:11px}.chat-import-actions button{width:auto}.chat-import-example{background:#6d408f!important}.chat-import-apply{background:#245987!important}
    .chat-import-result{margin-top:13px}.chat-import-state{border-radius:11px;padding:11px;background:#faf8f4}.chat-import-state.ok{background:#eef5f0;border-left:4px solid #176b35}.chat-import-state.error{background:#fff0f0;border-left:4px solid #a62424}.chat-import-state.warning{background:#fff8df;border-left:4px solid #8d4b12}
    .chat-import-preview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:11px}.chat-import-stat{background:#faf8f4;border-radius:10px;padding:10px}.chat-import-stat span{display:block;color:#6d655c;font-size:.82rem}.chat-import-stat strong{display:block;margin-top:3px}
    .chat-import-issues{display:grid;gap:7px;margin-top:10px}.chat-import-issue{border-radius:10px;padding:9px}.chat-import-issue.error{background:#fff0f0}.chat-import-issue.warning{background:#fff8df}
    .chat-import-match{margin-top:10px;padding:10px;border-radius:10px;background:#f4f0f8}.chat-import-boundary{margin-top:11px;padding:11px;border-radius:10px;background:#edf4fb;border:1px solid #bfd1e2}
    .chat-import-snapshot{background:#f4f0f8;border:1px solid #d4c6df;border-radius:12px;padding:13px;margin:12px 0}.chat-import-snapshot ul{margin-bottom:0}
    @media(max-width:760px){.chat-import-head{flex-direction:column}.chat-import-actions button{width:100%}.chat-import-preview{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:430px){.chat-import-preview{grid-template-columns:1fr}}
  `;document.head.appendChild(style);}
  function issueHtml(item){return `<div class="chat-import-issue ${esc(item.severity)}"><strong>${esc(item.path)}</strong><br>${esc(item.message)}</div>`;}
  function currentExample(){
    const engine=window.CucinaHubChatRecipeImportEngine;
    const target=document.querySelector("#targetMeal")?.value?new Date(document.querySelector("#targetMeal").value):new Date(Date.now()+30*3600000);
    const example=engine.buildExample(target);
    const environment=typeof environments!=="undefined"?(environments.find(item=>item.is_default)||environments[0]):null;
    const flour=typeof flourProfiles!=="undefined"?(flourProfiles.find(item=>item.is_default)||flourProfiles[0]):null;
    if(environment)example.environment={profile_id:environment.id,profile_name:environment.name};
    if(flour)example.flours=[{profile_id:flour.id,label:profileDisplay(flour),percentage:100}];
    return example;
  }
  function evaluate(raw){
    const engine=window.CucinaHubChatRecipeImportEngine;
    const validation=engine.validate(raw);
    if(!validation.packet)return{...validation,flourMatch:{matched:[],unmatched:[],ambiguous:[],complete:false},environmentMatch:{profile:null,status:"missing"},integrationErrors:[]};
    const flourMatch=engine.matchFlours(validation.packet,typeof flourProfiles!=="undefined"?flourProfiles:[]);
    const environmentMatch=engine.matchEnvironment(validation.packet,typeof environments!=="undefined"?environments:[]);
    const integrationErrors=[];
    flourMatch.unmatched.forEach(item=>integrationErrors.push({severity:"error",path:"flours",message:`Profilo farina non trovato: ${item.label||item.profile_id}.` }));
    flourMatch.ambiguous.forEach(item=>integrationErrors.push({severity:"error",path:"flours",message:`Riferimento farina ambiguo: ${item.reference.label||item.reference.profile_id}.` }));
    if((validation.packet.environment.profile_id||validation.packet.environment.profile_name)&&!environmentMatch.profile)integrationErrors.push({severity:"error",path:"environment",message:`Profilo ambiente non trovato: ${validation.packet.environment.profile_name||validation.packet.environment.profile_id}.`});
    return{...validation,flourMatch,environmentMatch,integrationErrors,valid:validation.valid&&!integrationErrors.length};
  }
  function renderEvaluation(result,node,applyButton){
    if(!result.packet){node.innerHTML=`<div class="chat-import-state error">${esc(result.errors[0]?.message||"Pacchetto non valido.")}</div>`;applyButton.hidden=true;return;}
    const packet=result.packet;
    const target=packet.target.meal_at?new Date(packet.target.meal_at).toLocaleString("it-IT",{weekday:"short",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"—";
    const format=packet.format.shape==="tray"?`${packet.format.count} teglia/e ${packet.format.tray_width_cm}×${packet.format.tray_length_cm} cm`:packet.format.shape==="round"?`${packet.format.count} panetti Ø ${packet.format.round_diameter_cm} cm`:`${packet.format.manual_flour_g} g farina`;
    const allErrors=[...result.errors,...result.integrationErrors];
    const warnings=result.warnings;
    const matchedFlours=result.flourMatch.matched.map(item=>`${item.percentage}% ${profileDisplay(item.profile)}`).join(" + ")||"—";
    node.innerHTML=`
      <div class="chat-import-state ${result.valid?"ok":"error"}"><strong>${result.valid?"Pacchetto pronto per il trasferimento":"Pacchetto da correggere"}</strong><br>${esc(packet.recipe.title)}</div>
      <div class="chat-import-preview">
        <div class="chat-import-stat"><span>Preparazione</span><strong>${esc(packet.recipe.product_style)}</strong></div>
        <div class="chat-import-stat"><span>Formato</span><strong>${esc(format)}</strong></div>
        <div class="chat-import-stat"><span>Formula</span><strong>${packet.formula.hydration_percent}% acqua · ${packet.formula.salt_percent}% sale</strong></div>
        <div class="chat-import-stat"><span>Pasto</span><strong>${esc(target)}</strong></div>
      </div>
      <div class="chat-import-match"><strong>Collegamenti trovati</strong><br>Ambiente: ${esc(result.environmentMatch.profile?.name||"—")}<br>Farine: ${esc(matchedFlours)}</div>
      ${allErrors.length?`<h3>Errori bloccanti (${allErrors.length})</h3><div class="chat-import-issues">${allErrors.map(issueHtml).join("")}</div>`:""}
      ${warnings.length?`<h3>Avvisi (${warnings.length})</h3><div class="chat-import-issues">${warnings.map(issueHtml).join("")}</div>`:""}
      <div class="chat-import-boundary"><strong>Nessun salvataggio automatico</strong><br>Il trasferimento compila e genera l’anteprima del Wizard. La sessione entra nel database soltanto premendo successivamente SALVA SESSIONE.</div>
    `;
    applyButton.hidden=!result.valid;
  }
  function setInput(selector,value,eventName="change"){
    const node=document.querySelector(selector);if(!node||value===null||value===undefined)return;node.value=String(value);node.dispatchEvent(new Event(eventName,{bubbles:true}));
  }
  function applyFormat(packet){
    const format=packet.format;
    if(format.shape==="manual"){
      setInput("#flourWeight",format.manual_flour_g,"input");
      return;
    }
    setInput("#sizingCount",format.count,"input");
    if(format.shape==="tray"){
      setInput("#trayWidth",format.tray_width_cm,"input");
      setInput("#trayLength",format.tray_length_cm,"input");
    }else if(format.shape==="round")setInput("#roundDiameter",format.round_diameter_cm,"input");
    setInput("#sizingProfile",format.sizing_profile,"change");
    if(format.sizing_profile==="custom")setInput("#loadingFactor",format.dough_loading_g_cm2,"input");
    window.CucinaHubDoughSizingWizard?.updatePreview();
  }
  function attachImportToProposal(){
    if(!activeImport||typeof plan==="undefined"||!plan||typeof workflow==="undefined"||!workflow)return;
    const engine=window.CucinaHubChatRecipeImportEngine;
    const packet=activeImport.packet;
    const environmentId=activeImport.environmentMatch.profile?.id||document.querySelector("#environmentProfile")?.value||null;
    const linkedFlours=activeImport.flourMatch.matched.map(item=>({profile_id:item.profile.id,label:profileDisplay(item.profile),percentage:item.percentage}));
    plan.title=`${packet.recipe.title} — ${typeof fmt==="function"?fmt(new Date(plan.target_meal_at)):new Date(plan.target_meal_at).toLocaleString("it-IT")}`;
    workflow.context=workflow.context||{};
    workflow.context.chat_recipe_import=engine.sessionSnapshot(packet,{environmentProfileId:environmentId,flours:linkedFlours});
    plan.workflow_definition=workflow;
    const summary=document.querySelector("#summary");
    if(summary&&!summary.dataset.chatImported){summary.textContent=`Ricetta importata dalla chat. ${summary.textContent}`;summary.dataset.chatImported="1";}
    let box=document.querySelector("#chatImportSnapshot");
    if(!box){box=document.createElement("div");box.id="chatImportSnapshot";box.className="chat-import-snapshot";document.querySelector("#flourInfo")?.insertAdjacentElement("beforebegin",box);}
    box.innerHTML=`<strong>Ricetta proveniente dalla chat</strong><br><span class="muted">${esc(packet.recipe.title)} · importazione v${packet.version}</span>${packet.recipe.goal?`<p><strong>Obiettivo:</strong> ${esc(packet.recipe.goal)}</p>`:""}${packet.process.length?`<strong>Procedimento concordato</strong><ul>${packet.process.map(item=>`<li>${esc(item)}</li>`).join("")}</ul>`:""}${packet.notes.length?`<strong>Note</strong><ul>${packet.notes.map(item=>`<li>${esc(item)}</li>`).join("")}</ul>`:""}`;
    if(typeof msg==="function")msg("Ricetta della chat trasferita e proposta generata. Controlla tutto prima di salvare.","ok");
  }
  function applyImport(result){
    const packet=result.packet,engine=window.CucinaHubChatRecipeImportEngine,overrides=engine.wizardOverrides(packet);
    if(!window.confirm(`Trasferire “${packet.recipe.title}” nel Wizard? Nessuna sessione verrà ancora salvata.`))return;
    restorePresets();
    setInput("#style",overrides.style,"change");
    const preset=presets[overrides.style];
    Object.assign(preset,{name:overrides.title,hydration:overrides.hydration_percent,salt:overrides.salt_percent,base:overrides.wizard_base_yeast_percent,bulk:overrides.bulk_minutes,proof:overrides.proof_minutes,ideal:overrides.ideal_temperature_c,bake:overrides.bake_minutes});
    setInput("#yeastType",overrides.yeast_type,"change");
    setInput("#ovenType",overrides.oven_type,"change");
    setInput("#guidanceMode",overrides.guidance_mode,"change");
    setInput("#targetMeal",localValue(new Date(overrides.meal_at)),"change");
    if(result.environmentMatch.profile)setInput("#environmentProfile",result.environmentMatch.profile.id,"change");
    blendRows=result.flourMatch.matched.map(item=>({profileId:item.profile.id,percentage:item.percentage}));
    renderFlourRows();
    applyFormat(packet);
    activeImport=result;
    if(typeof invalidateProposal==="function")invalidateProposal("Dati della chat trasferiti. Generazione dell’anteprima…");
    document.querySelector("#generate").click();
  }
  async function initialize(){
    await loadEngine();
    await waitFor(()=>document.querySelector("#generate")&&document.querySelector("#reset")&&window.CucinaHubDoughSizingWizard&&typeof presets!=="undefined"&&typeof flourProfiles!=="undefined"&&typeof environments!=="undefined");
    if(document.querySelector("#chatRecipeImport"))return;
    originalPresets=JSON.parse(JSON.stringify(presets));
    addStyles();
    const panel=document.createElement("section");panel.id="chatRecipeImport";panel.className="chat-import";panel.innerHTML=`
      <div class="chat-import-head"><div><h2>Importa ricetta dalla chat</h2><p class="muted">Incolla il pacchetto JSON preparato nel progetto Cucina. Il sistema controlla formula, formato, profili e limiti prima di compilare il Wizard.</p></div></div>
      <textarea id="chatRecipeJson" placeholder="Incolla qui il pacchetto cucina-hub.chat-recipe…"></textarea>
      <div class="chat-import-actions"><button id="chatImportExample" class="chat-import-example" type="button">CARICA ESEMPIO</button><button id="chatImportValidate" class="secondary" type="button">VALIDA PACCHETTO</button><button id="chatImportApply" class="chat-import-apply" type="button" hidden>TRASFERISCI AL WIZARD</button></div>
      <div id="chatImportResult" class="chat-import-result muted">Nessun pacchetto caricato.</div>
    `;
    document.querySelector("main > section.panel")?.insertAdjacentElement("beforebegin",panel);
    const input=panel.querySelector("#chatRecipeJson"),resultNode=panel.querySelector("#chatImportResult"),applyButton=panel.querySelector("#chatImportApply");let lastResult=null;
    panel.querySelector("#chatImportExample").onclick=()=>{input.value=JSON.stringify(currentExample(),null,2);lastResult=evaluate(input.value);renderEvaluation(lastResult,resultNode,applyButton);};
    panel.querySelector("#chatImportValidate").onclick=()=>{lastResult=evaluate(input.value);renderEvaluation(lastResult,resultNode,applyButton);};
    applyButton.onclick=()=>{try{lastResult=evaluate(input.value);renderEvaluation(lastResult,resultNode,applyButton);if(!lastResult.valid)throw new Error("Correggi gli errori prima del trasferimento.");applyImport(lastResult);}catch(error){resultNode.insertAdjacentHTML("afterbegin",`<div class="chat-import-state error">${esc(error.message)}</div>`);}};

    const generateButton=document.querySelector("#generate"),originalGenerate=generateButton.onclick;
    generateButton.onclick=function(){originalGenerate.call(generateButton);attachImportToProposal();};
    const resetButton=document.querySelector("#reset"),originalReset=resetButton.onclick;
    resetButton.onclick=function(){restorePresets();activeImport=null;document.querySelector("#chatImportSnapshot")?.remove();document.querySelector("#summary")?.removeAttribute("data-chat-imported");originalReset.call(resetButton);};
  }
  initialize().catch(error=>console.error("Importazione chat non disponibile:",error));
})();
