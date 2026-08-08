(function(global){
'use strict';

function number(value,label){
  const parsed=Number(value);
  if(!Number.isFinite(parsed))throw new Error(`${label} non valida.`);
  return parsed;
}

function classify(fridgeTemperatureC){
  if(fridgeTemperatureC<=2.5)return{
    classification:'very_cold',classification_label:'molto freddo',
    explanation:'Il frigorifero molto freddo rallenta nettamente la fermentazione. Serve più tempo a freddo e un controllo accurato dello sviluppo dopo l’uscita.',
    storage_instruction:'Usa una zona stabile del frigorifero, lontana dalla parete posteriore e dalle bocchette più fredde.',
    exit_instruction:'All’uscita controlla prima volume e tensione: se l’impasto è ancora molto rigido, lascialo rilassare prima della formatura.',
    check_instruction:'L’impasto deve mostrare attività, ma può risultare più compatto e meno espanso rispetto a un frigo a 4 °C.'
  };
  if(fridgeTemperatureC<3.5)return{
    classification:'cold',classification_label:'freddo',
    explanation:'Il frigorifero è leggermente più freddo del riferimento e rallenta la fermentazione.',
    storage_instruction:'Mantieni il contenitore ben coperto in una zona con temperatura stabile.',
    exit_instruction:'Verifica elasticità e sviluppo prima di procedere alla formatura.',
    check_instruction:'L’impasto deve essere vivo e sostenuto, anche se meno gonfio del previsto.'
  };
  if(fridgeTemperatureC<=5)return{
    classification:'balanced',classification_label:'regolare',
    explanation:'La temperatura è vicina al riferimento di 4 °C: la durata prevista non richiede correzioni importanti.',
    storage_instruction:'Mantieni il contenitore ben coperto e lontano da forti sbalzi di temperatura.',
    exit_instruction:'Procedi con il normale controllo di volume e struttura.',
    check_instruction:'Volume aumentato, superficie sostenuta e nessun segno di collasso.'
  };
  if(fridgeTemperatureC<=7)return{
    classification:'warm',classification_label:'caldo',
    explanation:'Il frigorifero è più caldo del riferimento e l’impasto continua a fermentare più rapidamente.',
    storage_instruction:'Usa la zona più fredda e stabile del frigorifero, evitando sportello e ripiani alti.',
    exit_instruction:'Controlla l’impasto prima del termine previsto se appare molto gonfio.',
    check_instruction:'La superficie deve restare sostenuta: riduci la permanenza se compaiono forte rilassamento o bolle molto grandi.'
  };
  return{
    classification:'very_warm',classification_label:'molto caldo',
    explanation:'La temperatura è alta per una fermentazione controllata a freddo: aumenta il rischio di sovrafermentazione.',
    storage_instruction:'Sposta il contenitore nella zona più fredda disponibile e verifica che il frigorifero sia regolato correttamente.',
    exit_instruction:'Effettua un controllo anticipato e non aspettare il timer se l’impasto è già molto espanso o fragile.',
    check_instruction:'Interrompi la fase a freddo se l’impasto perde tensione, si affloscia o mostra segni di collasso.'
  };
}

function calculate(options){
  const fridgeTemperatureC=number(options?.fridgeTemperatureC,'Temperatura frigorifero');
  const referenceTemperatureC=number(options?.referenceTemperatureC??4,'Temperatura di riferimento');
  const baselineMinutes=Math.max(0,Math.round(number(options?.coldFermentationMinutes??0,'Durata fermentazione a freddo')));
  if(fridgeTemperatureC<-5||fridgeTemperatureC>20)throw new Error('La temperatura frigorifero deve essere compresa tra -5 e 20 °C.');
  const operational=classify(fridgeTemperatureC);
  const warnings=[];
  if(baselineMinutes===0){
    return{
      version:1,applied:false,fridge_temperature_c:fridgeTemperatureC,reference_temperature_c:referenceTemperatureC,
      classification:operational.classification,classification_label:operational.classification_label,
      baseline_minutes:0,corrected_minutes:0,change_minutes:0,activity_factor:1,
      explanation:'La sessione non prevede una fermentazione in frigorifero, quindi non viene applicata alcuna correzione.',
      operational,warnings,note:'La correzione frigorifero si applica solo alle sessioni con fase a freddo.'
    };
  }
  const rawFactor=Math.pow(2,(fridgeTemperatureC-referenceTemperatureC)/10);
  const activityFactor=Math.min(1.35,Math.max(.75,rawFactor));
  const correctedMinutes=Math.max(240,Math.round((baselineMinutes/activityFactor)/5)*5);
  if(fridgeTemperatureC>=8)warnings.push('Temperatura frigorifero elevata: verifica la regolazione dell’elettrodomestico e controlla l’impasto prima del termine.');
  if(fridgeTemperatureC<=1)warnings.push('Temperatura molto bassa: evita zone che rischiano di congelare parzialmente l’impasto.');
  return{
    version:1,applied:true,fridge_temperature_c:fridgeTemperatureC,reference_temperature_c:referenceTemperatureC,
    classification:operational.classification,classification_label:operational.classification_label,
    baseline_minutes:baselineMinutes,corrected_minutes:correctedMinutes,change_minutes:correctedMinutes-baselineMinutes,
    activity_factor:+activityFactor.toFixed(3),explanation:operational.explanation,operational,warnings,
    note:'La correzione modifica soltanto la durata della fase a freddo e le istruzioni operative. Acqua, idratazione, sale e lievito restano invariati.'
  };
}

function validate(correction){
  const errors=[];
  if(!correction||!Number.isFinite(Number(correction.fridge_temperature_c)))errors.push('Correzione frigorifero assente o non valida.');
  if(Number(correction.corrected_minutes)<0)errors.push('Durata corretta non valida.');
  if(correction?.applied&&Number(correction.baseline_minutes)<=0)errors.push('La correzione non può essere applicata senza una fase a freddo.');
  if(!correction?.operational?.storage_instruction)errors.push('Istruzioni di conservazione mancanti.');
  return{valid:errors.length===0,errors};
}

global.CucinaHubFridgeCorrectionEngine={calculate,validate};
})(window);
