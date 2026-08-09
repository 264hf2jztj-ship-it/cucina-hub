(function(global){
'use strict';

const SCHEMA='cucina-hub.chat-recipe';
const VERSION=1;
const PRODUCT_STYLES=['roman_pan','neapolitan','home_round','focaccia','bread'];
const SHAPES=['tray','round','manual'];
const YEAST_TYPES=['fresh_yeast','dry_yeast'];
const OVEN_TYPES=['samsung_oven','weber_kettle','air_fryer','other'];
const GUIDANCE_MODES=['beginner','expert'];
const SIZING_PROFILES=['thin','standard','thick','custom'];
const STYLE_SHAPE={roman_pan:'tray',focaccia:'tray',neapolitan:'round',home_round:'round',bread:'manual'};

function text(value){return String(value??'').trim();}
function numberOrNull(value){
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}
function stringArray(value){
  return Array.isArray(value)?value.map(text).filter(Boolean):[];
}
function stripCodeFence(input){
  const raw=text(input);
  if(!raw.startsWith('```'))return raw;
  return raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
}
function parse(input){
  if(input&&typeof input==='object')return input;
  const raw=stripCodeFence(input);
  if(!raw)throw new Error('Incolla il pacchetto JSON preparato nella chat.');
  try{return JSON.parse(raw);}catch(error){throw new Error('Il testo incollato non è un JSON valido.');}
}
function cleanObject(value){
  if(Array.isArray(value))return value.map(cleanObject);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined).map(([key,item])=>[key,cleanObject(item)]));
}
function normalize(input){
  const value=parse(input);
  return cleanObject({
    schema:text(value.schema),
    version:numberOrNull(value.version),
    created_at:text(value.created_at)||null,
    created_in:text(value.created_in)||'chat_project_cucina',
    recipe:{
      title:text(value.recipe?.title),
      product_style:text(value.recipe?.product_style),
      goal:text(value.recipe?.goal)||null,
      source_note:text(value.recipe?.source_note)||null
    },
    format:{
      shape:text(value.format?.shape),
      count:numberOrNull(value.format?.count),
      tray_width_cm:numberOrNull(value.format?.tray_width_cm),
      tray_length_cm:numberOrNull(value.format?.tray_length_cm),
      round_diameter_cm:numberOrNull(value.format?.round_diameter_cm),
      manual_flour_g:numberOrNull(value.format?.manual_flour_g),
      sizing_profile:text(value.format?.sizing_profile)||'standard',
      dough_loading_g_cm2:numberOrNull(value.format?.dough_loading_g_cm2)
    },
    formula:{
      hydration_percent:numberOrNull(value.formula?.hydration_percent),
      salt_percent:numberOrNull(value.formula?.salt_percent),
      yeast_type:text(value.formula?.yeast_type),
      base_yeast_percent_24h:numberOrNull(value.formula?.base_yeast_percent_24h)
    },
    fermentation:{
      bulk_minutes:numberOrNull(value.fermentation?.bulk_minutes),
      proof_minutes:numberOrNull(value.fermentation?.proof_minutes),
      cold_strategy:text(value.fermentation?.cold_strategy)||'auto_fit_to_target'
    },
    cooking:{
      oven_type:text(value.cooking?.oven_type),
      ideal_temperature_c:numberOrNull(value.cooking?.ideal_temperature_c),
      bake_minutes:numberOrNull(value.cooking?.bake_minutes),
      notes:stringArray(value.cooking?.notes)
    },
    target:{
      meal_at:text(value.target?.meal_at)||null,
      guidance_mode:text(value.target?.guidance_mode)||'beginner'
    },
    environment:{
      profile_id:text(value.environment?.profile_id)||null,
      profile_name:text(value.environment?.profile_name)||null
    },
    flours:(Array.isArray(value.flours)?value.flours:[]).map(item=>({
      profile_id:text(item?.profile_id)||null,
      label:text(item?.label)||null,
      percentage:numberOrNull(item?.percentage)
    })),
    process:stringArray(value.process),
    notes:stringArray(value.notes),
    assumptions:stringArray(value.assumptions),
    guardrails:{
      preview_only:value.guardrails?.preview_only,
      automatic_save:value.guardrails?.automatic_save,
      requires_user_confirmation:value.guardrails?.requires_user_confirmation
    }
  });
}
function issue(code,path,message,severity='error'){return{code,path,message,severity};}
function inRange(value,min,max){return value!==null&&value>=min&&value<=max;}
function validate(input,options={}){
  let packet;
  try{packet=normalize(input);}catch(error){return{valid:false,packet:null,errors:[issue('invalid_json','$',error.message)],warnings:[]};}
  const issues=[];
  if(packet.schema!==SCHEMA)issues.push(issue('schema','schema',`Schema richiesto: ${SCHEMA}.`));
  if(packet.version!==VERSION)issues.push(issue('version','version',`Versione supportata: ${VERSION}.`));
  if(!packet.recipe.title)issues.push(issue('title','recipe.title','Titolo ricetta mancante.'));
  if(!PRODUCT_STYLES.includes(packet.recipe.product_style))issues.push(issue('product_style','recipe.product_style','Tipo di preparazione non supportato.'));
  const expectedShape=STYLE_SHAPE[packet.recipe.product_style];
  if(!SHAPES.includes(packet.format.shape))issues.push(issue('shape','format.shape','Forma impasto non supportata.'));
  else if(expectedShape&&packet.format.shape!==expectedShape)issues.push(issue('shape_mismatch','format.shape',`Per ${packet.recipe.product_style} la forma deve essere ${expectedShape}.`));

  if(packet.format.shape==='tray'){
    if(!Number.isInteger(packet.format.count)||packet.format.count<1||packet.format.count>20)issues.push(issue('count','format.count','Numero di teglie non valido.'));
    if(!inRange(packet.format.tray_width_cm,10,100))issues.push(issue('tray_width','format.tray_width_cm','Larghezza teglia fuori intervallo 10–100 cm.'));
    if(!inRange(packet.format.tray_length_cm,10,100))issues.push(issue('tray_length','format.tray_length_cm','Lunghezza teglia fuori intervallo 10–100 cm.'));
  }
  if(packet.format.shape==='round'){
    if(!Number.isInteger(packet.format.count)||packet.format.count<1||packet.format.count>30)issues.push(issue('count','format.count','Numero di panetti non valido.'));
    if(!inRange(packet.format.round_diameter_cm,8,60))issues.push(issue('diameter','format.round_diameter_cm','Diametro fuori intervallo 8–60 cm.'));
  }
  if(packet.format.shape==='manual'&&!inRange(packet.format.manual_flour_g,100,10000))issues.push(issue('manual_flour','format.manual_flour_g','Per il formato manuale indica 100–10.000 g di farina.'));
  if(!SIZING_PROFILES.includes(packet.format.sizing_profile))issues.push(issue('sizing_profile','format.sizing_profile','Profilo di dimensionamento non supportato.'));
  if(packet.format.sizing_profile==='custom'&&!inRange(packet.format.dough_loading_g_cm2,0.15,1.2))issues.push(issue('loading','format.dough_loading_g_cm2','Il carico personalizzato deve essere 0,15–1,20 g/cm².'));

  if(!inRange(packet.formula.hydration_percent,40,120))issues.push(issue('hydration','formula.hydration_percent','Idratazione fuori intervallo 40–120%.'));
  if(!inRange(packet.formula.salt_percent,0.5,4))issues.push(issue('salt','formula.salt_percent','Sale fuori intervallo 0,5–4%.'));
  if(!YEAST_TYPES.includes(packet.formula.yeast_type))issues.push(issue('yeast_type','formula.yeast_type','Importazione v1 supporta lievito fresco o secco.'));
  if(!inRange(packet.formula.base_yeast_percent_24h,0.001,5))issues.push(issue('yeast_percent','formula.base_yeast_percent_24h','Percentuale lievito base a 24 ore fuori intervallo 0,001–5%.'));
  if(!inRange(packet.fermentation.bulk_minutes,30,1440))issues.push(issue('bulk','fermentation.bulk_minutes','Puntata fuori intervallo 30–1.440 minuti.'));
  if(!inRange(packet.fermentation.proof_minutes,30,1440))issues.push(issue('proof','fermentation.proof_minutes','Appretto fuori intervallo 30–1.440 minuti.'));
  if(packet.fermentation.cold_strategy!=='auto_fit_to_target')issues.push(issue('cold_strategy','fermentation.cold_strategy','La versione 1 supporta soltanto auto_fit_to_target.'));

  if(!OVEN_TYPES.includes(packet.cooking.oven_type))issues.push(issue('oven_type','cooking.oven_type','Tipo di cottura non supportato.'));
  if(!inRange(packet.cooking.ideal_temperature_c,50,500))issues.push(issue('oven_temperature','cooking.ideal_temperature_c','Temperatura ideale fuori intervallo 50–500 °C.'));
  if(!inRange(packet.cooking.bake_minutes,1,180))issues.push(issue('bake_minutes','cooking.bake_minutes','Tempo di cottura fuori intervallo 1–180 minuti.'));
  if(!GUIDANCE_MODES.includes(packet.target.guidance_mode))issues.push(issue('guidance','target.guidance_mode','Modalità guida non supportata.'));

  const targetDate=packet.target.meal_at?new Date(packet.target.meal_at):null;
  if(!targetDate||Number.isNaN(targetDate.getTime()))issues.push(issue('target','target.meal_at','Data e ora del pasto mancanti o non valide.'));
  else if(options.checkFuture!==false){
    const hours=(targetDate-Date.now())/3600000;
    if(hours<4)issues.push(issue('target_too_close','target.meal_at','Il Wizard richiede almeno 4 ore prima del pasto.'));
  }

  if(!packet.flours.length)issues.push(issue('flours','flours','Inserisci almeno una farina da collegare a un profilo del Wizard.'));
  if(packet.flours.length>5)issues.push(issue('flours_limit','flours','Il blend può contenere al massimo 5 farine.'));
  let flourTotal=0;
  packet.flours.forEach((item,index)=>{
    if(!item.profile_id&&!item.label)issues.push(issue('flour_reference',`flours[${index}]`,'Indica profile_id oppure label della farina.'));
    if(!inRange(item.percentage,0.1,100))issues.push(issue('flour_percentage',`flours[${index}].percentage`,'Percentuale farina non valida.'));
    flourTotal+=Number(item.percentage)||0;
  });
  if(packet.flours.length&&Math.abs(flourTotal-100)>0.05)issues.push(issue('flour_total','flours',`Le percentuali delle farine totalizzano ${flourTotal.toFixed(1)}%, non 100%.`));

  if(packet.guardrails.preview_only!==true)issues.push(issue('preview','guardrails.preview_only','Il pacchetto deve restare in anteprima.'));
  if(packet.guardrails.automatic_save!==false)issues.push(issue('automatic_save','guardrails.automatic_save','Il salvataggio automatico deve essere disattivato.'));
  if(packet.guardrails.requires_user_confirmation!==true)issues.push(issue('confirmation','guardrails.requires_user_confirmation','La conferma utente è obbligatoria.'));
  if(!packet.process.length)issues.push(issue('process','process','Procedimento non inserito: sarà conservata solo la formula operativa.','warning'));
  if(!packet.environment.profile_id&&!packet.environment.profile_name)issues.push(issue('environment','environment','Profilo ambiente non indicato: dovrà essere scelto nel Wizard.','warning'));
  if(!packet.recipe.goal)issues.push(issue('goal','recipe.goal','Obiettivo del risultato non indicato.','warning'));

  return{
    valid:!issues.some(item=>item.severity==='error'),
    packet,
    errors:issues.filter(item=>item.severity==='error'),
    warnings:issues.filter(item=>item.severity==='warning'),
    metrics:{flour_percentage_total:Number(flourTotal.toFixed(1)),target_at:targetDate&&!Number.isNaN(targetDate.getTime())?targetDate.toISOString():null}
  };
}
function normalizeLabel(value){return text(value).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
function profileLabel(profile){return [profile?.brand,profile?.name,profile?.product_line].filter(Boolean).join(' · ')||text(profile?.name);}
function matchFlours(packetInput,profilesInput){
  const packet=normalize(packetInput);
  const profiles=Array.isArray(profilesInput)?profilesInput:[];
  const matched=[],unmatched=[],ambiguous=[];
  packet.flours.forEach(reference=>{
    let candidates=[];
    if(reference.profile_id)candidates=profiles.filter(profile=>profile.id===reference.profile_id);
    if(!candidates.length&&reference.label){
      const wanted=normalizeLabel(reference.label);
      candidates=profiles.filter(profile=>normalizeLabel(profileLabel(profile))===wanted||normalizeLabel(profile.name)===wanted);
      if(!candidates.length)candidates=profiles.filter(profile=>normalizeLabel(profileLabel(profile)).includes(wanted)||wanted.includes(normalizeLabel(profileLabel(profile))));
    }
    if(candidates.length===1)matched.push({reference,profile:candidates[0],percentage:reference.percentage});
    else if(candidates.length>1)ambiguous.push({reference,candidates});
    else unmatched.push(reference);
  });
  return{matched,unmatched,ambiguous,complete:matched.length===packet.flours.length&&!unmatched.length&&!ambiguous.length};
}
function matchEnvironment(packetInput,profilesInput){
  const packet=normalize(packetInput),profiles=Array.isArray(profilesInput)?profilesInput:[];
  if(packet.environment.profile_id){
    const byId=profiles.find(profile=>profile.id===packet.environment.profile_id);
    if(byId)return{profile:byId,status:'matched_by_id'};
  }
  if(packet.environment.profile_name){
    const wanted=normalizeLabel(packet.environment.profile_name);
    const candidates=profiles.filter(profile=>normalizeLabel(profile.name)===wanted);
    if(candidates.length===1)return{profile:candidates[0],status:'matched_by_name'};
    if(candidates.length>1)return{profile:null,status:'ambiguous',candidates};
  }
  return{profile:null,status:'missing'};
}
function wizardOverrides(packetInput){
  const packet=normalize(packetInput);
  const dryFactor=packet.formula.yeast_type==='dry_yeast'?0.4:1;
  return{
    style:packet.recipe.product_style,
    title:packet.recipe.title,
    hydration_percent:packet.formula.hydration_percent,
    salt_percent:packet.formula.salt_percent,
    yeast_type:packet.formula.yeast_type,
    wizard_base_yeast_percent:packet.formula.base_yeast_percent_24h/dryFactor,
    bulk_minutes:packet.fermentation.bulk_minutes,
    proof_minutes:packet.fermentation.proof_minutes,
    ideal_temperature_c:packet.cooking.ideal_temperature_c,
    bake_minutes:packet.cooking.bake_minutes,
    oven_type:packet.cooking.oven_type,
    meal_at:packet.target.meal_at,
    guidance_mode:packet.target.guidance_mode,
    format:packet.format
  };
}
function sessionSnapshot(packetInput,links={}){
  const packet=normalize(packetInput);
  return{
    schema:packet.schema,
    version:packet.version,
    imported_at:new Date().toISOString(),
    created_at:packet.created_at,
    created_in:packet.created_in,
    recipe:packet.recipe,
    formula:packet.formula,
    fermentation:packet.fermentation,
    cooking:packet.cooking,
    format:packet.format,
    process:packet.process,
    notes:packet.notes,
    assumptions:packet.assumptions,
    linked_environment_profile_id:links.environmentProfileId||null,
    linked_flours:Array.isArray(links.flours)?links.flours:[],
    guardrails:packet.guardrails
  };
}
function buildExample(targetAt){
  const target=targetAt?new Date(targetAt):new Date(Date.now()+30*3600000);
  if(Number.isNaN(target.getTime()))throw new Error('Data esempio non valida.');
  return{
    schema:SCHEMA,
    version:VERSION,
    created_at:new Date().toISOString(),
    created_in:'chat_project_cucina',
    recipe:{title:'Pizza in teglia dalla chat',product_style:'roman_pan',goal:'Alta, alveolata e con fondo croccante',source_note:'Bozza di esempio per testare l’importazione.'},
    format:{shape:'tray',count:1,tray_width_cm:30,tray_length_cm:40,round_diameter_cm:null,manual_flour_g:null,sizing_profile:'standard',dough_loading_g_cm2:0.5},
    formula:{hydration_percent:80,salt_percent:2.5,yeast_type:'fresh_yeast',base_yeast_percent_24h:0.15},
    fermentation:{bulk_minutes:120,proof_minutes:180,cold_strategy:'auto_fit_to_target'},
    cooking:{oven_type:'samsung_oven',ideal_temperature_c:280,bake_minutes:16,notes:['Preriscaldare completamente il forno.']},
    target:{meal_at:target.toISOString(),guidance_mode:'beginner'},
    environment:{profile_id:null,profile_name:'Casa'},
    flours:[{profile_id:null,label:'SOSTITUISCI CON IL NOME DEL TUO PROFILO FARINA',percentage:100}],
    process:['Impastare secondo la procedura concordata in chat.','Usare i controlli visivi della Sessione Guidata come riferimento prioritario.'],
    notes:['Il Wizard adatterà lievito e tempi alle condizioni reali.'],
    assumptions:['Strategia frigorifero calcolata automaticamente per rispettare l’orario del pasto.'],
    guardrails:{preview_only:true,automatic_save:false,requires_user_confirmation:true}
  };
}

global.CucinaHubChatRecipeImportEngine={
  SCHEMA,VERSION,PRODUCT_STYLES,SHAPES,YEAST_TYPES,STYLE_SHAPE,
  parse,normalize,validate,profileLabel,matchFlours,matchEnvironment,wizardOverrides,sessionSnapshot,buildExample
};
})(window);
