(function(global){
'use strict';

const METRICS=['strength_w','pl_ratio','protein_percent','ash_percent','absorption_percent'];
const WHOLEGRAIN_TYPES=new Set(['1','2','wholemeal','farro','segale','multicereale']);
const DURUM_TYPES=new Set(['semola','semola_rimacinata']);

function numberOrNull(value){
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

function round(value,digits=2){
  const power=10**digits;
  return Math.round((Number(value)||0)*power)/power;
}

function profileLabel(profile){
  if(!profile)return 'Farina non disponibile';
  return [profile.brand,profile.name,profile.product_line].filter(Boolean).join(' · ')||'Farina senza nome';
}

function snapshotProfile(profile){
  if(!profile)return{};
  return{
    id:profile.id||null,
    name:profile.name||null,
    brand:profile.brand||null,
    product_line:profile.product_line||null,
    cereal:profile.cereal||null,
    flour_type:profile.flour_type||null,
    strength_w:numberOrNull(profile.strength_w),
    pl_ratio:numberOrNull(profile.pl_ratio),
    protein_percent:numberOrNull(profile.protein_percent),
    ash_percent:numberOrNull(profile.ash_percent),
    absorption_percent:numberOrNull(profile.absorption_percent),
    falling_number:numberOrNull(profile.falling_number),
    milling_method:profile.milling_method||null,
    is_malted:Boolean(profile.is_malted),
    contains_improvers:Boolean(profile.contains_improvers),
    recommended_uses:Array.isArray(profile.recommended_uses)?profile.recommended_uses:[],
    notes:profile.notes||null
  };
}

function weightedMetric(components,key){
  let weighted=0,coverage=0;
  components.forEach(component=>{
    const value=numberOrNull(component.profile?.[key]);
    if(value===null)return;
    weighted+=value*component.percentage;
    coverage+=component.percentage;
  });
  return{
    value:coverage?round(weighted/coverage,key==='pl_ratio'||key==='ash_percent'?3:2):null,
    coverage_percent:round(coverage,2)
  };
}

function build(options={}){
  const totalFlourG=numberOrNull(options.totalFlourG);
  if(totalFlourG===null||totalFlourG<=0)throw new Error('La farina totale deve essere maggiore di zero.');
  const raw=Array.isArray(options.components)?options.components:[];
  if(!raw.length)throw new Error('Aggiungi almeno una farina al blend.');

  const seenProfiles=new Set();
  const components=raw.map((item,index)=>{
    const percentage=numberOrNull(item.percentage);
    if(!item.profile?.id)throw new Error(`Seleziona la farina per il componente ${index+1}.`);
    if(seenProfiles.has(item.profile.id))throw new Error(`${profileLabel(item.profile)} è presente più volte. Ogni profilo farina può comparire una sola volta nel blend.`);
    seenProfiles.add(item.profile.id);
    if(percentage===null||percentage<=0||percentage>100)throw new Error(`Percentuale non valida per ${profileLabel(item.profile)}.`);
    return{
      flour_profile_id:item.profile.id,
      profile:item.profile,
      snapshot:snapshotProfile(item.profile),
      percentage:round(percentage,3),
      weight_g:round(totalFlourG*percentage/100,2),
      sort_order:index,
      notes:item.notes||null
    };
  });

  const percentageTotal=round(components.reduce((sum,item)=>sum+item.percentage,0),3);
  if(Math.abs(percentageTotal-100)>0.05)throw new Error(`Le percentuali del blend devono totalizzare 100%. Totale attuale: ${percentageTotal}%.`);

  const metrics={};
  METRICS.forEach(key=>{metrics[key]=weightedMetric(components,key)});

  const wholegrainPercent=round(components.reduce((sum,item)=>sum+(WHOLEGRAIN_TYPES.has(item.profile.flour_type)?item.percentage:0),0),2);
  const durumPercent=round(components.reduce((sum,item)=>sum+((item.profile.cereal==='durum_wheat'||DURUM_TYPES.has(item.profile.flour_type))?item.percentage:0),0),2);
  const stoneMilledPercent=round(components.reduce((sum,item)=>sum+(item.profile.milling_method==='stone'?item.percentage:0),0),2);
  const improverPercent=round(components.reduce((sum,item)=>sum+(item.profile.contains_improvers?item.percentage:0),0),2);

  const labels=components.map(item=>`${item.percentage}% ${profileLabel(item.profile)}`);
  const observations=[];
  if(wholegrainPercent>0)observations.push(`${wholegrainPercent}% di farine tipo 1/2, integrali o cereali rustici.`);
  if(durumPercent>0)observations.push(`${durumPercent}% di grano duro o semola.`);
  if(stoneMilledPercent>0)observations.push(`${stoneMilledPercent}% di farine dichiarate macinate a pietra.`);
  if(improverPercent>0)observations.push(`${improverPercent}% del blend dichiara miglioratori.`);
  if(metrics.strength_w.value!==null)observations.push(`Forza media ponderata indicativa: W ${Math.round(metrics.strength_w.value)} (${metrics.strength_w.coverage_percent}% del blend con dato disponibile).`);
  if(metrics.absorption_percent.value!==null)observations.push(`Assorbimento medio dichiarato/testato: ${metrics.absorption_percent.value}% (${metrics.absorption_percent.coverage_percent}% di copertura).`);

  return{
    version:1,
    total_flour_g:round(totalFlourG,2),
    percentage_total:percentageTotal,
    label:labels.join(' + '),
    components,
    metrics,
    composition:{
      wholegrain_percent:wholegrainPercent,
      durum_percent:durumPercent,
      stone_milled_percent:stoneMilledPercent,
      improver_percent:improverPercent
    },
    observations,
    note:'Il profilo del blend viene salvato come snapshot. In questa versione non modifica automaticamente idratazione, lievito o timeline.'
  };
}

function validate(blend){
  const errors=[];
  if(!blend||!Array.isArray(blend.components)||blend.components.length===0)errors.push('Blend senza componenti.');
  if(Math.abs(Number(blend?.percentage_total)-100)>0.05)errors.push('Il blend non totalizza 100%.');
  if(Number(blend?.total_flour_g)<=0)errors.push('Peso totale farina non valido.');
  const profileIds=(blend?.components||[]).map(item=>item.flour_profile_id).filter(Boolean);
  if(new Set(profileIds).size!==profileIds.length)errors.push('Uno stesso profilo farina è presente più volte nel blend.');
  const componentWeight=(blend?.components||[]).reduce((sum,item)=>sum+Number(item.weight_g||0),0);
  if(Math.abs(componentWeight-Number(blend?.total_flour_g||0))>0.2)errors.push('La somma dei pesi delle farine non coincide con il totale.');
  return{valid:errors.length===0,errors};
}

function sessionRows(blend,{ownerUserId,sessionId}={}){
  const validation=validate(blend);
  if(!validation.valid)throw new Error(validation.errors.join(' '));
  if(!ownerUserId||!sessionId)throw new Error('Owner e sessione sono obbligatori per salvare il blend.');
  return blend.components.map(component=>({
    owner_user_id:ownerUserId,
    session_id:sessionId,
    flour_profile_id:component.flour_profile_id,
    flour_profile_snapshot:component.snapshot,
    percentage:component.percentage,
    weight_g:component.weight_g,
    sort_order:component.sort_order,
    notes:component.notes
  }));
}

global.CucinaHubFlourBlendEngine={
  build,validate,sessionRows,snapshotProfile,profileLabel
};
})(window);
