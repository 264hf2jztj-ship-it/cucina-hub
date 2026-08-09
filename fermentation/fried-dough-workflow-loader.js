"use strict";

(() => {
  function waitForBase(timeoutMs=15000){return new Promise((resolve,reject)=>{const started=Date.now();const timer=setInterval(()=>{if(window.CucinaHubSessionWorkflowBuilder?.build){clearInterval(timer);resolve();}else if(Date.now()-started>timeoutMs){clearInterval(timer);reject(new Error("Motore workflow base non disponibile."));}},80);});}
  async function init(){
    await waitForBase();
    if(window.CucinaHubSessionWorkflowBuilder?.buildFried)return;
    await new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="../workflow-engine/fried-dough-workflow-builder.js?v=1";script.async=false;script.onload=resolve;script.onerror=()=>reject(new Error("Motore workflow impasti fritti non disponibile."));document.head.appendChild(script);});
  }
  init().catch(error=>console.error(error.message));
})();
