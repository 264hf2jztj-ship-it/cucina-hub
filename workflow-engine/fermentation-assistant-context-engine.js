(function(global){
'use strict';

const VERSION=1;
const STYLE_LABELS={
  roman_pan:'Pizza in teglia romana',
  neapolitan:'Pizza napoletana',
  home_round:'Pizza tonda nel forno di casa',
  focaccia:'Focaccia',
  bread:'Pane'
};
const GOAL_LABELS={
  balanced:'Risultato equilibrato',
  airy:'Più alveolato e leggero',
  crispy:'Più croccante',
  soft:'Più morbido',
  digestible:'Più digeribile',
  easy:'Più facile da gestire'
};

function text(value){return String(value??'').trim();}
function numberOrNull(value){
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}
function cleanObject(value){
  if(Array.isArray(value))return value.map(cleanObject);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined).map(([key,item])=>[key,cleanObject(item)]));
}
function environmentSnapshot(profile){
  if(!profile)return null;
  return cleanObject({
    id:profile.id||null,
    name:profile.name||null,
    location_label:profile.location_label||null,
    season:profile.season||null,
    room_temperature_c:numberOrNull(profile.room_temperature_c),
    relative_humidity_percent:numberOrNull(profile.relative_humidity_percent),
    fridge_temperature_c:numberOrNull(profile.fridge_temperature_c),
    notes:profile.notes||null,
    source:'personal_laboratory_profile'
  });
}
function flourSnapshot(profile){
  return cleanObject({
    id:profile.id||null,
    label:[profile.brand,profile.name,profile.product_line].filter(Boolean).join(' · ')||profile.name||'Farina',
    brand:profile.brand||null,
    name:profile.name||null,
    product_line:profile.product_line||null,
    cereal:profile.cereal||null,
    flour_type:profile.flour_type||null,
    strength_w:numberOrNull(profile.strength_w),
    pl_ratio:numberOrNull(profile.pl_ratio),
    protein_percent:numberOrNull(profile.protein_percent),
    ash_percent:numberOrNull(profile.ash_percent),
    absorption_percent:numberOrNull(profile.absorption_percent),
    milling_method:profile.milling_method||null,
    is_malted:Boolean(profile.is_malted),
    contains_improvers:Boolean(profile.contains_improvers),
    recommended_uses:Array.isArray(profile.recommended_uses)?profile.recommended_uses:[],
    package_notes:profile.package_notes||null,
    personal_notes:profile.notes||null,
    source:'personal_flour_profile'
  });
}
function learningSnapshot(learning){
  if(!learning)return{
    available:false,
    sample_count:0,
    confidence:{level:'insufficient',label:'Dati insufficienti'},
    data_quality:null,
    best_conditions:null,
    insights:[],
    source:'personal_learning'
  };
  return cleanObject({
    available:Number(learning.sample_count||0)>0,
    sample_count:Number(learning.sample_count||0),
    confidence:learning.confidence||{level:'insufficient',label:'Dati insufficienti'},
    data_quality:learning.data_quality||null,
    best_conditions:learning.best_conditions||null,
    insights:(learning.insights||[]).map(item=>({
      title:item.title,
      text:item.text,
      confidence:item.confidence,
      evidence_count:item.evidence_count
    })),
    methodology:learning.methodology||null,
    source:'personal_learning'
  });
}
function buildWarnings(input,environment,flours,learning){
  const warnings=[];
  if(!text(input.product_style))warnings.push('Seleziona il tipo di preparazione.');
  if(!text(input.result_goal))warnings.push('Indica il risultato desiderato.');
  if(!environment)warnings.push('Nessun profilo ambiente selezionato: l’AI dovrà usare ipotesi esplicite.');
  if(!flours.length)warnings.push('Nessuna farina selezionata: l’AI non può personalizzare la proposta sui prodotti disponibili.');
  if(!input.target_meal_at)warnings.push('Orario del pasto non indicato: la timeline non potrà essere calcolata a ritroso.');
  if(Number(learning.sample_count||0)<2)warnings.push('Learning personale insufficiente: non usare la singola prova come regola.');
  return warnings;
}
function buildSources(environment,flours,learning){
  return [
    {
      id:'laboratory.environment',
      label:'Profilo ambiente personale',
      type:'personal_data',
      status:environment?'available':'missing',
      usage:'Temperatura, umidità e frigorifero'
    },
    {
      id:'laboratory.flours',
      label:'Profili farina personali',
      type:'personal_data',
      status:flours.length?'available':'missing',
      usage:'Scelta della farina, blend e limiti tecnici'
    },
    {
      id:'laboratory.learning',
      label:'Learning delle sessioni reali',
      type:'personal_learning',
      status:Number(learning.sample_count||0)>=2?'available':'insufficient',
      usage:'Pattern personali con affidabilità dichiarata'
    },
    {
      id:'library.sources',
      label:'Fonti della Biblioteca',
      type:'library_knowledge',
      status:'not_connected_in_this_step',
      usage:'Tecniche e ricette documentate; collegamento previsto nel sottostep RAG'
    }
  ];
}
function buildRequest(options={}){
  const input=options.input||{};
  const environment=environmentSnapshot(options.environment||null);
  const flours=(Array.isArray(options.flours)?options.flours:[]).map(flourSnapshot);
  const learning=learningSnapshot(options.learning||null);
  const warnings=buildWarnings(input,environment,flours,learning);
  const requiredReady=Boolean(text(input.product_style)&&text(input.result_goal)&&environment&&flours.length);
  const packet=cleanObject({
    schema:'cucina-hub.fermentation-assistant.request',
    version:VERSION,
    generated_at:new Date().toISOString(),
    task:{
      kind:'create_fermentation_proposal',
      mode:'preview_only',
      request_type:text(input.request_type)||'new_recipe'
    },
    goal:{
      product_style:text(input.product_style),
      product_label:STYLE_LABELS[text(input.product_style)]||text(input.product_style),
      result_goal:text(input.result_goal),
      result_goal_label:GOAL_LABELS[text(input.result_goal)]||text(input.result_goal),
      notes:text(input.goal_notes)||null
    },
    format:{
      shape:text(input.shape)||null,
      portion_count:numberOrNull(input.portion_count),
      tray_width_cm:numberOrNull(input.tray_width_cm),
      tray_length_cm:numberOrNull(input.tray_length_cm),
      round_diameter_cm:numberOrNull(input.round_diameter_cm)
    },
    constraints:{
      target_meal_at:input.target_meal_at||null,
      oven_type:text(input.oven_type)||null,
      maximum_active_minutes:numberOrNull(input.maximum_active_minutes),
      hydration_preference:numberOrNull(input.hydration_preference),
      additional_constraints:text(input.constraints)||null
    },
    personal_context:{
      environment,
      available_flours:flours,
      learning
    },
    sources:buildSources(environment,flours,learning),
    output_contract:{
      sections:['ingredients','dough_sizing','timeline','process','explanations','sources','uncertainties'],
      ingredient_units:'grams',
      timeline_direction:'backward_from_target_meal',
      explain_each_adjustment:true,
      cite_source_ids:true,
      mark_observation_vs_inference:true,
      include_confidence:true,
      requires_user_confirmation:true
    },
    guardrails:{
      preview_only:true,
      automatic_writes:false,
      automatic_recipe_changes:false,
      automatic_session_creation:false,
      requires_user_confirmation:true,
      preserve_original_sources:true,
      do_not_present_learning_as_causality:true
    },
    readiness:{
      level:requiredReady?'ready':'partial',
      warnings
    }
  });
  return packet;
}
function buildPrompt(packet){
  const sourceLines=packet.sources.map(source=>`- [${source.id}] ${source.label}: ${source.status}; uso previsto: ${source.usage}.`).join('\n');
  return [
    'Sei AI Fermentation Assistant di Cucina Hub.',
    'Prepara una proposta tecnica in anteprima usando prima i dati personali disponibili.',
    'Non creare, aggiornare o salvare ricette e sessioni. Qualsiasi applicazione richiede conferma esplicita dell’utente.',
    'Distingui sempre dati osservati, informazioni delle fonti e inferenze. Non presentare correlazioni del Learning come causalità.',
    '',
    `Preparazione: ${packet.goal.product_label}.`,
    `Obiettivo: ${packet.goal.result_goal_label}.`,
    `Orario desiderato: ${packet.constraints.target_meal_at||'non indicato'}.`,
    `Forno: ${packet.constraints.oven_type||'non indicato'}.`,
    '',
    'Fonti e provenienza:',
    sourceLines,
    '',
    'Restituisci: ingredienti in grammi, dimensionamento dell’impasto, timeline a ritroso, procedimento, spiegazione di ogni scelta, fonti usate, incertezze e livello di confidenza.',
    'Concludi chiedendo conferma prima di applicare la proposta.',
    '',
    'CONTESTO STRUTTURATO:',
    JSON.stringify(packet,null,2)
  ].join('\n');
}
function validate(packet){
  const errors=[];
  if(!packet||packet.schema!=='cucina-hub.fermentation-assistant.request')errors.push('Schema richiesta non valido.');
  if(packet?.version!==VERSION)errors.push('Versione richiesta non supportata.');
  if(packet?.task?.mode!=='preview_only')errors.push('La richiesta deve restare in anteprima.');
  if(packet?.guardrails?.automatic_writes!==false)errors.push('Le scritture automatiche devono essere disattivate.');
  if(packet?.guardrails?.requires_user_confirmation!==true)errors.push('La conferma utente è obbligatoria.');
  if(!Array.isArray(packet?.sources))errors.push('Manifesto fonti mancante.');
  if(!Array.isArray(packet?.readiness?.warnings))errors.push('Avvisi di completezza mancanti.');
  return{valid:errors.length===0,errors};
}

global.CucinaHubFermentationAssistantContextEngine={
  VERSION,
  STYLE_LABELS,
  GOAL_LABELS,
  buildRequest,
  buildPrompt,
  validate
};
})(window);
