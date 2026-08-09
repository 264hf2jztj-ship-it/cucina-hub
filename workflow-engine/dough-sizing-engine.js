(function(global){
'use strict';

const VERSION=1;
const SHAPES={TRAY:'tray',ROUND:'round',MANUAL:'manual'};
const STYLE_DEFAULTS={
  roman_pan:{shape:SHAPES.TRAY,profile:'standard',loading_g_cm2:0.50,width_cm:30,length_cm:40,count:1,label:'Pizza in teglia romana'},
  focaccia:{shape:SHAPES.TRAY,profile:'standard',loading_g_cm2:0.70,width_cm:30,length_cm:40,count:1,label:'Focaccia'},
  neapolitan:{shape:SHAPES.ROUND,profile:'standard',loading_g_cm2:0.35,diameter_cm:30,count:1,label:'Pizza napoletana'},
  home_round:{shape:SHAPES.ROUND,profile:'standard',loading_g_cm2:0.38,diameter_cm:32,count:1,label:'Pizza tonda nel forno di casa'},
  bread:{shape:SHAPES.MANUAL,profile:'manual',loading_g_cm2:null,count:null,label:'Pane'}
};
const PROFILE_MULTIPLIERS={thin:0.86,standard:1,thick:1.18,custom:1};
const PROFILE_LABELS={thin:'Più sottile e croccante',standard:'Equilibrata',thick:'Più alta e morbida',custom:'Personalizzata',manual:'Quantità manuale'};

function finite(value,label){const number=Number(value);if(!Number.isFinite(number))throw new Error(`${label} non valido.`);return number}
function positive(value,label){const number=finite(value,label);if(number<=0)throw new Error(`${label} deve essere maggiore di zero.`);return number}
function round(value,decimals=1){const factor=Math.pow(10,decimals);return Math.round(value*factor)/factor}
function clamp(value,min,max){return Math.min(max,Math.max(min,value))}
function areaFor(options={}){
  const shape=options.shape;
  if(shape===SHAPES.TRAY){
    const width=positive(options.widthCm,'Larghezza teglia');
    const length=positive(options.lengthCm,'Lunghezza teglia');
    return round(width*length,1);
  }
  if(shape===SHAPES.ROUND){
    const diameter=positive(options.diameterCm,'Diametro');
    return round(Math.PI*Math.pow(diameter/2,2),1);
  }
  throw new Error('La superficie è disponibile soltanto per teglie e prodotti rotondi.');
}
function styleDefault(style){return JSON.parse(JSON.stringify(STYLE_DEFAULTS[style]||STYLE_DEFAULTS.bread))}
function loadingFor({style,profile='standard',customLoadingGcm2=null}={}){
  const defaults=styleDefault(style);
  if(defaults.shape===SHAPES.MANUAL)return null;
  if(profile==='custom')return round(positive(customLoadingGcm2,'Carico impasto'),3);
  const multiplier=PROFILE_MULTIPLIERS[profile];
  if(!multiplier)throw new Error('Profilo di spessore non supportato.');
  return round(defaults.loading_g_cm2*multiplier,3);
}
function calculate(options={}){
  const style=options.style||'roman_pan';
  const defaults=styleDefault(style);
  const shape=options.shape||defaults.shape;
  if(shape===SHAPES.MANUAL){
    const flour=positive(options.manualFlourG,'Farina totale');
    return{
      version:VERSION,style,style_label:defaults.label,shape,profile:'manual',profile_label:PROFILE_LABELS.manual,
      count:null,area_each_cm2:null,loading_g_cm2:null,portion_weight_g:null,total_dough_weight_g:null,manual_flour_g:round(flour,1),
      geometry:{width_cm:null,length_cm:null,diameter_cm:null},explanation:'Per il pane resta disponibile l’inserimento manuale della farina.'
    };
  }
  const count=Math.round(positive(options.count??defaults.count,'Numero di pezzi'));
  if(count>50)throw new Error('Il numero di pezzi non può superare 50.');
  const profile=options.profile||defaults.profile||'standard';
  const loading=loadingFor({style,profile,customLoadingGcm2:options.loadingGcm2});
  const geometry={
    width_cm:shape===SHAPES.TRAY?round(positive(options.widthCm??defaults.width_cm,'Larghezza teglia'),1):null,
    length_cm:shape===SHAPES.TRAY?round(positive(options.lengthCm??defaults.length_cm,'Lunghezza teglia'),1):null,
    diameter_cm:shape===SHAPES.ROUND?round(positive(options.diameterCm??defaults.diameter_cm,'Diametro'),1):null
  };
  const area=areaFor({shape,widthCm:geometry.width_cm,lengthCm:geometry.length_cm,diameterCm:geometry.diameter_cm});
  const portion=round(area*loading,1);
  const total=round(portion*count,1);
  const format=shape===SHAPES.TRAY?`${geometry.width_cm}×${geometry.length_cm} cm`:`Ø ${geometry.diameter_cm} cm`;
  return{
    version:VERSION,style,style_label:defaults.label,shape,profile,profile_label:PROFILE_LABELS[profile]||PROFILE_LABELS.custom,
    count,area_each_cm2:area,loading_g_cm2:loading,portion_weight_g:portion,total_dough_weight_g:total,manual_flour_g:null,geometry,
    explanation:`${count} ${shape===SHAPES.TRAY?(count===1?'teglia':'teglie'):(count===1?'panetto':'panetti')} ${format}: ${portion} g di impasto ciascuno, ${total} g totali.`
  };
}
function baseYeastPercent({stylePreset,hours,yeastType}){
  const available=Math.max(4,finite(hours,'Ore disponibili'));
  let percent=finite(stylePreset.base,'Percentuale base lievito')*(24/available);
  if(yeastType==='dry_yeast')percent*=0.4;
  if(yeastType==='sourdough')percent=Math.min(25,Math.max(10,15*(24/available)));
  return percent;
}
function temperatureYeastMultiplier(roomTemperatureC=22,referenceTemperatureC=22){
  const delta=finite(roomTemperatureC,'Temperatura ambiente')-finite(referenceTemperatureC,'Temperatura di riferimento');
  const rateFactor=Math.pow(2,delta/10);
  return clamp(Math.pow(rateFactor,-0.35),0.72,1.40);
}
function formulaFromTarget(options={}){
  const target=positive(options.totalDoughWeightG,'Peso totale impasto');
  const hydration=positive(options.hydrationPercent,'Idratazione');
  const salt=Math.max(0,finite(options.saltPercent,'Sale'));
  const yeastPct=Math.max(0,finite(options.yeastPercent,'Lievito'));
  const denominator=1+hydration/100+salt/100+yeastPct/100;
  const flour=target/denominator;
  const water=flour*hydration/100;
  const saltWeight=flour*salt/100;
  const yeast=flour*yeastPct/100;
  return{
    target_dough_weight_g:round(target,1),flour_weight_g:round(flour,1),water_weight_g:round(water,1),salt_weight_g:round(saltWeight,1),yeast_weight_g:round(yeast,2),
    hydration_percent:hydration,salt_percent:salt,effective_yeast_percent:round(yeastPct,4),calculated_dough_weight_g:round(flour+water+saltWeight+yeast,1),difference_g:round(flour+water+saltWeight+yeast-target,1)
  };
}
function deriveFormula(options={}){
  const basePct=baseYeastPercent({stylePreset:options.stylePreset,hours:options.hours,yeastType:options.yeastType});
  const multiplier=temperatureYeastMultiplier(options.roomTemperatureC??22,options.referenceTemperatureC??22);
  const effectivePct=basePct*multiplier;
  return{
    ...formulaFromTarget({totalDoughWeightG:options.totalDoughWeightG,hydrationPercent:options.hydrationPercent,saltPercent:options.saltPercent,yeastPercent:effectivePct}),
    base_yeast_percent:round(basePct,4),temperature_yeast_multiplier:round(multiplier,3)
  };
}
function validate(result){
  const errors=[];
  if(!result||result.version!==VERSION)errors.push('Calcolo formato assente o non supportato.');
  if(result?.shape!==SHAPES.MANUAL){
    if(!Number.isInteger(result?.count)||result.count<1)errors.push('Numero di pezzi non valido.');
    if(!(result?.portion_weight_g>0))errors.push('Peso del panetto non valido.');
    if(!(result?.total_dough_weight_g>0))errors.push('Peso totale impasto non valido.');
    if(!(result?.loading_g_cm2>0))errors.push('Carico impasto non valido.');
  }
  return{valid:errors.length===0,errors};
}

global.CucinaHubDoughSizingEngine={VERSION,SHAPES,STYLE_DEFAULTS,PROFILE_LABELS,styleDefault,loadingFor,areaFor,calculate,baseYeastPercent,temperatureYeastMultiplier,formulaFromTarget,deriveFormula,validate};
})(window);
