(function(global){
'use strict';
function phase(id,type,title,description,estimated,goal,why,activities,metadata={}){
  return {id,version:2,type,title,description,estimated_minutes:estimated,goal,why,activities,metadata};
}
function build(plan){
  const firstWater=Math.round(plan.water_weight_g*(plan.hydration_percent>=75?.7:.8));
  const remaining=Math.round(plan.water_weight_g-firstWater);
  const saltWater=Math.min(20,Math.max(10,Math.round(remaining*.08)));
  const yeastInstruction=plan.yeast_type==='fresh_yeast'
    ? `Sbriciola direttamente nell’impasto i ${plan.yeast_weight_g} g di lievito fresco mentre la DCG gira a velocità 1.`
    : plan.yeast_type==='dry_yeast'
      ? `Se è lievito secco istantaneo, aggiungi direttamente i ${plan.yeast_weight_g} g nell’impasto; se è secco attivo, scioglilo prima in poca acqua presa da quella tenuta da parte.`
      : `Aggiungi ${plan.yeast_weight_g} g di lievito madre a piccoli pezzi mentre la DCG gira a velocità 1.`;
  const ovenLabel={samsung_oven:'Forno Samsung',weber_kettle:'Weber Kettle',air_fryer:'Friggitrice ad aria',other:'Forno selezionato'}[plan.oven_type]||'Forno selezionato';
  const phases=[
    phase('session_preparation','preparation','Preparazione ingredienti','Pesa e organizza tutto prima di iniziare.',10,'Avere ingredienti e utensili pronti.','Riduce errori e interruzioni durante l’impasto',[
      {id:'flour',kind:'action',label:`Pesa ${plan.flour_weight_g} g di farina${plan.flour_name?' '+plan.flour_name:''}.`},
      {id:'water',kind:'action',label:`Pesa ${plan.water_weight_g} g d’acqua: ${firstWater} g iniziali e ${remaining} g da tenere da parte.`},
      {id:'salt',kind:'action',label:`Pesa ${plan.salt_weight_g} g di sale e scioglilo in circa ${saltWater} g dell’acqua tenuta da parte.`},
      {id:'yeast',kind:'action',label:`Pesa ${plan.yeast_weight_g} g di lievito. ${yeastInstruction}`},
      {id:'tools',kind:'action',label:'Prepara gancio, spatola, contenitore leggermente unto e coperchio.'},
      {id:'ready',kind:'check',label:'Tutto è pesato, separato e a portata di mano.',success_criteria:'Nessun ingrediente manca e l’acqua è già divisa.'}
    ]),
    phase('session_mixing','mixing','Impasto con impastatrice DCG','Segui le attività nell’ordine indicato.',18,'Ottenere un impasto elastico senza surriscaldarlo.','La sequenza favorisce assorbimento e formazione della maglia glutinica',[
      {id:'hook',kind:'action',label:'1. Monta il gancio impastatore sulla DCG.'},
      {id:'load',kind:'action',label:`2. Metti in ciotola farina e ${firstWater} g d’acqua.`},
      {id:'low',kind:'action',label:'3. Avvia la DCG a velocità 1.',why_now:'La velocità 1 idrata la farina senza stressare l’impasto.'},
      {id:'initial_timer',kind:'timer',label:'4. Lascia lavorare 3 minuti a velocità 1.',seconds:180},
      {id:'initial_check',kind:'check',label:'5. Controlla l’assorbimento.',success_criteria:'La farina asciutta è quasi scomparsa; l’impasto non deve ancora essere liscio.'},
      {id:'add_yeast',kind:'action',label:`6. ${yeastInstruction}`},
      {id:'add_water',kind:'action',label:`7. A velocità 1 versa gradualmente i ${Math.max(0,remaining-saltWater)} g d’acqua rimasti, in più riprese.`,why_now:'Aggiungere tutta l’acqua insieme potrebbe far perdere struttura.'},
      {id:'add_salt',kind:'action',label:`8. Aggiungi il sale già sciolto nei ${saltWater} g d’acqua, sempre a velocità 1.`,why_now:'Il sale entra dopo l’idratazione iniziale e con il lievito già distribuito.'},
      {id:'medium',kind:'action',label:'9. Quando il sale è assorbito, passa a velocità 2.'},
      {id:'final_timer',kind:'timer',label:'10. Lavora 5 minuti a velocità 2.',seconds:300},
      {id:'heat_warning',kind:'warning',label:'Non superare la velocità 2. Ferma la macchina se l’impasto si strappa, si avvolge troppo sul gancio o supera circa 26 °C.'},
      {id:'window',kind:'check',label:'11. Controlla elasticità e prova del velo.',success_criteria:'Impasto più liscio, elastico e capace di formare un velo senza strapparsi subito.'},
      {id:'temperature',kind:'check',label:`12. Controlla una temperatura finale vicina a ${plan.target_dough_temperature_c||24} °C.`,success_criteria:'Indicativamente 22–26 °C.'}
    ],{appliance:'DCG KM1401R',speed_min:1,speed_max:2}),
    phase('session_bulk','fermentation','Puntata','Prima fermentazione dell’impasto.',plan.bulk_fermentation_minutes,'Avviare fermentazione e rilassamento dell’impasto.','Questa fase sviluppa struttura, aromi e gas',[
      {id:'transfer',kind:'action',label:'1. Trasferisci l’impasto nel contenitore leggermente unto.'},
      {id:'cover',kind:'action',label:'2. Copri bene il contenitore.'},
      {id:'bulk_timer',kind:'timer',label:`3. Lascia fermentare ${plan.bulk_fermentation_minutes} minuti.`,seconds:plan.bulk_fermentation_minutes*60},
      {id:'bulk_check',kind:'check',label:'4. Controlla lo sviluppo.',success_criteria:'Impasto più rilassato e aumentato di volume, senza segni di collasso.'}
    ])
  ];
  if(plan.cold_fermentation_minutes>0){phases.push(phase('session_cold','fermentation','Fermentazione in frigorifero','Maturazione controllata a freddo.',plan.cold_fermentation_minutes,'Rallentare la fermentazione e sviluppare aroma.','Il freddo rende la gestione più prevedibile',[
    {id:'refrigerate',kind:'action',label:'Metti il contenitore ben coperto in frigorifero.'},
    {id:'cold_timer',kind:'timer',label:`Lascia in frigo per circa ${(plan.cold_fermentation_minutes/60).toFixed(1)} ore.`,seconds:plan.cold_fermentation_minutes*60},
    {id:'cold_check',kind:'check',label:'Controlla che l’impasto sia vivo ma non collassato.',success_criteria:'Volume aumentato e superficie ancora sostenuta.'}
  ]));}
  phases.push(
    phase('session_proof','fermentation','Formatura e appretto','Forma o stendi senza sgonfiare eccessivamente.',plan.final_proof_minutes,'Preparare l’impasto alla cottura.','L’appretto permette l’ultimo sviluppo prima del forno',[
      {id:'shape',kind:'action',label:'Forma o stendi delicatamente l’impasto.'},
      {id:'proof_timer',kind:'timer',label:`Lascia in appretto ${plan.final_proof_minutes} minuti.`,seconds:plan.final_proof_minutes*60},
      {id:'proof_check',kind:'check',label:'Controlla che l’impasto sia rilassato e leggermente gonfio.',success_criteria:'Risponde al tocco lentamente senza sgonfiarsi.'}
    ]),
    phase('session_bake','baking',`Cottura con ${ovenLabel}`,'Preriscalda, inforna e controlla il risultato.',(plan.preheat_minutes||30)+(plan.bake_minutes||15),'Cuocere fondo, struttura e superficie in modo uniforme.','Il preriscaldamento completo stabilizza la temperatura reale',[
      {id:'set_oven',kind:'action',label:`1. Imposta ${ovenLabel} a ${plan.oven_temperature_c} °C.`},
      {id:'preheat_timer',kind:'timer',label:`2. Preriscalda per ${plan.preheat_minutes||30} minuti.`,seconds:(plan.preheat_minutes||30)*60},
      {id:'preheat_check',kind:'check',label:'3. Verifica che il preriscaldamento sia completato.'},
      {id:'load_oven',kind:'action',label:'4. Inforna nella posizione prevista dalla sessione.'},
      {id:'bake_timer',kind:'timer',label:`5. Cuoci per circa ${plan.bake_minutes||15} minuti.`,seconds:(plan.bake_minutes||15)*60},
      {id:'bake_check',kind:'check',label:'6. Controlla la cottura.',success_criteria:'Fondo dorato, superficie ben colorita e struttura cotta.'}
    ],{appliance:ovenLabel}),
    phase('session_finish','finishing','Riposo e valutazione','Lascia assestare e registra il risultato.',5,'Concludere la sessione e raccogliere dati utili.','Il feedback alimenterà il Laboratorio e le correzioni future',[
      {id:'rest',kind:'timer',label:'Lascia assestare prima del taglio.',seconds:180},
      {id:'photo',kind:'photo',label:'Scatta una foto del risultato finale.'},
      {id:'evaluate',kind:'check',label:'Valuta fondo, struttura, alveolatura e sapore.'}
    ])
  );
  return {id:`workflow_${Date.now()}`,title:plan.title,version:2,status:'planned',context:{baking_session:true},phases,estimated_minutes:phases.reduce((sum,p)=>sum+p.estimated_minutes,0),created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
}
global.CucinaHubSessionWorkflowBuilder={build};
})(window);
