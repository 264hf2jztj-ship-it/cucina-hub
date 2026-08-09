(function(global){
'use strict';

const previous=global.CucinaHubSessionWorkflowBuilder;
if(!previous?.build)throw new Error('Session workflow builder base non disponibile.');

function phase(id,type,title,description,estimated,goal,why,activities,metadata={}){
  return{id,version:6,type,title,description,estimated_minutes:Math.max(0,Math.round(Number(estimated)||0)),goal,why,activities,metadata};
}
function n(value,fallback=0){const number=Number(value);return Number.isFinite(number)?number:fallback;}
function grams(value,digits=1){return n(value).toFixed(digits).replace(/\.0$/,'');}
function profileFor(plan){
  const source=plan.cooking_profile||{};
  return{
    vessel_name:source.vessel_name||'Pentola/friggitrice KitchenCraft inox Ø20 cm',
    vessel_diameter_cm:n(source.vessel_diameter_cm,20),vessel_capacity_l:n(source.vessel_capacity_l,3),basket_used:source.basket_used===true,
    heat_source:source.heat_source||'induction',hob_name:source.hob_name||'Piastra a induzione IKEA',oil_type:source.oil_type||'olio di semi di arachide',oil_volume_ml:n(source.oil_volume_ml,1000),
    temperature_min_c:n(source.temperature_min_c,165),temperature_max_c:n(source.temperature_max_c,175),start_temperature_c:n(source.start_temperature_c,174),
    seconds_per_side:n(source.seconds_per_side,60),batch_size:Math.max(1,Math.round(n(source.batch_size,1))),handling_seconds:n(source.handling_seconds,30),preheat_minutes:n(source.preheat_minutes,15),
    initial_power:n(source.initial_power,7),frying_power:n(source.frying_power,5),recovery_power:n(source.recovery_power,6),lower_power:n(source.lower_power,4),mixing_batches:Math.max(1,Math.round(n(source.mixing_batches,2)))
  };
}
function buildFried(plan){
  const cooking=profileFor(plan);
  const count=Math.max(1,Math.round(n(plan.portion_count,1)));
  const portionWeight=n(plan.portion_weight_g,n(plan.dough_total_weight_g)/count);
  const fryMinutes=Math.max(1,Math.ceil(count*(cooking.seconds_per_side*2+cooking.handling_seconds)/(cooking.batch_size*60)));
  const humidity=plan.humidity_correction?.operational||{};
  const cover=humidity.covering_strategy||'Copri bene impasti e panetti per evitare la crosticina.';
  const humidityCheck=humidity.final_check||'La superficie deve restare morbida e non secca.';
  const batches=cooking.mixing_batches;
  const flourPerBatch=n(plan.flour_weight_g)/batches;
  const waterPerBatch=n(plan.water_weight_g)/batches;
  const saltPerBatch=n(plan.salt_weight_g)/batches;
  const yeastPerBatch=n(plan.yeast_weight_g)/batches;
  const oilPerBatch=n(plan.oil_weight_g)/batches;
  const sugarPerBatch=n(plan.sugar_weight_g)/batches;
  const phases=[];

  phases.push(phase('session_preparation','preparation','Preparazione ingredienti e attrezzatura','Pesa gli ingredienti e prepara impastatrice, contenitori e attrezzatura per la frittura.',12,'Avere tutto pronto prima di iniziare.','Gli impasti separati e la frittura richiedono ordine e quantità già suddivise.',[
    {id:'split_flour',kind:'action',label:`Dividi ${grams(plan.flour_weight_g)} g di farina in ${batches} parti da circa ${grams(flourPerBatch)} g.`},
    {id:'split_water',kind:'action',label:`Dividi ${grams(plan.water_weight_g)} g d’acqua fresca in ${batches} parti da circa ${grams(waterPerBatch)} g.`},
    {id:'split_yeast',kind:'action',label:`Dividi ${grams(plan.yeast_weight_g,2)} g di lievito in ${batches} parti da circa ${grams(yeastPerBatch,2)} g.`},
    {id:'split_salt',kind:'action',label:`Dividi ${grams(plan.salt_weight_g)} g di sale in ${batches} parti da circa ${grams(saltPerBatch)} g.`},
    ...(n(plan.oil_weight_g)>0?[{id:'split_oil',kind:'action',label:`Dividi ${grams(plan.oil_weight_g)} g di olio nell’impasto in ${batches} parti da circa ${grams(oilPerBatch)} g.`}]:[]),
    ...(n(plan.sugar_weight_g)>0?[{id:'split_sugar',kind:'action',label:`Dividi ${grams(plan.sugar_weight_g)} g di zucchero o miele in ${batches} parti da circa ${grams(sugarPerBatch)} g.`}]:[]),
    {id:'tools',kind:'action',label:`Prepara la DCG KM1401R con gancio, ${batches} contenitori copribili, bilancia, tarocco e termometro per olio.`},
    {id:'fry_tools',kind:'action',label:`Prepara ${cooking.vessel_name}, senza cestello durante la cottura, e ${cooking.oil_volume_ml} ml di ${cooking.oil_type}.`},
    {id:'ready',kind:'check',label:'Controlla che ogni dose sia separata e che il sale non sia ancora a contatto diretto con il lievito.',success_criteria:'Ingredienti divisi correttamente e attrezzatura pronta.'}
  ],{timeline_role:'preparation',attention:'active',cooking_method:'deep_fry'}));

  phases.push(phase('session_mixing','mixing',`Impasto in ${batches} lavorazioni`,`Prepara ${batches} impasti separati per non sovraccaricare l’impastatrice.`,18*batches,'Ottenere impasti elastici e gestibili.','Lavorazioni più piccole sono più sicure e uniformi con la DCG KM1401R.',[
    {id:'batch_start',kind:'action',label:`Per ciascun impasto usa circa ${grams(flourPerBatch)} g farina, ${grams(waterPerBatch)} g acqua, ${grams(yeastPerBatch,2)} g lievito e ${grams(saltPerBatch)} g sale${oilPerBatch>0?`, ${grams(oilPerBatch)} g olio`:''}${sugarPerBatch>0?` e ${grams(sugarPerBatch)} g zucchero o miele`:''}.`},
    {id:'initial_water',kind:'action',label:'Metti farina, lievito ed eventuale zucchero nella ciotola. Parti con circa il 95% dell’acqua della singola dose.'},
    {id:'speed_one',kind:'timer',label:'Impasta 3 minuti a velocità 1.',seconds:180},
    {id:'speed_two',kind:'timer',label:'Passa a velocità 2 per 5–6 minuti, finché non resta farina asciutta.',seconds:360},
    {id:'salt_addition',kind:'action',label:'Sciogli il sale nell’acqua rimasta, aggiungilo prima lentamente a velocità 1 e poi completa a velocità 2.'},
    ...(oilPerBatch>0?[{id:'oil_addition',kind:'action',label:'Aggiungi l’olio a filo solo quando acqua e sale sono assorbiti; fallo incorporare a velocità 1 e completa a velocità 2.'}]:[]),
    {id:'temperature',kind:'check',label:`Controlla che l’impasto non superi circa ${plan.target_dough_temperature_c||24}–26 °C.`,success_criteria:'Impasto elastico, non surriscaldato e capace di staccarsi gradualmente dalla ciotola.'},
    {id:'repeat',kind:'check',label:`Ripeti la stessa sequenza fino a completare tutte le ${batches} lavorazioni.`,success_criteria:'Tutti gli impasti hanno consistenza simile.'}
  ],{appliance:'Impastatrice DCG KM1401R',speed_min:1,speed_max:2,timeline_role:'mixing',attention:'active',mixing_batches:batches}));

  phases.push(phase('session_bulk','fermentation','Pieghe e prima lievitazione','Rinforza gli impasti e lasciali crescere coperti.',plan.bulk_fermentation_minutes,'Arrivare a impasti gonfi e quasi raddoppiati senza collasso.','Le pieghe danno struttura; con ambiente caldo conta più il volume reale del timer.',[
    {id:'transfer',kind:'action',label:'Trasferisci ogni impasto in un contenitore leggermente unto.'},
    {id:'fold_one',kind:'action',label:'Esegui un primo giro di 4 pieghe in ciotola e copri.'},
    {id:'fold_rest',kind:'timer',label:'Lascia riposare 20 minuti.',seconds:1200},
    {id:'fold_two',kind:'action',label:'Fai un secondo giro: 4 pieghe se l’impasto è ancora morbido, 2–3 leggere se è già teso.'},
    {id:'cover',kind:'action',label:cover},
    {id:'bulk_timer',kind:'timer',label:`Lascia lievitare fino al controllo previsto, indicativamente ${Math.round(n(plan.bulk_fermentation_minutes))} minuti complessivi.`,seconds:n(plan.bulk_fermentation_minutes)*60},
    {id:'bulk_check',kind:'check',label:'Controlla volume e tenuta prima di formare i panetti.',success_criteria:`Volume aumentato in modo evidente, superficie liscia e leggermente bombata, impasto morbido ma non collassato. ${humidityCheck}`}
  ],{timeline_role:'bulk',attention:'passive',cold_strategy:'none'}));

  phases.push(phase('session_proof','fermentation','Panetti e riposo finale',`Forma ${count} panetti da circa ${grams(portionWeight)} g e lasciali rilassare ben coperti.`,plan.final_proof_minutes,'Ottenere panetti gonfi e facili da stendere.','La formatura delicata conserva il gas; la copertura evita la crosticina.',[
    {id:'divide',kind:'action',label:`Dividi delicatamente l’impasto in ${count} pezzi da circa ${grams(portionWeight)} g.`},
    {id:'shape',kind:'action',label:'Porta i lembi sotto e chiudi leggermente la base. Non reimpastare e non fare pieghe forti.'},
    {id:'proof_cover',kind:'action',label:cover},
    {id:'proof_timer',kind:'timer',label:`Lascia riposare indicativamente ${Math.round(n(plan.final_proof_minutes))} minuti.`,seconds:n(plan.final_proof_minutes)*60},
    {id:'proof_check',kind:'check',label:'Controlla i panetti prima della stesura.',success_criteria:`Panetti gonfi ma ancora tondi, superficie non secca e impasto che si stende senza tornare indietro. ${humidityCheck}`},
    {id:'stretch',kind:'action',label:'Stendi con mani leggermente unte o pochissima semola, senza mattarello. Mantieni lo spessore previsto e scrolla la semola in eccesso.'}
  ],{timeline_role:'proof',attention:'passive',portion_count:count,portion_weight_g:portionWeight}));

  phases.push(phase('session_bake','frying','Frittura delle pizzonde','Scalda l’olio, friggi una pizzonda alla volta e controlla continuamente la temperatura.',cooking.preheat_minutes+fryMinutes,'Ottenere esterno dorato e croccante con interno morbido.','Una temperatura stabile limita l’assorbimento e permette una cottura uniforme.',[
    {id:'fill_vessel',kind:'action',label:`Versa ${cooking.oil_volume_ml} ml di ${cooking.oil_type} nella ${cooking.vessel_name}. Non usare il cestello durante la frittura.`},
    {id:'set_heat',kind:'action',label:`Avvia la ${cooking.hob_name} a potenza ${cooking.initial_power}.`},
    {id:'preheat_timer',kind:'timer',label:`Riscalda l’olio per circa ${cooking.preheat_minutes} minuti e controlla con il termometro.`,seconds:cooking.preheat_minutes*60},
    {id:'lower_heat',kind:'action',label:`Quando l’olio raggiunge 155–160 °C, abbassa a potenza ${cooking.frying_power}. Inizia a friggere a circa ${cooking.start_temperature_c} °C.`},
    {id:'fry_one',kind:'action',label:`Friggi ${cooking.batch_size===1?'una pizzonda alla volta':`${cooking.batch_size} pizzonde per turno`}, senza bucarla.`},
    {id:'side_one',kind:'timer',label:`Cuoci il primo lato per ${cooking.seconds_per_side} secondi.`,seconds:cooking.seconds_per_side},
    {id:'turn',kind:'action',label:'Gira delicatamente senza schiacciare. Se la parte superiore resta chiara, irrora con poco olio caldo usando un cucchiaio.'},
    {id:'side_two',kind:'timer',label:`Cuoci il secondo lato per ${cooking.seconds_per_side} secondi.`,seconds:cooking.seconds_per_side},
    {id:'temperature_check',kind:'check',label:`Mantieni l’olio tra ${cooking.temperature_min_c} e ${cooking.temperature_max_c} °C.`,success_criteria:`Sotto ${cooking.temperature_min_c} °C attendi prima della successiva; usa potenza ${cooking.recovery_power} solo per recuperare. Se supera ${cooking.temperature_max_c+5} °C, scendi a ${cooking.lower_power} o sposta temporaneamente la pentola.`},
    {id:'fry_total',kind:'timer',label:`Completa tutte le ${count} pizzonde: durata operativa stimata ${fryMinutes} minuti.`,seconds:fryMinutes*60},
    {id:'fry_check',kind:'check',label:'Controlla colore e struttura.',success_criteria:'Pizzonde gonfie, dorate e croccanti fuori, senza zone crude o eccessivamente scure.'}
  ],{appliance:cooking.vessel_name,heat_source:cooking.hob_name,cooking_method:'deep_fry',timeline_role:'baking',attention:'active',preheat_minutes:cooking.preheat_minutes,bake_minutes:fryMinutes,preheat_title:'Riscaldamento olio',bake_title:'Frittura pizzonde',oil_temperature_range_c:[cooking.temperature_min_c,cooking.temperature_max_c]}));

  phases.push(phase('session_finish','finishing','Scolatura, sale e valutazione','Scola, sala immediatamente e registra il risultato.',5,'Conservare la croccantezza e raccogliere un feedback utile.','Coprire da calde intrappolerebbe vapore e ammorbidirebbe la superficie.',[
    {id:'drain',kind:'action',label:'Scola su griglia o carta assorbente.'},
    {id:'salt',kind:'action',label:'Sala subito dopo la frittura.'},
    {id:'no_cover',kind:'warning',label:'Non coprire le pizzonde mentre sono calde.'},
    {id:'photo',kind:'photo',label:'Scatta una foto del risultato finale e, se utile, una dell’interno.'},
    {id:'evaluate',kind:'check',label:'Valuta croccantezza, morbidezza interna, stesura, assorbimento d’olio e uniformità.',success_criteria:'Esterno croccante, interno morbido, nessuna zona cruda e impasto facile da stendere.'}
  ],{timeline_role:'finish',attention:'active'}));

  return{id:`workflow_${Date.now()}`,title:plan.title,version:6,status:'planned',context:{baking_session:true,timeline_engine:true,humidity_engine:true,cooking_method:'deep_fry',fried_dough:true,cold_strategy:'none',cooking_profile:cooking},phases,estimated_minutes:phases.reduce((sum,item)=>sum+item.estimated_minutes,0),created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
}
function build(plan){return plan?.cooking_method==='deep_fry'||plan?.product_style==='fried_dough'||plan?.oven_type==='induction_deep_fry'?buildFried(plan):previous.build(plan);}

global.CucinaHubSessionWorkflowBuilder={...previous,build,buildFried,FRIED_VERSION:6};
})(window);
