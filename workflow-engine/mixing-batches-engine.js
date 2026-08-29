(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.CucinaHubMixingBatchesEngine=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';

  const VERSION=1;
  const DEFAULT_APPLIANCE_ID='impastatrice-dcg-km1401r';
  const APPLIANCE_PROFILES={
    [DEFAULT_APPLIANCE_ID]:{
      id:DEFAULT_APPLIANCE_ID,
      label:'Impastatrice DCG KM1401R',
      bowl_capacity_l:4,
      max_flour_per_batch_g:500,
      max_batches:20
    }
  };

  function positiveNumber(value,label){
    const number=Number(value);
    if(!Number.isFinite(number)||number<=0)throw new Error(`${label} deve essere maggiore di zero.`);
    return number;
  }

  function positiveInteger(value,fallback=1){
    const number=Number(value);
    if(!Number.isFinite(number)||number<1)return fallback;
    return Math.max(1,Math.round(number));
  }

  function applianceProfile(applianceId=DEFAULT_APPLIANCE_ID){
    const profile=APPLIANCE_PROFILES[applianceId];
    if(!profile)throw new Error('Profilo impastatrice non supportato.');
    return {...profile};
  }

  function calculate(options={}){
    const profile=applianceProfile(options.applianceId);
    const flourWeightG=positiveNumber(options.flourWeightG,'Farina totale');
    const maxFlourPerBatchG=positiveNumber(options.maxFlourPerBatchG??profile.max_flour_per_batch_g,'Capacità per lavorazione');
    const requestedBatches=positiveInteger(options.requestedBatches,1);
    const requiredBatches=Math.ceil(flourWeightG/maxFlourPerBatchG);
    const mixingBatches=Math.max(requestedBatches,requiredBatches);

    if(mixingBatches>profile.max_batches)throw new Error(`La quantità richiede più di ${profile.max_batches} lavorazioni separate.`);

    const flourPerBatchG=Math.ceil(flourWeightG/mixingBatches*10)/10;
    return{
      version:VERSION,
      appliance_id:profile.id,
      appliance_label:profile.label,
      bowl_capacity_l:profile.bowl_capacity_l,
      max_flour_per_batch_g:maxFlourPerBatchG,
      flour_weight_g:flourWeightG,
      requested_batches:requestedBatches,
      required_batches:requiredBatches,
      mixing_batches:mixingBatches,
      flour_per_batch_g:flourPerBatchG,
      capacity_adjusted:mixingBatches>requestedBatches,
      explanation:`${mixingBatches} ${mixingBatches===1?'lavorazione':'lavorazioni'}: circa ${flourPerBatchG.toFixed(1)} g di farina per impasto, entro il limite operativo di ${maxFlourPerBatchG} g.`
    };
  }

  return{VERSION,DEFAULT_APPLIANCE_ID,APPLIANCE_PROFILES,applianceProfile,calculate};
});
