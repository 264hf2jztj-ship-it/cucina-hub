"use strict";

(() => {
  const extraFields=["cooking_method","cooking_profile","oil_weight_g","sugar_weight_g"];
  function waitFor(check,timeoutMs=12000){return new Promise((resolve,reject)=>{const started=Date.now();const timer=setInterval(()=>{try{const value=check();if(value){clearInterval(timer);resolve(value);}else if(Date.now()-started>timeoutMs){clearInterval(timer);reject(new Error("Elenco sessioni non pronto per gli impasti fritti."));}}catch(error){clearInterval(timer);reject(error);}},80);});}
  function esc(value){return String(value??"").replace(/[&<>\"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[char]);}
  function decorate(){
    if(typeof sessions==="undefined"||!Array.isArray(sessions))return;
    document.querySelectorAll("article.session").forEach(article=>{
      const link=article.querySelector('a[href*="guided-session.html?session="]');if(!link)return;
      const id=new URL(link.href).searchParams.get("session"),session=sessions.find(item=>item.id===id);
      if(!session||session.cooking_method!=="deep_fry"||article.dataset.friedReady==="1")return;
      const profile=session.cooking_profile||{},metrics=article.querySelector(".metrics");if(!metrics)return;
      metrics.insertAdjacentHTML("afterbegin",`<span class="metric">Frittura ${esc(profile.temperature_min_c??"—")}–${esc(profile.temperature_max_c??"—")} °C</span><span class="metric">${esc(profile.vessel_name||"Pentola per frittura")}</span><span class="metric">${esc(profile.oil_volume_ml??"—")} ml olio</span>`);
      article.dataset.friedReady="1";
    });
  }
  async function init(){
    await waitFor(()=>document.querySelector("#list")&&typeof duplicateFields!=="undefined"&&typeof sessions!=="undefined");
    extraFields.forEach(field=>{if(!duplicateFields.includes(field))duplicateFields.push(field);});
    const originalEdit=window.editSession;window.editSession=id=>{const session=sessions.find(item=>item.id===id),label=document.querySelector('label[for="editOvenTemp"]')||document.querySelector("#editOvenTemp")?.previousElementSibling;if(label)label.textContent=session?.cooking_method==="deep_fry"?"Temperatura olio (°C)":"Temperatura forno (°C)";return originalEdit(id);};
    decorate();new MutationObserver(decorate).observe(document.querySelector("#list"),{childList:true,subtree:true});
    window.CucinaHubFriedDoughSessionUI={decorate,fields:extraFields};
  }
  init().catch(error=>console.warn(error.message));
})();
