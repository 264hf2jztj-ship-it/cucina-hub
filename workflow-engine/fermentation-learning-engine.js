(function(global){
'use strict';

const VERSION=1;
const MIN_SESSIONS=2;

function numberOrNull(value){
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}
function average(values){
  const clean=values.map(numberOrNull).filter(value=>value!==null);
  return clean.length?clean.reduce((sum,value)=>sum+value,0)/clean.length:null;
}
function round(value,digits=1){
  if(value===null||value===undefined||!Number.isFinite(Number(value)))return null;
  return Number(Number(value).toFixed(digits));
}
function range(values){
  const clean=values.map(numberOrNull).filter(value=>value!==null);
  if(!clean.length)return null;
  return{min:Math.min(...clean),max:Math.max(...clean),average:average(clean),count:clean.length};
}
function contextOf(session){return session?.workflow_definition?.context||session?.context||{};}
function environmentOf(session,evaluation){
  const context=contextOf(session);
  return context.environment_snapshot||evaluation?.planned_snapshot?.environment_snapshot||null;
}
function flourBlendOf(session,evaluation){
  const context=contextOf(session);
  return context.flour_blend||evaluation?.planned_snapshot?.flour_blend||null;
}
function blendSignature(session,evaluation){
  const blend=flourBlendOf(session,evaluation);
  const components=blend?.components||blend?.flours||[];
  if(Array.isArray(components)&&components.length){
    return components.map(component=>{
      const profile=component.profile_snapshot||component.profile||{};
      const label=profile.name||component.name||component.flour_name||'Farina';
      const percent=numberOrNull(component.percentage??component.percent);
      return `${label}${percent!==null?` ${round(percent,1)}%`:''}`;
    }).join(' + ');
  }
  return session?.flour_name||evaluation?.planned_snapshot?.flour_name||null;
}
function actualTotalMinutes(session,evaluation){
  if(!evaluation)return null;
  const values=[
    evaluation.actual_bulk_minutes??session.bulk_fermentation_minutes,
    evaluation.actual_cold_minutes??session.cold_fermentation_minutes,
    evaluation.actual_proof_minutes??session.final_proof_minutes
  ].map(numberOrNull);
  if(values.every(value=>value===null))return null;
  return values.reduce((sum,value)=>sum+(value||0),0);
}
function plannedTotalMinutes(session){
  const values=[session.bulk_fermentation_minutes,session.cold_fermentation_minutes,session.final_proof_minutes].map(numberOrNull);
  if(values.every(value=>value===null))return null;
  return values.reduce((sum,value)=>sum+(value||0),0);
}
function normalizeRecord(session,evaluation){
  const environment=environmentOf(session,evaluation)||{};
  const rating=numberOrNull(evaluation?.overall_rating??session?.rating);
  return{
    id:session.id,
    title:session.title||'Sessione senza titolo',
    product_style:session.product_style||'Altro',
    completed_at:session.completed_at||session.updated_at||null,
    rating,
    fermentation_rating:numberOrNull(evaluation?.fermentation_rating),
    workability_rating:numberOrNull(evaluation?.workability_rating),
    structure_rating:numberOrNull(evaluation?.structure_rating),
    crispness_rating:numberOrNull(evaluation?.crispness_rating),
    softness_rating:numberOrNull(evaluation?.softness_rating),
    digestibility_rating:numberOrNull(evaluation?.digestibility_rating),
    fermentation_outcome:evaluation?.fermentation_outcome||null,
    would_repeat:typeof evaluation?.would_repeat==='boolean'?evaluation.would_repeat:null,
    hydration_percent:numberOrNull(session.hydration_percent??evaluation?.planned_snapshot?.hydration_percent),
    room_temperature_c:numberOrNull(environment.room_temperature_c),
    relative_humidity_percent:numberOrNull(environment.relative_humidity_percent),
    fridge_temperature_c:numberOrNull(environment.fridge_temperature_c),
    flour_signature:blendSignature(session,evaluation),
    actual_total_minutes:actualTotalMinutes(session,evaluation),
    planned_total_minutes:plannedTotalMinutes(session),
    proof_delta_minutes:evaluation?.actual_proof_minutes===null||evaluation?.actual_proof_minutes===undefined?null:numberOrNull(evaluation.actual_proof_minutes)-Number(session.final_proof_minutes||0),
    bulk_delta_minutes:evaluation?.actual_bulk_minutes===null||evaluation?.actual_bulk_minutes===undefined?null:numberOrNull(evaluation.actual_bulk_minutes)-Number(session.bulk_fermentation_minutes||0),
    cold_delta_minutes:evaluation?.actual_cold_minutes===null||evaluation?.actual_cold_minutes===undefined?null:numberOrNull(evaluation.actual_cold_minutes)-Number(session.cold_fermentation_minutes||0),
    evaluation_id:evaluation?.id||null
  };
}
function dataQuality(records){
  const fields=['rating','hydration_percent','room_temperature_c','relative_humidity_percent','flour_signature','actual_total_minutes'];
  const total=Math.max(1,records.length*fields.length);
  const present=records.reduce((sum,record)=>sum+fields.filter(field=>record[field]!==null&&record[field]!==undefined&&record[field]!=='').length,0);
  const score=Math.round(present/total*100);
  const missing=fields.map(field=>({field,count:records.filter(record=>record[field]===null||record[field]===undefined||record[field]==='').length})).filter(item=>item.count>0);
  return{score,missing};
}
function confidenceFor(count,qualityScore){
  if(count<MIN_SESSIONS)return{level:'insufficient',label:'Dati insufficienti'};
  if(count<=3||qualityScore<50)return{level:'low',label:'Bassa'};
  if(count<=7||qualityScore<75)return{level:'medium',label:'Media'};
  return{level:'high',label:'Alta'};
}
function frequency(values){
  const map=new Map();
  values.filter(Boolean).forEach(value=>map.set(value,(map.get(value)||0)+1));
  return[...map.entries()].sort((a,b)=>b[1]-a[1]).map(([value,count])=>({value,count}));
}
function metricComparison(records,key){
  const good=records.filter(record=>record.rating!==null&&record.rating>=4&&record[key]!==null);
  const other=records.filter(record=>record.rating!==null&&record.rating<4&&record[key]!==null);
  if(good.length<2||other.length<2)return null;
  const goodAverage=average(good.map(record=>record[key]));
  const otherAverage=average(other.map(record=>record[key]));
  return{good_count:good.length,other_count:other.length,good_average:round(goodAverage,1),other_average:round(otherAverage,1),difference:round(goodAverage-otherAverage,1)};
}
function addInsight(list,insight){if(insight&&insight.text)list.push(insight);}
function buildInsights(records,quality,confidence){
  const insights=[];
  if(records.length<MIN_SESSIONS){
    addInsight(insights,{kind:'data',title:'Servono altre prove',text:`Sono disponibili ${records.length} sessioni valutate. Il Learning inizierà a confrontare i risultati da ${MIN_SESSIONS} sessioni omogenee.`,evidence_count:records.length,confidence:'insufficient'});
    return insights;
  }

  const hydration=metricComparison(records,'hydration_percent');
  if(hydration&&Math.abs(hydration.difference)>=2){
    const direction=hydration.difference>0?'più alta':'più bassa';
    addInsight(insights,{kind:'pattern',title:'Idratazione associata ai risultati migliori',text:`Nello storico disponibile, le sessioni valutate almeno 4/5 hanno avuto un’idratazione media ${direction}: ${hydration.good_average}% contro ${hydration.other_average}%. È una correlazione osservata, non una causa dimostrata.`,evidence_count:hydration.good_count+hydration.other_count,confidence:confidence.level,metrics:hydration});
  }

  const room=metricComparison(records,'room_temperature_c');
  if(room&&Math.abs(room.difference)>=1.5){
    const direction=room.difference>0?'più caldo':'più fresco';
    addInsight(insights,{kind:'pattern',title:'Temperatura ambiente ricorrente',text:`Le prove con voto almeno 4/5 sono state eseguite mediamente in un ambiente ${direction}: ${room.good_average} °C contro ${room.other_average} °C. Considera il dato come associazione da verificare con altre sessioni.`,evidence_count:room.good_count+room.other_count,confidence:confidence.level,metrics:room});
  }

  const balanced=records.filter(record=>record.fermentation_outcome==='balanced');
  if(balanced.length>=2){
    const proofDelta=average(balanced.map(record=>record.proof_delta_minutes));
    if(proofDelta!==null&&Math.abs(proofDelta)>=10){
      addInsight(insights,{kind:'pattern',title:'Appretto reale nelle fermentazioni equilibrate',text:`Nelle ${balanced.length} sessioni giudicate equilibrate, l’appretto reale si è discostato in media di ${proofDelta>0?'+':''}${Math.round(proofDelta)} minuti dalla pianificazione. Può essere un buon punto di controllo per la prossima prova, senza applicare correzioni automatiche.`,evidence_count:balanced.length,confidence:confidence.level});
    }
  }

  const top=records.filter(record=>record.rating!==null&&record.rating>=4);
  const flourFrequency=frequency(top.map(record=>record.flour_signature));
  if(flourFrequency[0]?.count>=2){
    addInsight(insights,{kind:'pattern',title:'Farina o blend più ricorrente tra le prove migliori',text:`“${flourFrequency[0].value}” compare in ${flourFrequency[0].count} sessioni valutate almeno 4/5. Il dato descrive una ricorrenza personale e non dimostra che la farina sia l’unica causa del risultato.`,evidence_count:flourFrequency[0].count,confidence:confidence.level});
  }

  const repeatAnswers=records.filter(record=>record.would_repeat!==null);
  if(repeatAnswers.length>=2){
    const yes=repeatAnswers.filter(record=>record.would_repeat).length;
    addInsight(insights,{kind:'summary',title:'Disponibilità a ripetere la ricetta',text:`Hai indicato che rifaresti la prova uguale in ${yes} casi su ${repeatAnswers.length} (${Math.round(yes/repeatAnswers.length*100)}%).`,evidence_count:repeatAnswers.length,confidence:confidence.level});
  }

  const outcomes=frequency(records.map(record=>record.fermentation_outcome));
  if(outcomes.length&&outcomes[0].count>=2){
    const labels={balanced:'fermentazione equilibrata',underfermented:'impasto indietro',overfermented:'oltre fermentazione',uncertain:'esito incerto'};
    addInsight(insights,{kind:'summary',title:'Esito più frequente',text:`L’esito più registrato è “${labels[outcomes[0].value]||outcomes[0].value}” in ${outcomes[0].count} sessioni su ${records.length}.`,evidence_count:records.length,confidence:confidence.level});
  }

  if(!insights.length){
    addInsight(insights,{kind:'data',title:'Nessun pattern abbastanza stabile',text:'Le sessioni sono state analizzate, ma le differenze disponibili sono ancora piccole o i dati non sono abbastanza completi. Continua a registrare tempi reali, ambiente, farine e valutazioni.',evidence_count:records.length,confidence:confidence.level});
  }
  if(quality.score<60){
    addInsight(insights,{kind:'quality',title:'Qualità dei dati migliorabile',text:`Completezza stimata ${quality.score}%. Per confronti più affidabili registra soprattutto ambiente, tempi reali e profili farina.`,evidence_count:records.length,confidence:'low'});
  }
  return insights;
}
function bestConditions(records){
  const rated=records.filter(record=>record.rating!==null);
  if(!rated.length)return null;
  const maxRating=Math.max(...rated.map(record=>record.rating));
  const threshold=Math.max(4,maxRating-0.5);
  const best=rated.filter(record=>record.rating>=threshold);
  return{
    threshold,
    count:best.length,
    hydration:range(best.map(record=>record.hydration_percent)),
    room_temperature:range(best.map(record=>record.room_temperature_c)),
    humidity:range(best.map(record=>record.relative_humidity_percent)),
    fridge_temperature:range(best.map(record=>record.fridge_temperature_c)),
    actual_total_minutes:range(best.map(record=>record.actual_total_minutes)),
    common_flours:frequency(best.map(record=>record.flour_signature)).slice(0,3)
  };
}
function analyze(options={}){
  const sessions=Array.isArray(options.sessions)?options.sessions:[];
  const evaluationsInput=options.evaluations||{};
  const evaluations=Array.isArray(evaluationsInput)?Object.fromEntries(evaluationsInput.map(item=>[item.session_id,item])):evaluationsInput;
  const style=options.productStyle||'all';
  const allRecords=sessions.map(session=>normalizeRecord(session,evaluations[session.id])).filter(record=>record.evaluation_id||record.rating!==null);
  const records=style==='all'?allRecords:allRecords.filter(record=>record.product_style===style);
  const quality=dataQuality(records);
  const confidence=confidenceFor(records.length,quality.score);
  const ratings=records.map(record=>record.rating).filter(value=>value!==null);
  const styles=frequency(allRecords.map(record=>record.product_style));
  return{
    version:VERSION,
    generated_at:new Date().toISOString(),
    product_style:style,
    sample_count:records.length,
    available_styles:styles,
    confidence,
    data_quality:quality,
    averages:{
      overall_rating:round(average(ratings),2),
      fermentation_rating:round(average(records.map(record=>record.fermentation_rating)),2),
      workability_rating:round(average(records.map(record=>record.workability_rating)),2),
      structure_rating:round(average(records.map(record=>record.structure_rating)),2),
      crispness_rating:round(average(records.map(record=>record.crispness_rating)),2),
      softness_rating:round(average(records.map(record=>record.softness_rating)),2),
      digestibility_rating:round(average(records.map(record=>record.digestibility_rating)),2)
    },
    best_conditions:bestConditions(records),
    insights:buildInsights(records,quality,confidence),
    records:records.sort((a,b)=>new Date(b.completed_at||0)-new Date(a.completed_at||0)),
    methodology:{
      minimum_sessions:MIN_SESSIONS,
      statement:'Il motore descrive associazioni nello storico personale. Non dimostra causalità e non modifica automaticamente ricette o sessioni.'
    }
  };
}
function validate(result){
  const errors=[];
  if(!result||result.version!==VERSION)errors.push('Risultato Learning assente o non supportato.');
  if(!Number.isInteger(result?.sample_count)||result.sample_count<0)errors.push('Numero di sessioni non valido.');
  if(!result?.confidence?.level)errors.push('Livello di affidabilità mancante.');
  if(!Array.isArray(result?.insights))errors.push('Elenco insight mancante.');
  return{valid:errors.length===0,errors};
}

global.CucinaHubFermentationLearningEngine={analyze,validate,VERSION,MIN_SESSIONS};
})(window);
