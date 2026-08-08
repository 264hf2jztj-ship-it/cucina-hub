(function(global){
'use strict';

function finiteNumber(value,label){
  const number=Number(value);
  if(!Number.isFinite(number))throw new Error(`${label} non valida.`);
  return number;
}

function profileFor(relativeHumidityPercent){
  if(relativeHumidityPercent<=35)return{
    classification:'very_dry',classification_label:'molto secco',surface_risk:'alto',condensation_risk:'basso',monitor_mid_phase:true,
    explanation:'L’aria molto secca accelera l’evaporazione dalla superficie e può creare una pelle che limita lo sviluppo dell’impasto.',
    covering_strategy:'Usa un contenitore con coperchio ben chiuso; evita canovacci e correnti d’aria.',
    handling_strategy:'Ungi appena contenitore e mani e riduci al minimo il tempo in cui l’impasto resta scoperto.',
    bulk_instruction:'Durante la puntata mantieni il contenitore chiuso e controlla a metà fase che la superficie sia ancora morbida e leggermente lucida.',
    proof_instruction:'Durante l’appretto copri immediatamente panetti o teglia e limita le manipolazioni all’aria.',
    mid_phase_check:'Controlla la superficie: non deve essere opaca, tesa o screpolata. Se tende a seccarsi, nebulizza leggermente il coperchio o le pareti del contenitore, non versare acqua sull’impasto.',
    final_check:'La superficie deve restare elastica, senza pelle o crepe.'
  };
  if(relativeHumidityPercent<46)return{
    classification:'dry',classification_label:'secco',surface_risk:'medio',condensation_risk:'basso',monitor_mid_phase:false,
    explanation:'L’aria secca aumenta moderatamente il rischio di disidratazione superficiale.',
    covering_strategy:'Usa un coperchio ben aderente e tieni l’impasto lontano da correnti d’aria.',
    handling_strategy:'Tieni pronti mani leggermente unte e spatola; scopri l’impasto solo per il tempo necessario.',
    bulk_instruction:'Durante la puntata lascia il contenitore coperto e controlla la superficie negli ultimi 20–30 minuti.',
    proof_instruction:'Durante l’appretto mantieni una copertura continua, soprattutto dopo la formatura.',
    mid_phase_check:null,
    final_check:'La superficie deve essere morbida e non deve formare una pellicola asciutta.'
  };
  if(relativeHumidityPercent<=65)return{
    classification:'balanced',classification_label:'equilibrato',surface_risk:'basso',condensation_risk:'basso',monitor_mid_phase:false,
    explanation:'L’umidità è nella fascia di riferimento: non serve modificare acqua, lievito o durata della fermentazione.',
    covering_strategy:'Usa il normale coperchio del contenitore e mantieni l’impasto coperto tra una lavorazione e l’altra.',
    handling_strategy:'Gestisci l’impasto normalmente con spatola e mani appena unte se necessario.',
    bulk_instruction:'Mantieni il contenitore coperto per tutta la puntata.',
    proof_instruction:'Copri panetti o teglia durante l’appretto senza sigillare in modo eccessivo.',
    mid_phase_check:null,
    final_check:'La superficie deve essere morbida, uniforme e senza condensa eccessiva.'
  };
  if(relativeHumidityPercent<=75)return{
    classification:'humid',classification_label:'umido',surface_risk:'basso',condensation_risk:'medio',monitor_mid_phase:false,
    explanation:'L’aria umida limita l’essiccazione superficiale ma può aumentare appiccicosità e condensa.',
    covering_strategy:'Mantieni il contenitore coperto, controllando che il coperchio non faccia gocciolare condensa sull’impasto.',
    handling_strategy:'Usa mani leggermente unte e spatola; non aggiungere farina solo perché l’impasto sembra più appiccicoso.',
    bulk_instruction:'Durante la puntata controlla la condensa sul coperchio verso la fine della fase e asciugala se forma gocce.',
    proof_instruction:'Durante l’appretto mantieni coperto, ma evita che la condensa cada sui panetti o sulla superficie.',
    mid_phase_check:null,
    final_check:'La superficie deve essere umida ma non bagnata, viscida o coperta da gocce.'
  };
  return{
    classification:'very_humid',classification_label:'molto umido',surface_risk:'basso',condensation_risk:'alto',monitor_mid_phase:true,
    explanation:'L’umidità molto alta riduce l’evaporazione e aumenta il rischio di condensa e impasto apparentemente più appiccicoso.',
    covering_strategy:'Usa un coperchio, ma controlla e asciuga l’interno se compaiono gocce; non lasciare condensa sopra l’impasto.',
    handling_strategy:'Usa spatola e mani appena unte. Evita di correggere l’appiccicosità aggiungendo farina non prevista.',
    bulk_instruction:'Durante la puntata controlla a metà fase la condensa e asciuga il coperchio se necessario.',
    proof_instruction:'Durante l’appretto evita gocce sulla superficie e limita l’olio allo stretto necessario.',
    mid_phase_check:'Controlla il coperchio e la superficie: asciuga eventuali gocce, ma non lasciare l’impasto scoperto a lungo.',
    final_check:'La superficie deve restare sostenuta e umida, senza ristagni o condensa che gocciola.'
  };
}

function calculate(options){
  const relativeHumidityPercent=finiteNumber(options?.relativeHumidityPercent,'Umidità relativa');
  const referenceHumidityPercent=finiteNumber(options?.referenceHumidityPercent??55,'Umidità di riferimento');
  if(relativeHumidityPercent<0||relativeHumidityPercent>100)throw new Error('L’umidità relativa deve essere compresa tra 0 e 100%.');
  if(referenceHumidityPercent<0||referenceHumidityPercent>100)throw new Error('L’umidità di riferimento deve essere compresa tra 0 e 100%.');
  const operational=profileFor(relativeHumidityPercent);
  const warnings=[];
  if(relativeHumidityPercent<=30)warnings.push('Ambiente estremamente secco: controlla anche correnti d’aria, climatizzazione e contenitori non ermetici.');
  if(relativeHumidityPercent>=85)warnings.push('Ambiente estremamente umido: controlla spesso la condensa e non compensare con farina aggiuntiva non prevista.');
  return{
    version:1,
    relative_humidity_percent:relativeHumidityPercent,
    reference_humidity_percent:referenceHumidityPercent,
    delta_percentage_points:+(relativeHumidityPercent-referenceHumidityPercent).toFixed(1),
    classification:operational.classification,
    classification_label:operational.classification_label,
    explanation:operational.explanation,
    operational,
    quantitative_adjustments:{
      water_weight_g:0,
      hydration_percent:0,
      yeast_weight_g:0,
      bulk_minutes:0,
      proof_minutes:0
    },
    note:'La correzione dell’umidità modifica le istruzioni operative, non la formula o la timeline: temperatura, farina e stato reale dell’impasto restano i riferimenti principali.',
    warnings
  };
}

function validate(correction){
  const errors=[];
  if(!correction||!Number.isFinite(Number(correction.relative_humidity_percent)))errors.push('Correzione umidità assente o non valida.');
  if(!correction?.operational?.covering_strategy)errors.push('Strategia di copertura mancante.');
  const quantitative=correction?.quantitative_adjustments||{};
  ['water_weight_g','hydration_percent','yeast_weight_g','bulk_minutes','proof_minutes'].forEach(key=>{
    if(Number(quantitative[key])!==0)errors.push(`La correzione umidità non deve modificare automaticamente ${key}.`);
  });
  return{valid:errors.length===0,errors};
}

global.CucinaHubHumidityCorrectionEngine={calculate,validate};
})(window);
