"use strict";

(() => {
  function waitFor(check,timeoutMs=15000){return new Promise((resolve,reject)=>{const started=Date.now();const timer=setInterval(()=>{try{const value=check();if(value){clearInterval(timer);resolve(value);}else if(Date.now()-started>timeoutMs){clearInterval(timer);reject(new Error("Importazione chat non pronta per l’esempio pizzonde."));}}catch(error){clearInterval(timer);reject(error);}},80);});}
  async function init(){
    await waitFor(()=>document.querySelector("#chatRecipeImport")&&document.querySelector("#chatRecipeJson")&&document.querySelector("#chatImportValidate")&&window.CucinaHubChatRecipeImportEngine?.buildFriedExample&&typeof environments!=="undefined"&&typeof flourProfiles!=="undefined");
    if(document.querySelector("#chatImportFriedExample"))return;
    const button=document.createElement("button");button.id="chatImportFriedExample";button.type="button";button.className="chat-import-example";button.textContent="CARICA ESEMPIO PIZZONDE";
    document.querySelector("#chatImportExample")?.insertAdjacentElement("afterend",button);
    button.onclick=()=>{
      const targetNode=document.querySelector("#targetMeal"),target=targetNode?.value?new Date(targetNode.value):new Date(Date.now()+8*3600000);
      const packet=window.CucinaHubChatRecipeImportEngine.buildFriedExample(target);
      const environment=environments.find(item=>item.is_default)||environments[0],flour=flourProfiles.find(item=>item.is_default)||flourProfiles[0];
      if(environment)packet.environment={profile_id:environment.id,profile_name:environment.name};
      if(flour)packet.flours=[{profile_id:flour.id,label:window.CucinaHubChatRecipeImportEngine.profileLabel(flour),percentage:100}];
      document.querySelector("#chatRecipeJson").value=JSON.stringify(packet,null,2);
      document.querySelector("#chatImportValidate").click();
    };
  }
  init().catch(error=>console.warn(error.message));
})();
