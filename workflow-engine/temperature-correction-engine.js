(function(global){
'use strict';

const DEFAULT_REFERENCE_C=22;

function clamp(value,min,max){return Math.min(max,Math.max(min,value))}
function finiteNumber(value,label){const number=Number(value);if(!Number.isFinite(number))throw new Error(`${label} non valido.`);return number}
function roundTo(value,step){return Math.round(value/step)*step}
function roundYeast(value,type){
  const step=type==='dry_yeast'?0.01:type==='sourdough'?1:0.1;
  return +roundTo(value,step).toFixed(type==='dry_yeast'?2:type==='sourdough'?0:1);
}
function level(delta){
  if(Math.abs(delta)<0.5)return'reference';
  if(delta>=6)return'very_warm';
  if(delta>=2)return'warm';
  if(delta<=-6)return'very_cold';
  if(delta<=-2)return'cold';
  return'near_reference';
}
function labelForLevel(value){
  return{
    very_warm:'ambiente molto caldo',warm:'ambiente caldo',cold:'ambiente fresco',very_cold:'ambiente molto freddo',near_reference:'ambiente vicino al riferimento',reference:'temperatura di riferimento'
  }[value]||'ambiente rilevato';
}

function calculate(options={}){
  const room=finiteNumber(options.roomTemperatureC??DEFAULT_REFERENCE_C,'Temperatura ambiente');
  const reference=finiteNumber(options.referenceTemperatureC??DEFAULT_REFERENCE_C,'Temperatura di riferimento');
  const bulk=Math.max(1,finiteNumber(options.bulkMinutes,'Durata puntata'));
  const proof=Math.max(1,finiteNumber(options.proofMinutes,'Durata appretto'));
  const yeast=Math.max(0,finiteNumber(options.yeastWeightG,'Quantità di lievito'));
  const yeastType=options.yeastType||'fresh_yeast';
  const delta=room-reference;

  // Modello prudenziale Q10: circa raddoppio della velocità fermentativa ogni +10 °C.
  // La correzione viene divisa tra tempi (65%) e lievito (35%) per evitare variazioni eccessive su un solo parametro.
  const rateFactor=Math.pow(2,delta/10);
  const timeMultiplier=clamp(Math.pow(rateFactor,-0.65),0.62,1.65);
  const yeastMultiplier=clamp(Math.pow(rateFactor,-0.35),0.72,1.40);

  const correctedBulk=Math.max(45,roundTo(bulk*timeMultiplier,5));
  const correctedProof=Math.max(60,roundTo(proof*timeMultiplier,5));
  const correctedYeast=roundYeast(yeast*yeastMultiplier,yeastType);
  const classification=level(delta);
  const warmer=delta>0.5;
  const colder=delta<-0.5;
  const warnings=[];
  if(room>=30)warnings.push('Con almeno 30 °C controlla l’impasto prima dei timer: la fermentazione può accelerare molto.');
  if(room<=16)warnings.push('Con 16 °C o meno i tempi sono indicativi: valuta un ambiente più tiepido o una fermentazione più lunga.');

  let explanation='La temperatura coincide con il riferimento di 22 °C: tempi e lievito restano invariati.';
  if(warmer)explanation=`A ${room.toFixed(1)} °C la fermentazione è prevista più rapida rispetto a ${reference.toFixed(1)} °C: Cucina Hub riduce in modo prudenziale sia i tempi a temperatura ambiente sia il lievito.`;
  if(colder)explanation=`A ${room.toFixed(1)} °C la fermentazione è prevista più lenta rispetto a ${reference.toFixed(1)} °C: Cucina Hub aumenta in modo prudenziale sia i tempi a temperatura ambiente sia il lievito.`;

  return{
    version:1,
    model:'q10_split_65_35',
    reference_temperature_c:+reference.toFixed(1),
    room_temperature_c:+room.toFixed(1),
    temperature_delta_c:+delta.toFixed(1),
    classification,
    classification_label:labelForLevel(classification),
    rate_factor:+rateFactor.toFixed(3),
    time_multiplier:+timeMultiplier.toFixed(3),
    yeast_multiplier:+yeastMultiplier.toFixed(3),
    baseline:{bulk_minutes:bulk,proof_minutes:proof,yeast_weight_g:yeast},
    corrected:{bulk_minutes:correctedBulk,proof_minutes:correctedProof,yeast_weight_g:correctedYeast},
    changes:{
      bulk_minutes:correctedBulk-bulk,
      proof_minutes:correctedProof-proof,
      yeast_weight_g:+(correctedYeast-yeast).toFixed(2)
    },
    explanation,
    warnings,
    cold_fermentation_adjusted:false,
    note:'La fermentazione in frigorifero non è corretta in questo step.'
  };
}

function validate(result){
  const errors=[];
  if(!result||result.version!==1)errors.push('Risultato di correzione assente o non supportato.');
  if(!result?.corrected||result.corrected.bulk_minutes<=0||result.corrected.proof_minutes<=0)errors.push('Durate corrette non valide.');
  if(result?.corrected?.yeast_weight_g<0)errors.push('Quantità di lievito corretta non valida.');
  return{valid:errors.length===0,errors};
}

global.CucinaHubTemperatureCorrectionEngine={calculate,validate,DEFAULT_REFERENCE_C};
})(window);
