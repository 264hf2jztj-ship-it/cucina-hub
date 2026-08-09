(function(global){
'use strict';

const VERSION=1;
const SCHEMA='cucina-hub.fermentation-assistant.response';
const REQUIRED_INGREDIENTS=['flour','water','salt','yeast'];
const CONFIDENCE_LEVELS=['low','medium','high'];

function numberOrNull(value){
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}
function text(value){return String(value??'').trim();}
function asArray(value){return Array.isArray(value)?value:[];}
function tolerance(expected){return Math.max(2,Math.abs(Number(expected)||0)*0.01);}
function sourceIds(packet){return new Set(asArray(packet?.sources).map(item=>item?.id).filter(Boolean));}
function ingredientMap(response){
  return new Map(asArray(response?.proposal?.ingredients).map(item=>[item?.role,item]));
}
function phaseMinutes(response){
  return asArray(response?.proposal?.fermentation?.phases).reduce((sum,item)=>sum+(numberOrNull(item?.duration_minutes)||0),0);
}
function validationError(code,path,message){return{code,path,message,severity:'error'};}
function validationWarning(code,path,message){return{code,path,message,severity:'warning'};}

function validate(response,requestPacket){
  const issues=[];
  if(!response||typeof response!=='object')return{valid:false,errors:[validationError('response_missing','$','Risposta assente o non valida.')],warnings:[]};
  if(response.schema!==SCHEMA)issues.push(validationError('schema','schema','Schema risposta non valido.'));
  if(response.version!==VERSION)issues.push(validationError('version','version','Versione risposta non supportata.'));
  if(response.state!=='preview')issues.push(validationError('state','state','La risposta deve restare nello stato preview.'));
  if(response.requires_user_confirmation!==true)issues.push(validationError('confirmation','requires_user_confirmation','La conferma utente deve essere obbligatoria.'));
  if(response.automatic_writes!==false)issues.push(validationError('automatic_writes','automatic_writes','Le scritture automatiche devono essere disattivate.'));
  if(!text(response.summary))issues.push(validationError('summary','summary','Riepilogo della proposta mancante.'));

  const proposal=response.proposal||{};
  const expectedStyle=requestPacket?.goal?.product_style||null;
  if(!text(proposal.product_style))issues.push(validationError('product_style','proposal.product_style','Tipo di preparazione mancante.'));
  else if(expectedStyle&&proposal.product_style!==expectedStyle)issues.push(validationError('product_style_mismatch','proposal.product_style','La preparazione non corrisponde alla richiesta.'));

  const requestedFormat=requestPacket?.format||{};
  const format=proposal.format||{};
  if(!text(format.shape))issues.push(validationError('format_shape','proposal.format.shape','Forma dell’impasto mancante.'));
  if(requestedFormat.shape&&format.shape&&format.shape!==requestedFormat.shape)issues.push(validationError('format_shape_mismatch','proposal.format.shape','La forma non corrisponde alla richiesta.'));
  if(numberOrNull(format.portion_count)===null||Number(format.portion_count)<1)issues.push(validationError('portion_count','proposal.format.portion_count','Numero di teglie o panetti non valido.'));
  if(numberOrNull(requestedFormat.portion_count)!==null&&Number(format.portion_count)!==Number(requestedFormat.portion_count))issues.push(validationError('portion_count_mismatch','proposal.format.portion_count','Il numero di porzioni non corrisponde alla richiesta.'));

  const ingredients=asArray(proposal.ingredients);
  if(!ingredients.length)issues.push(validationError('ingredients','proposal.ingredients','Elenco ingredienti mancante.'));
  const byRole=ingredientMap(response);
  REQUIRED_INGREDIENTS.forEach(role=>{
    const ingredient=byRole.get(role);
    if(!ingredient)issues.push(validationError('ingredient_missing',`proposal.ingredients.${role}`,`Ingrediente obbligatorio mancante: ${role}.`));
    else if(numberOrNull(ingredient.grams)===null||Number(ingredient.grams)<=0)issues.push(validationError('ingredient_weight',`proposal.ingredients.${role}.grams`,`Peso non valido per ${role}.`));
  });
  ingredients.forEach((item,index)=>{
    if(!text(item?.name))issues.push(validationError('ingredient_name',`proposal.ingredients[${index}].name`,'Nome ingrediente mancante.'));
    if(numberOrNull(item?.grams)===null||Number(item.grams)<0)issues.push(validationError('ingredient_grams',`proposal.ingredients[${index}].grams`,'Quantità ingrediente non valida.'));
    if(item?.source_id&&!sourceIds(requestPacket).has(item.source_id))issues.push(validationWarning('unknown_source',`proposal.ingredients[${index}].source_id`,`Fonte non presente nel manifesto della richiesta: ${item.source_id}.`));
  });

  const flour=numberOrNull(byRole.get('flour')?.grams);
  const water=numberOrNull(byRole.get('water')?.grams);
  const salt=numberOrNull(byRole.get('salt')?.grams);
  if(flour&&water){
    const hydration=water/flour*100;
    if(hydration<40||hydration>120)issues.push(validationError('hydration_range','proposal.ingredients','Idratazione fuori dall’intervallo tecnico consentito 40–120%.'));
    if(numberOrNull(proposal.hydration_percent)!==null&&Math.abs(Number(proposal.hydration_percent)-hydration)>0.6)issues.push(validationError('hydration_mismatch','proposal.hydration_percent','Idratazione dichiarata non coerente con farina e acqua.'));
  }
  if(flour&&salt){
    const saltPercent=salt/flour*100;
    if(saltPercent<0.5||saltPercent>4)issues.push(validationError('salt_range','proposal.ingredients','Percentuale di sale fuori dall’intervallo 0,5–4%.'));
  }
  const ingredientTotal=ingredients.reduce((sum,item)=>sum+(numberOrNull(item?.grams)||0),0);
  const declaredTotal=numberOrNull(proposal.dough_total_weight_g);
  if(declaredTotal===null||declaredTotal<=0)issues.push(validationError('dough_total','proposal.dough_total_weight_g','Peso totale dell’impasto mancante o non valido.'));
  else if(Math.abs(ingredientTotal-declaredTotal)>tolerance(declaredTotal))issues.push(validationError('mass_balance','proposal.dough_total_weight_g',`Bilancio ingredienti incoerente: ${ingredientTotal.toFixed(1)} g contro ${declaredTotal.toFixed(1)} g dichiarati.`));
  const portionWeight=numberOrNull(format.portion_weight_g);
  if(declaredTotal&&portionWeight&&numberOrNull(format.portion_count)!==null){
    const expected=portionWeight*Number(format.portion_count);
    if(Math.abs(expected-declaredTotal)>tolerance(declaredTotal))issues.push(validationError('portion_balance','proposal.format.portion_weight_g','Peso per porzione non coerente con il totale.'));
  }

  const phases=asArray(proposal?.fermentation?.phases);
  if(!phases.length)issues.push(validationError('fermentation_phases','proposal.fermentation.phases','Fasi di fermentazione mancanti.'));
  phases.forEach((phase,index)=>{
    if(!text(phase?.name))issues.push(validationError('phase_name',`proposal.fermentation.phases[${index}].name`,'Nome fase mancante.'));
    const minutes=numberOrNull(phase?.duration_minutes);
    if(minutes===null||minutes<0)issues.push(validationError('phase_duration',`proposal.fermentation.phases[${index}].duration_minutes`,'Durata fase non valida.'));
    if(numberOrNull(phase?.temperature_c)!==null&&(Number(phase.temperature_c)<-5||Number(phase.temperature_c)>45))issues.push(validationError('phase_temperature',`proposal.fermentation.phases[${index}].temperature_c`,'Temperatura fase fuori intervallo.'));
  });
  if(phaseMinutes(response)>10080)issues.push(validationError('fermentation_total','proposal.fermentation.phases','Fermentazione complessiva superiore a 7 giorni.'));

  const oven=proposal.oven||{};
  const requestedOven=requestPacket?.constraints?.oven_type||null;
  if(!text(oven.type))issues.push(validationError('oven_type','proposal.oven.type','Forno mancante.'));
  else if(requestedOven&&oven.type!==requestedOven)issues.push(validationError('oven_mismatch','proposal.oven.type','Il forno proposto non corrisponde alla richiesta.'));
  const ovenTemperature=numberOrNull(oven.temperature_c);
  if(ovenTemperature===null||ovenTemperature<50||ovenTemperature>500)issues.push(validationError('oven_temperature','proposal.oven.temperature_c','Temperatura di cottura non valida.'));
  ['preheat_minutes','bake_minutes'].forEach(key=>{
    const value=numberOrNull(oven[key]);
    if(value===null||value<=0)issues.push(validationError('oven_duration',`proposal.oven.${key}`,'Durata di cottura o preriscaldamento non valida.'));
  });

  if(!asArray(response.explanations).length)issues.push(validationError('explanations','explanations','Spiegazioni delle scelte mancanti.'));
  if(!asArray(response.assumptions).length)issues.push(validationWarning('assumptions','assumptions','Nessuna ipotesi dichiarata.'));
  const usedSources=asArray(response.source_usage);
  if(!usedSources.length)issues.push(validationError('source_usage','source_usage','Fonti utilizzate non dichiarate.'));
  usedSources.forEach((item,index)=>{
    if(!text(item?.source_id))issues.push(validationError('source_id',`source_usage[${index}].source_id`,'Identificativo fonte mancante.'));
    else if(!sourceIds(requestPacket).has(item.source_id))issues.push(validationError('source_unknown',`source_usage[${index}].source_id`,`Fonte non autorizzata o non dichiarata: ${item.source_id}.`));
    if(!text(item?.usage))issues.push(validationError('source_usage_text',`source_usage[${index}].usage`,'Uso della fonte non spiegato.'));
  });
  if(!CONFIDENCE_LEVELS.includes(response?.confidence?.level))issues.push(validationError('confidence','confidence.level','Livello di confidenza non valido.'));
  if(!text(response?.confidence?.reason))issues.push(validationError('confidence_reason','confidence.reason','Motivazione della confidenza mancante.'));

  const errors=issues.filter(item=>item.severity==='error');
  const warnings=issues.filter(item=>item.severity==='warning');
  return{
    valid:errors.length===0,
    errors,
    warnings,
    metrics:{
      ingredient_total_g:Number(ingredientTotal.toFixed(1)),
      declared_total_g:declaredTotal,
      hydration_percent:flour&&water?Number((water/flour*100).toFixed(1)):null,
      salt_percent:flour&&salt?Number((salt/flour*100).toFixed(2)):null,
      fermentation_total_minutes:phaseMinutes(response)
    }
  };
}

function buildTechnicalExample(requestPacket){
  const style=requestPacket?.goal?.product_style||'roman_pan';
  const format=requestPacket?.format||{};
  const portions=numberOrNull(format.portion_count)||1;
  const isTray=format.shape==='tray';
  const isRound=format.shape==='round';
  const area=isTray?(numberOrNull(format.tray_width_cm)||30)*(numberOrNull(format.tray_length_cm)||40):isRound?Math.PI*Math.pow((numberOrNull(format.round_diameter_cm)||30)/2,2):1000;
  const loading=isTray?0.5:isRound?0.35:0.8;
  const portionWeight=Math.round(area*loading);
  const total=portionWeight*portions;
  const hydration=numberOrNull(requestPacket?.constraints?.hydration_preference)||(style==='roman_pan'?80:style==='focaccia'?75:style==='neapolitan'?65:style==='home_round'?68:70);
  const saltPercent=style==='neapolitan'?2.8:2.5;
  const yeastPercent=0.15;
  const flour=total/(1+hydration/100+saltPercent/100+yeastPercent/100);
  const water=flour*hydration/100;
  const salt=flour*saltPercent/100;
  const yeast=flour*yeastPercent/100;
  const exactTotal=flour+water+salt+yeast;
  return{
    schema:SCHEMA,
    version:VERSION,
    state:'preview',
    proposal_id:'technical-example',
    summary:'Esempio tecnico usato soltanto per verificare il contratto della risposta. Non è una proposta generata da AI.',
    requires_user_confirmation:true,
    automatic_writes:false,
    proposal:{
      product_style:style,
      format:{shape:format.shape||'tray',portion_count:portions,portion_weight_g:Number((exactTotal/portions).toFixed(1)),tray_width_cm:format.tray_width_cm||null,tray_length_cm:format.tray_length_cm||null,round_diameter_cm:format.round_diameter_cm||null},
      hydration_percent:hydration,
      dough_total_weight_g:Number(exactTotal.toFixed(1)),
      ingredients:[
        {role:'flour',name:requestPacket?.personal_context?.available_flours?.[0]?.label||'Farina disponibile',grams:Number(flour.toFixed(1)),source_id:'laboratory.flours'},
        {role:'water',name:'Acqua',grams:Number(water.toFixed(1)),source_id:'laboratory.environment'},
        {role:'salt',name:'Sale',grams:Number(salt.toFixed(1)),source_id:'laboratory.flours'},
        {role:'yeast',name:'Lievito fresco',grams:Number(yeast.toFixed(1)),source_id:'laboratory.environment'}
      ],
      fermentation:{phases:[{name:'Puntata',duration_minutes:120,temperature_c:requestPacket?.personal_context?.environment?.room_temperature_c||22},{name:'Frigorifero',duration_minutes:720,temperature_c:requestPacket?.personal_context?.environment?.fridge_temperature_c||4},{name:'Appretto',duration_minutes:180,temperature_c:requestPacket?.personal_context?.environment?.room_temperature_c||22}]},
      oven:{type:requestPacket?.constraints?.oven_type||'samsung_oven',temperature_c:250,preheat_minutes:45,bake_minutes:16}
    },
    explanations:[
      {topic:'dimensionamento',text:'Il peso deriva dal formato richiesto; il valore è soltanto un esempio di contratto.'},
      {topic:'ambiente',text:'Le temperature usano lo snapshot del profilo ambiente personale.'}
    ],
    assumptions:['Il provider AI non è ancora collegato.','Le durate sono dati tecnici di esempio e non devono essere applicate.'],
    source_usage:[
      {source_id:'laboratory.environment',usage:'Temperature ambiente e frigorifero.'},
      {source_id:'laboratory.flours',usage:'Farina disponibile e riferimento per le percentuali.'}
    ],
    uncertainties:['Nessuna fonte Biblioteca collegata in questo sottostep.','Learning personale eventualmente insufficiente.'],
    confidence:{level:'low',reason:'Esempio deterministico per il test dello schema, non risposta di un provider AI.'}
  };
}

function parse(input){
  if(input&&typeof input==='object')return input;
  if(!text(input))throw new Error('Incolla una risposta JSON.');
  try{return JSON.parse(input);}catch(error){throw new Error('Il testo non è un JSON valido.');}
}

global.CucinaHubFermentationAssistantResponseEngine={VERSION,SCHEMA,validate,buildTechnicalExample,parse};
})(window);
