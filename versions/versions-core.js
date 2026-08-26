(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.CucinaHubVersionsCore=api;})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  function clean(value,max=3000){const text=String(value??"").trim();return text?text.slice(0,max):null;}
  function recipeVersions(versions=[],recipeId){return versions.filter(item=>item.recipe_id===recipeId).sort((a,b)=>b.version_number-a.version_number);}
  function promotable(experiments=[],versions=[],recipeId){const used=new Set(versions.map(item=>item.source_experiment_id).filter(Boolean));return experiments.filter(item=>item.recipe_id===recipeId&&item.status==="completed"&&item.outcome==="improved"&&!used.has(item.id));}
  function promotionPayload(input={}){const experimentId=clean(input.experiment_id,80);if(!experimentId)throw new Error("Seleziona un esperimento migliorato.");return{p_experiment_id:experimentId,p_label:clean(input.label,180),p_change_summary:clean(input.change_summary,3000)};}
  function snapshotSummary(snapshot={}){const recipe=snapshot.recipe||{},changes=Array.isArray(snapshot.applied_changes)?snapshot.applied_changes:[];return{title:recipe.title||"Ricetta",status:recipe.status||"—",ingredients:Array.isArray(snapshot.ingredients)?snapshot.ingredients.length:0,instructions:Array.isArray(recipe.instructions)?recipe.instructions.length:0,appliances:Array.isArray(snapshot.appliances)?snapshot.appliances.length:0,changes};}
  function metrics(versions=[],currentVersionId=null,pending=0){return{total:versions.length,current:versions.find(item=>item.id===currentVersionId)?.version_number||0,pending};}
  return{clean,recipeVersions,promotable,promotionPayload,snapshotSummary,metrics};
});
