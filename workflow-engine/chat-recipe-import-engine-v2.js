(function(global){
'use strict';

const SCHEMA='cucina-hub.chat-recipe';
const VERSION=2;
const SUPPORTED_VERSIONS=[1,2];
const PRODUCT_STYLES=['roman_pan','neapolitan','home_round','focaccia','bread','fried_dough'];
const SHAPES=['tray','round','manual'];
const YEAST_TYPES=['fresh_yeast','dry_yeast'];
const COOKING_METHODS=['bake','deep_fry'];
const DEVICE_TYPES=['samsung_oven','weber_kettle','air_fryer','induction_deep_fry','other'];
const GUIDANCE_MODES=['beginner','expert'];
const SIZING_PROFILES=['thin','standard','thick','custom'];
const COLD_STRATEGIES=['auto_fit_to_target','none'];
const STYLE_SHAPE={roman_pan:'tray',focaccia:'tray',neapolitan:'round',home_round:'round',bread:'manual',fried_dough:'round'};

function text(value){return String(value??'').trim();}
function numberOrNull(value){if(value===null||value===undefined||value==='')return null;const number=Number(value);return Number.isFinite(number)?number:null;}
function booleanOrNull(value){return typeof value==='boolean'?value:null;}
function stringArray(value){return Array.isArray(value)?value.map(text).filter(Boolean):[];}
function stripCodeFence(input){const raw=text(input);if(!raw.startsWith('```'))return raw;return raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();}
function parse(input){if(input&&typeof input==='object')return input;const raw=stripCodeFence(input);if(!raw)throw new Error('Incolla il pacchetto JSON preparato nella chat.');try{return JSON.parse(raw);}catch(error){throw new Error('Il testo incollato non è un JSON valido.');}}
function cleanObject(value){if(Array.isArray(value))return value.map(cleanObject);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined).map(([key,item])=>[key,cleanObject(item)]));}
function inferredMethod(value){if(text(value.cooking?.method))return text(value.cooking.method);if(text(value.recipe?.product_style)==='fried_dough'||text(value.cooking?.device_type||value.cooking?.oven_type)==='induction_deep_fry')return'deep_fry';return'bake';}
function normalize(input){
  const value=parse(input);
  const method=inferredMethod(value);
  const frying=value.cooking?.frying||{};
  return cleanObject({
    schema:text(value.schema),version:numberOrNull(value.version),created_at:text(value.created_at)||null,created_in:text(value.created_in)||'chat_project_cucina',
    recipe:{title:text(value.recipe?.title),product_style:text(value.recipe?.product_style),goal:text(value.recipe?.goal)||null,source_note:text(value.recipe?.source_note)||null},
    format:{shape:text(value.format?.shape),count:numberOrNull(value.format?.count),tray_width_cm:numberOrNull(value.format?.tray_width_cm),tray_length_cm:numberOrNull(value.format?.tray_length_cm),round_diameter_cm:numberOrNull(value.format?.round_diameter_cm),manual_flour_g:numberOrNull(value.format?.manual_flour_g),portion_weight_g:numberOrNull(value.format?.portion_weight_g),sizing_profile:text(value.format?.sizing_profile)||'standard',dough_loading_g_cm2:numberOrNull(value.format?.dough_loading_g_cm2)},
    formula:{flour_weight_g:numberOrNull(value.formula?.flour_weight_g),hydration_percent:numberOrNull(value.formula?.hydration_percent),salt_percent:numberOrNull(value.formula?.salt_percent),yeast_type:text(value.formula?.yeast_type),base_yeast_percent_24h:numberOrNull(value.formula?.base_yeast_percent_24h),oil_percent:numberOrNull(value.formula?.oil_percent)??0,sugar_percent:numberOrNull(value.formula?.sugar_percent)??0},
    fermentation:{bulk_minutes:numberOrNull(value.fermentation?.bulk_minutes),proof_minutes:numberOrNull(value.fermentation?.proof_minutes),cold_strategy:text(value.fermentation?.cold_strategy)||(method==='deep_fry'?'none':'auto_fit_to_target')},
    cooking:{
      method,
      device_type:text(value.cooking?.device_type||value.cooking?.oven_type),
      ideal_temperature_c:numberOrNull(value.cooking?.ideal_temperature_c),
      total_minutes:numberOrNull(value.cooking?.total_minutes??value.cooking?.bake_minutes),
      notes:stringArray(value.cooking?.notes),
      frying:{
        vessel_name:text(frying.vessel_name)||null,vessel_diameter_cm:numberOrNull(frying.vessel_diameter_cm),vessel_capacity_l:numberOrNull(frying.vessel_capacity_l),basket_used:booleanOrNull(frying.basket_used),
        heat_source:text(frying.heat_source)||null,hob_name:text(frying.hob_name)||null,oil_type:text(frying.oil_type)||null,oil_volume_ml:numberOrNull(frying.oil_volume_ml),
        temperature_min_c:numberOrNull(frying.temperature_min_c),temperature_max_c:numberOrNull(frying.temperature_max_c),start_temperature_c:numberOrNull(frying.start_temperature_c),
        seconds_per_side:numberOrNull(frying.seconds_per_side),batch_size:numberOrNull(frying.batch_size),handling_seconds:numberOrNull(frying.handling_seconds),preheat_minutes:numberOrNull(frying.preheat_minutes),
        initial_power:numberOrNull(frying.initial_power),frying_power:numberOrNull(frying.frying_power),recovery_power:numberOrNull(frying.recovery_power),lower_power:numberOrNull(frying.lower_power),mixing_batches:numberOrNull(frying.mixing_batches)
      }
    },
    target:{meal_at:text(value.target?.meal_at)||null,guidance_mode:text(value.target?.guidance_mode)||'beginner'},
    environment:{profile_id:text(value.environment?.profile_id)||null,profile_name:text(value.environment?.profile_name)||null},
    flours:(Array.isArray(value.flours)?value.flours:[]).map(item=>({profile_id:text(item?.profile_id)||null,label:text(item?.label)||null,percentage:numberOrNull(item?.percentage)})),
    process:stringArray(value.process),notes:stringArray(value.notes),assumptions:stringArray(value.assumptions),
    guardrails:{preview_only:value.guardrails?.preview_only,automatic_save:value.guardrails?.automatic_save,requires_user_confirmation:value.guardrails?.requires_user_confirmation}
  });
}
function issue(code,path,message,severity='error'){return{code,path,message,severity};}
function inRange(value,min,max){return value!==null&&value>=min&&value<=max;}
function integerInRange(value,min,max){return Number.isInteger(value)&&value>=min&&value<=max;}
function validate(input,options={}){
  let packet;try{packet=normalize(input);}catch(error){return{valid:false,packet:null,errors:[issue('invalid_json','$',error.message)],warnings:[]};}
  const issues=[];
  if(packet.schema!==SCHEMA)issues.push(issue('schema','schema',`Schema richiesto: ${SCHEMA}.`));
  if(!SUPPORTED_VERSIONS.includes(packet.version))issues.push(issue('version','version',`Versioni supportate: ${SUPPORTED_VERSIONS.join(', ')}.`));
  if(!packet.recipe.title)issues.push(issue('title','recipe.title','Titolo ricetta mancante.'));
  if(!PRODUCT_STYLES.includes(packet.recipe.product_style))issues.push(issue('product_style','recipe.product_style','Tipo di preparazione non supportato.'));
  if(packet.recipe.product_style==='fried_dough'&&packet.version!==2)issues.push(issue('fried_version','version','Gli impasti fritti richiedono il contratto versione 2.'));
  const expectedShape=STYLE_SHAPE[packet.recipe.product_style];
  if(!SHAPES.includes(packet.format.shape))issues.push(issue('shape','format.shape','Forma impasto non supportata.'));
  else if(expectedShape&&packet.format.shape!==expectedShape)issues.push(issue('shape_mismatch','format.shape',`Per ${packet.recipe.product_style} la forma deve essere ${expectedShape}.`));
  if(packet.format.shape==='tray'){
    if(!integerInRange(packet.format.count,1,20))issues.push(issue('count','format.count','Numero di teglie non valido.'));
    if(!inRange(packet.format.tray_width_cm,10,100))issues.push(issue('tray_width','format.tray_width_cm','Larghezza teglia fuori intervallo 10–100 cm.'));
    if(!inRange(packet.format.tray_length_cm,10,100))issues.push(issue('tray_length','format.tray_length_cm','Lunghezza teglia fuori intervallo 10–100 cm.'));
  }
  if(packet.format.shape==='round'){
    if(!integerInRange(packet.format.count,1,50))issues.push(issue('count','format.count','Numero di panetti non valido.'));
    if(!inRange(packet.format.round_diameter_cm,8,60))issues.push(issue('diameter','format.round_diameter_cm','Diametro fuori intervallo 8–60 cm.'));
    if(packet.format.portion_weight_g!==null&&!inRange(packet.format.portion_weight_g,20,1000))issues.push(issue('portion_weight','format.portion_weight_g','Peso del panetto fuori intervallo 20–1.000 g.'));
  }
  if(packet.format.shape==='manual'&&!inRange(packet.format.manual_flour_g,100,10000))issues.push(issue('manual_flour','format.manual_flour_g','Per il formato manuale indica 100–10.000 g di farina.'));
  if(!SIZING_PROFILES.includes(packet.format.sizing_profile))issues.push(issue('sizing_profile','format.sizing_profile','Profilo di dimensionamento non supportato.'));
  if(packet.format.sizing_profile==='custom'&&!inRange(packet.format.dough_loading_g_cm2,0.15,1.2)&&packet.format.portion_weight_g===null)issues.push(issue('loading','format.dough_loading_g_cm2','Indica carico personalizzato 0,15–1,20 g/cm² oppure il peso del panetto.'));
  if(packet.formula.flour_weight_g!==null&&!inRange(packet.formula.flour_weight_g,100,10000))issues.push(issue('flour_weight','formula.flour_weight_g','Farina totale fuori intervallo 100–10.000 g.'));
  if(!inRange(packet.formula.hydration_percent,40,120))issues.push(issue('hydration','formula.hydration_percent','Idratazione fuori intervallo 40–120%.'));
  if(!inRange(packet.formula.salt_percent,0.5,4))issues.push(issue('salt','formula.salt_percent','Sale fuori intervallo 0,5–4%.'));
  if(!YEAST_TYPES.includes(packet.formula.yeast_type))issues.push(issue('yeast_type','formula.yeast_type','Il Wizard supporta lievito fresco o secco.'));
  if(!inRange(packet.formula.base_yeast_percent_24h,0.001,5))issues.push(issue('yeast_percent','formula.base_yeast_percent_24h','Percentuale lievito base a 24 ore fuori intervallo 0,001–5%.'));
  if(!inRange(packet.formula.oil_percent,0,15))issues.push(issue('oil_percent','formula.oil_percent','Olio nell’impasto fuori intervallo 0–15%.'));
  if(!inRange(packet.formula.sugar_percent,0,10))issues.push(issue('sugar_percent','formula.sugar_percent','Zucchero o miele fuori intervallo 0–10%.'));
  if(!inRange(packet.fermentation.bulk_minutes,30,1440))issues.push(issue('bulk','fermentation.bulk_minutes','Puntata fuori intervallo 30–1.440 minuti.'));
  if(!inRange(packet.fermentation.proof_minutes,30,1440))issues.push(issue('proof','fermentation.proof_minutes','Appretto fuori intervallo 30–1.440 minuti.'));
  if(!COLD_STRATEGIES.includes(packet.fermentation.cold_strategy))issues.push(issue('cold_strategy','fermentation.cold_strategy','Strategia frigorifero non supportata.'));
  if(packet.recipe.product_style==='fried_dough'&&packet.fermentation.cold_strategy!=='none')issues.push(issue('fried_cold_strategy','fermentation.cold_strategy','Gli impasti fritti v2 richiedono cold_strategy: none.'));
  if(!COOKING_METHODS.includes(packet.cooking.method))issues.push(issue('cooking_method','cooking.method','Metodo di cottura non supportato.'));
  if(!DEVICE_TYPES.includes(packet.cooking.device_type))issues.push(issue('device_type','cooking.device_type','Dispositivo di cottura non supportato.'));
  if(!inRange(packet.cooking.ideal_temperature_c,50,500))issues.push(issue('cooking_temperature','cooking.ideal_temperature_c','Temperatura ideale fuori intervallo 50–500 °C.'));
  if(!inRange(packet.cooking.total_minutes,1,240))issues.push(issue('cooking_minutes','cooking.total_minutes','Durata totale della cottura fuori intervallo 1–240 minuti.'));
  if(packet.recipe.product_style==='fried_dough'&&packet.cooking.method!=='deep_fry')issues.push(issue('fried_method','cooking.method','fried_dough richiede cooking.method: deep_fry.'));
  if(packet.cooking.method==='deep_fry'){
    const f=packet.cooking.frying;
    if(packet.cooking.device_type!=='induction_deep_fry')issues.push(issue('fried_device','cooking.device_type','La frittura guidata usa induction_deep_fry.'));
    if(!f.vessel_name)issues.push(issue('vessel','cooking.frying.vessel_name','Nome della pentola o friggitrice mancante.'));
    if(!inRange(f.vessel_diameter_cm,12,60))issues.push(issue('vessel_diameter','cooking.frying.vessel_diameter_cm','Diametro recipiente fuori intervallo 12–60 cm.'));
    if(!inRange(f.vessel_capacity_l,1,20))issues.push(issue('vessel_capacity','cooking.frying.vessel_capacity_l','Capacità recipiente fuori intervallo 1–20 litri.'));
    if(!f.oil_type)issues.push(issue('oil_type','cooking.frying.oil_type','Tipo di olio per frittura mancante.'));
    if(!inRange(f.oil_volume_ml,300,10000))issues.push(issue('oil_volume','cooking.frying.oil_volume_ml','Volume olio fuori intervallo 300–10.000 ml.'));
    if(!inRange(f.temperature_min_c,140,200)||!inRange(f.temperature_max_c,140,200)||f.temperature_min_c>=f.temperature_max_c)issues.push(issue('oil_range','cooking.frying','Intervallo temperatura olio non valido.'));
    if(!inRange(f.start_temperature_c,f.temperature_min_c||140,f.temperature_max_c||200))issues.push(issue('start_temperature','cooking.frying.start_temperature_c','Temperatura iniziale fuori dall’intervallo operativo.'));
    if(!inRange(f.seconds_per_side,20,300))issues.push(issue('seconds_per_side','cooking.frying.seconds_per_side','Tempo per lato fuori intervallo 20–300 secondi.'));
    if(!integerInRange(f.batch_size,1,10))issues.push(issue('batch_size','cooking.frying.batch_size','Numero di pezzi per turno non valido.'));
    if(!inRange(f.preheat_minutes,3,60))issues.push(issue('preheat_minutes','cooking.frying.preheat_minutes','Riscaldamento olio fuori intervallo 3–60 minuti.'));
    if(f.basket_used!==false)issues.push(issue('basket','cooking.frying.basket_used','Per il profilo pizzonde KitchenCraft il cestello deve essere disattivato.'));
  }
  if(!GUIDANCE_MODES.includes(packet.target.guidance_mode))issues.push(issue('guidance','target.guidance_mode','Modalità guida non supportata.'));
  const targetDate=packet.target.meal_at?new Date(packet.target.meal_at):null;
  if(!targetDate||Number.isNaN(targetDate.getTime()))issues.push(issue('target','target.meal_at','Data e ora del pasto mancanti o non valide.'));
  else if(options.checkFuture!==false&&((targetDate-Date.now())/3600000)<4)issues.push(issue('target_too_close','target.meal_at','Il Wizard richiede almeno 4 ore prima del pasto.'));
  if(!packet.flours.length)issues.push(issue('flours','flours','Inserisci almeno una farina da collegare a un profilo del Wizard.'));
  if(packet.flours.length>5)issues.push(issue('flours_limit','flours','Il blend può contenere al massimo 5 farine.'));
  let flourTotal=0;packet.flours.forEach((item,index)=>{if(!item.profile_id&&!item.label)issues.push(issue('flour_reference',`flours[${index}]`,'Indica profile_id oppure label della farina.'));if(!inRange(item.percentage,0.1,100))issues.push(issue('flour_percentage',`flours[${index}].percentage`,'Percentuale farina non valida.'));flourTotal+=Number(item.percentage)||0;});
  if(packet.flours.length&&Math.abs(flourTotal-100)>0.05)issues.push(issue('flour_total','flours',`Le percentuali delle farine totalizzano ${flourTotal.toFixed(1)}%, non 100%.`));
  if(packet.guardrails.preview_only!==true)issues.push(issue('preview','guardrails.preview_only','Il pacchetto deve restare in anteprima.'));
  if(packet.guardrails.automatic_save!==false)issues.push(issue('automatic_save','guardrails.automatic_save','Il salvataggio automatico deve essere disattivato.'));
  if(packet.guardrails.requires_user_confirmation!==true)issues.push(issue('confirmation','guardrails.requires_user_confirmation','La conferma utente è obbligatoria.'));
  if(!packet.process.length)issues.push(issue('process','process','Procedimento non inserito: sarà conservata solo la formula operativa.','warning'));
  if(!packet.environment.profile_id&&!packet.environment.profile_name)issues.push(issue('environment','environment','Profilo ambiente non indicato: dovrà essere scelto nel Wizard.','warning'));
  if(!packet.recipe.goal)issues.push(issue('goal','recipe.goal','Obiettivo del risultato non indicato.','warning'));
  if(packet.recipe.product_style==='fried_dough'&&packet.formula.flour_weight_g===null)issues.push(issue('fried_flour_weight','formula.flour_weight_g','Per una ricetta fritta già testata è consigliato indicare la farina totale esatta.','warning'));
  return{valid:!issues.some(item=>item.severity==='error'),packet,errors:issues.filter(item=>item.severity==='error'),warnings:issues.filter(item=>item.severity==='warning'),metrics:{flour_percentage_total:Number(flourTotal.toFixed(1)),target_at:targetDate&&!Number.isNaN(targetDate.getTime())?targetDate.toISOString():null}};
}
function normalizeLabel(value){return text(value).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
function profileLabel(profile){return[profile?.brand,profile?.name,profile?.product_line].filter(Boolean).join(' · ')||text(profile?.name);}
function matchFlours(packetInput,profilesInput){const packet=normalize(packetInput),profiles=Array.isArray(profilesInput)?profilesInput:[],matched=[],unmatched=[],ambiguous=[];packet.flours.forEach(reference=>{let candidates=[];if(reference.profile_id)candidates=profiles.filter(profile=>profile.id===reference.profile_id);if(!candidates.length&&reference.label){const wanted=normalizeLabel(reference.label);candidates=profiles.filter(profile=>normalizeLabel(profileLabel(profile))===wanted||normalizeLabel(profile.name)===wanted);if(!candidates.length)candidates=profiles.filter(profile=>normalizeLabel(profileLabel(profile)).includes(wanted)||wanted.includes(normalizeLabel(profileLabel(profile))));}if(candidates.length===1)matched.push({reference,profile:candidates[0],percentage:reference.percentage});else if(candidates.length>1)ambiguous.push({reference,candidates});else unmatched.push(reference);});return{matched,unmatched,ambiguous,complete:matched.length===packet.flours.length&&!unmatched.length&&!ambiguous.length};}
function matchEnvironment(packetInput,profilesInput){const packet=normalize(packetInput),profiles=Array.isArray(profilesInput)?profilesInput:[];if(packet.environment.profile_id){const byId=profiles.find(profile=>profile.id===packet.environment.profile_id);if(byId)return{profile:byId,status:'matched_by_id'};}if(packet.environment.profile_name){const wanted=normalizeLabel(packet.environment.profile_name),candidates=profiles.filter(profile=>normalizeLabel(profile.name)===wanted);if(candidates.length===1)return{profile:candidates[0],status:'matched_by_name'};if(candidates.length>1)return{profile:null,status:'ambiguous',candidates};}return{profile:null,status:'missing'};}
function wizardOverrides(packetInput){const packet=normalize(packetInput),dryFactor=packet.formula.yeast_type==='dry_yeast'?0.4:1;return{style:packet.recipe.product_style,title:packet.recipe.title,flour_weight_g:packet.formula.flour_weight_g,hydration_percent:packet.formula.hydration_percent,salt_percent:packet.formula.salt_percent,oil_percent:packet.formula.oil_percent,sugar_percent:packet.formula.sugar_percent,yeast_type:packet.formula.yeast_type,wizard_base_yeast_percent:packet.formula.base_yeast_percent_24h/dryFactor,bulk_minutes:packet.fermentation.bulk_minutes,proof_minutes:packet.fermentation.proof_minutes,cold_strategy:packet.fermentation.cold_strategy,cooking_method:packet.cooking.method,cooking_profile:packet.cooking.frying,ideal_temperature_c:packet.cooking.ideal_temperature_c,bake_minutes:packet.cooking.total_minutes,oven_type:packet.cooking.device_type,meal_at:packet.target.meal_at,guidance_mode:packet.target.guidance_mode,format:packet.format};}
function sessionSnapshot(packetInput,links={}){const packet=normalize(packetInput);return{schema:packet.schema,version:packet.version,imported_at:new Date().toISOString(),created_at:packet.created_at,created_in:packet.created_in,recipe:packet.recipe,formula:packet.formula,fermentation:packet.fermentation,cooking:packet.cooking,format:packet.format,process:packet.process,notes:packet.notes,assumptions:packet.assumptions,linked_environment_profile_id:links.environmentProfileId||null,linked_flours:Array.isArray(links.flours)?links.flours:[],guardrails:packet.guardrails};}
function futureIso(target){const date=target instanceof Date?new Date(target):new Date(target||Date.now()+30*3600000);if(Number.isNaN(date.getTime())||date-Date.now()<4*3600000)return new Date(Date.now()+30*3600000).toISOString();return date.toISOString();}
function buildExample(target){return{schema:SCHEMA,version:VERSION,created_at:new Date().toISOString(),created_in:'chat_project_cucina',recipe:{title:'Pizza in teglia dalla chat',product_style:'roman_pan',goal:'Fondo croccante e interno morbido',source_note:'Esempio tecnico'},format:{shape:'tray',count:1,tray_width_cm:30,tray_length_cm:40,sizing_profile:'standard'},formula:{hydration_percent:80,salt_percent:2.5,yeast_type:'fresh_yeast',base_yeast_percent_24h:0.15,oil_percent:0,sugar_percent:0},fermentation:{bulk_minutes:120,proof_minutes:180,cold_strategy:'auto_fit_to_target'},cooking:{method:'bake',device_type:'samsung_oven',ideal_temperature_c:250,total_minutes:16,notes:[]},target:{meal_at:futureIso(target),guidance_mode:'beginner'},environment:{profile_id:null,profile_name:null},flours:[{profile_id:null,label:'Farina 0',percentage:100}],process:['Impastare seguendo la sequenza del Wizard.'],notes:[],assumptions:[],guardrails:{preview_only:true,automatic_save:false,requires_user_confirmation:true}};}
function buildFriedExample(target){return{schema:SCHEMA,version:VERSION,created_at:new Date().toISOString(),created_in:'chat_project_cucina',recipe:{title:'Pizzonde abruzzesi fritte',product_style:'fried_dough',goal:'Croccanti fuori e morbide dentro',source_note:'Ricetta personale testata il 9 agosto 2026'},format:{shape:'round',count:18,round_diameter_cm:13,portion_weight_g:90,sizing_profile:'custom',dough_loading_g_cm2:0.678},formula:{flour_weight_g:1000,hydration_percent:61,salt_percent:2.4,yeast_type:'fresh_yeast',base_yeast_percent_24h:0.15,oil_percent:3,sugar_percent:0.8},fermentation:{bulk_minutes:75,proof_minutes:60,cold_strategy:'none'},cooking:{method:'deep_fry',device_type:'induction_deep_fry',ideal_temperature_c:170,total_minutes:45,frying:{vessel_name:'Pentola/friggitrice KitchenCraft inox Ø20 cm',vessel_diameter_cm:20,vessel_capacity_l:3,basket_used:false,heat_source:'induction',hob_name:'Piastra a induzione IKEA',oil_type:'olio di semi di arachide',oil_volume_ml:1000,temperature_min_c:165,temperature_max_c:175,start_temperature_c:174,seconds_per_side:60,batch_size:1,handling_seconds:30,preheat_minutes:15,initial_power:7,frying_power:5,recovery_power:6,lower_power:4,mixing_batches:2},notes:['Friggere una pizzonda alla volta senza cestello.','Salare subito e non coprire da calde.']},target:{meal_at:futureIso(target),guidance_mode:'beginner'},environment:{profile_id:null,profile_name:null},flours:[{profile_id:null,label:'Farina 0',percentage:100}],process:['Preparare due impasti separati da 500 g di farina.','Fare due giri di pieghe.','Formare panetti da circa 90 g e lasciarli rilassare coperti.','Stendere a 12–14 cm senza mattarello.','Friggere una alla volta e scolare senza coprire.'],notes:['Usare poca semola e scrollarla prima della frittura.'],assumptions:['Temperatura ambiente simile al test approvato.'],guardrails:{preview_only:true,automatic_save:false,requires_user_confirmation:true}};}

global.CucinaHubChatRecipeImportEngine={SCHEMA,VERSION,SUPPORTED_VERSIONS,PRODUCT_STYLES,COOKING_METHODS,DEVICE_TYPES,normalize,validate,profileLabel,matchFlours,matchEnvironment,wizardOverrides,sessionSnapshot,buildExample,buildFriedExample};
})(window);
