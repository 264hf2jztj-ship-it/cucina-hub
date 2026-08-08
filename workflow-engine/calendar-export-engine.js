(function(global){
'use strict';

const MINUTE_MS=60000;
const DEFAULT_SHORTCUT_NAME='Cucina Hub Calendario';
let lastCalendar=null;

function asDate(value,label){
  const date=value instanceof Date?new Date(value.getTime()):new Date(value);
  if(Number.isNaN(date.getTime()))throw new Error(`${label||'Data'} non valida.`);
  return date;
}

function escapeIcs(value){
  return String(value??'')
    .replace(/\\/g,'\\\\')
    .replace(/\r?\n/g,'\\n')
    .replace(/,/g,'\\,')
    .replace(/;/g,'\\;');
}

function safeFilename(value){
  const cleaned=String(value||'timeline-cucina-hub')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  return `${cleaned||'timeline-cucina-hub'}.ics`;
}

function utcStamp(value){
  return asDate(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
}

function phaseEvents(schedule,phaseId){
  return (schedule?.events||[]).filter(event=>event.source_phase_id===phaseId);
}

function firstStart(events){
  if(!events.length)return null;
  return new Date(Math.min(...events.map(event=>asDate(event.start_at).getTime()))).toISOString();
}

function lastEnd(events){
  if(!events.length)return null;
  return new Date(Math.max(...events.map(event=>asDate(event.end_at).getTime()))).toISOString();
}

function addMilestone(list,{id,title,at,description,alertMinutes=5,durationMinutes=10}){
  if(!at)return;
  list.push({
    id,
    title,
    at:asDate(at).toISOString(),
    description,
    alert_minutes:Math.max(0,Number(alertMinutes)||0),
    duration_minutes:Math.max(1,Number(durationMinutes)||10)
  });
}

function buildMilestones(schedule,options={}){
  if(!schedule||!Array.isArray(schedule.events))throw new Error('Timeline assente o non valida.');
  const sessionTitle=String(options.title||'Sessione Cucina Hub');
  const milestones=[];
  const bulk=phaseEvents(schedule,'session_bulk');
  const cold=phaseEvents(schedule,'session_cold');
  const proof=phaseEvents(schedule,'session_proof');
  const preheat=(schedule.events||[]).find(event=>event.kind==='preheat');
  const bake=(schedule.events||[]).find(event=>event.kind==='bake');

  addMilestone(milestones,{
    id:'start',
    title:`Inizia — ${sessionTitle}`,
    at:schedule.start_at,
    description:'Avvia la preparazione secondo la timeline generata da Cucina Hub.',
    alertMinutes:15
  });

  if(cold.length){
    addMilestone(milestones,{
      id:'cold_in',
      title:'Fine puntata — metti l’impasto in frigorifero',
      at:firstStart(cold)||lastEnd(bulk),
      description:'Controlla sviluppo e superficie, quindi inserisci il contenitore ben coperto nella zona indicata del frigorifero.',
      alertMinutes:5
    });
    addMilestone(milestones,{
      id:'cold_out',
      title:'Togli l’impasto dal frigorifero',
      at:lastEnd(cold),
      description:'Controlla volume, tensione e stato dell’impasto prima di proseguire con formatura e appretto.',
      alertMinutes:15
    });
  }else if(bulk.length){
    addMilestone(milestones,{
      id:'bulk_end',
      title:'Controlla fine puntata',
      at:lastEnd(bulk),
      description:'Verifica volume, rilassamento e superficie prima di procedere alla fase successiva.',
      alertMinutes:5
    });
  }

  if(preheat){
    addMilestone(milestones,{
      id:'preheat',
      title:`Avvia ${preheat.title}`,
      at:preheat.start_at,
      description:'Inizia il preriscaldamento previsto dalla timeline. Può sovrapporsi alla parte finale dell’appretto.',
      alertMinutes:10
    });
  }

  if(bake){
    addMilestone(milestones,{
      id:'bake',
      title:`Inforna — ${sessionTitle}`,
      at:bake.start_at,
      description:`Controlla prima la fine dell’appretto: ${proof.length?'l’impasto deve essere rilassato e leggermente gonfio. ':''}Poi inforna secondo la Sessione Guidata.`,
      alertMinutes:5
    });
  }

  addMilestone(milestones,{
    id:'meal',
    title:`Pronto da servire — ${sessionTitle}`,
    at:schedule.target_at,
    description:'Orario obiettivo del pasto impostato nel Wizard di Cucina Hub.',
    alertMinutes:0
  });

  return milestones.sort((a,b)=>asDate(a.at)-asDate(b.at));
}

function eventLines(milestone,index,options){
  const start=asDate(milestone.at);
  const end=new Date(start.getTime()+milestone.duration_minutes*MINUTE_MS);
  const uidBase=String(options.uidBase||options.workflowId||'cucina-hub').replace(/[^a-zA-Z0-9._-]/g,'-');
  const lines=[
    'BEGIN:VEVENT',
    `UID:${escapeIcs(`${uidBase}-${milestone.id}-${index}@cucina-hub`)}`,
    `DTSTAMP:${utcStamp(options.generatedAt||new Date())}`,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(end)}`,
    `SUMMARY:${escapeIcs(milestone.title)}`,
    `DESCRIPTION:${escapeIcs(milestone.description)}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'BEGIN:VALARM',
    `TRIGGER:${milestone.alert_minutes>0?`-PT${milestone.alert_minutes}M`:'PT0M'}`,
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcs(milestone.title)}`,
    'END:VALARM',
    'END:VEVENT'
  ];
  return lines;
}

function validate(calendar){
  const errors=[];
  if(!calendar?.content?.startsWith('BEGIN:VCALENDAR'))errors.push('Intestazione VCALENDAR mancante.');
  if(!calendar?.content?.includes('END:VCALENDAR'))errors.push('Chiusura VCALENDAR mancante.');
  if(!Array.isArray(calendar?.milestones)||calendar.milestones.length===0)errors.push('Nessun promemoria calendario generato.');
  const eventCount=(calendar?.content?.match(/BEGIN:VEVENT/g)||[]).length;
  if(eventCount!==calendar?.milestones?.length)errors.push('Il numero di eventi non corrisponde ai promemoria generati.');
  if((calendar?.content?.match(/BEGIN:VALARM/g)||[]).length!==eventCount)errors.push('Uno o più eventi non hanno un avviso.');
  return{valid:errors.length===0,errors};
}

function buildShortcutPayload(calendar,options={}){
  const validation=validate(calendar);
  if(!validation.valid)throw new Error(validation.errors.join(' '));
  const events=calendar.milestones.map(milestone=>{
    const start=asDate(milestone.at);
    const end=new Date(start.getTime()+milestone.duration_minutes*MINUTE_MS);
    return{
      id:milestone.id,
      title:milestone.title,
      start:start.toISOString(),
      end:end.toISOString(),
      notes:milestone.description,
      alert:milestone.alert_minutes
    };
  });
  return{
    version:1,
    source:'Cucina Hub',
    session_title:String(options.title||calendar.title||'Sessione Cucina Hub'),
    generated_at:new Date().toISOString(),
    events
  };
}

function validateShortcutPayload(payload){
  const errors=[];
  if(!payload||!Array.isArray(payload.events)||payload.events.length===0)errors.push('Payload del Comando Rapido senza eventi.');
  for(const event of payload?.events||[]){
    if(!event.title)errors.push('Titolo evento mancante.');
    try{
      const start=asDate(event.start),end=asDate(event.end);
      if(end<=start)errors.push(`Intervallo non valido per ${event.title||event.id}.`);
    }catch(error){errors.push(error.message)}
  }
  return{valid:errors.length===0,errors};
}

function buildShortcutUrl(calendar,options={}){
  const shortcutName=String(options.shortcutName||DEFAULT_SHORTCUT_NAME);
  const payload=buildShortcutPayload(calendar,{title:options.title});
  const validation=validateShortcutPayload(payload);
  if(!validation.valid)throw new Error(validation.errors.join(' '));
  const text=JSON.stringify(payload);
  const transport=options.transport==='text'?'text':'clipboard';
  const base=`shortcuts://run-shortcut?name=${encodeURIComponent(shortcutName)}`;
  const url=transport==='clipboard'
    ?`${base}&input=clipboard`
    :`${base}&input=text&text=${encodeURIComponent(text)}`;
  return{shortcut_name:shortcutName,payload,text,transport,url};
}

function isAppleMobile(){
  const navigator=global.navigator||{};
  const userAgent=String(navigator.userAgent||'');
  return /iPhone|iPad|iPod/i.test(userAgent)||(navigator.platform==='MacIntel'&&Number(navigator.maxTouchPoints)>1);
}

function updateWizardStatus(text,kind='ok'){
  const status=global.document?.querySelector?.('#status');
  if(!status)return;
  status.className=kind;
  status.textContent=text;
}

function copyTextSynchronously(text){
  const document=global.document;
  if(!document?.body||typeof document.execCommand!=='function')return false;
  const area=document.createElement('textarea');
  area.value=text;
  area.setAttribute('readonly','');
  area.style.position='fixed';
  area.style.opacity='0';
  area.style.pointerEvents='none';
  area.style.left='-9999px';
  document.body.appendChild(area);
  area.focus();
  area.select();
  area.setSelectionRange(0,area.value.length);
  let copied=false;
  try{copied=document.execCommand('copy')}catch(error){copied=false}
  area.remove();
  return copied;
}

async function copyShortcutInput(text){
  if(copyTextSynchronously(text))return{method:'execCommand'};
  if(global.navigator?.clipboard?.writeText){
    await global.navigator.clipboard.writeText(text);
    return{method:'clipboard-api'};
  }
  throw new Error('Il browser non consente di copiare i dati negli appunti. Usa il file .ics come alternativa.');
}

async function runShortcut(calendar,options={}){
  const shortcut=buildShortcutUrl(calendar,{...options,transport:'clipboard'});
  updateWizardStatus('Preparo i dati della timeline negli appunti…','ok');
  const copied=await copyShortcutInput(shortcut.text);
  updateWizardStatus(`Apro il Comando Rapido “${shortcut.shortcut_name}”…`,'ok');
  global.location.href=shortcut.url;
  global.setTimeout(()=>{
    if(!global.document?.hidden)updateWizardStatus('Comando Rapido avviato. Se non è installato, apri “CONFIGURA COMANDO RAPIDO”.','ok');
  },500);
  return{
    mode:'shortcut',
    transport:'clipboard',
    clipboard_method:copied.method,
    shortcut_name:shortcut.shortcut_name,
    event_count:shortcut.payload.events.length,
    url_length:shortcut.url.length
  };
}

async function downloadIcs(calendar){
  const validation=validate(calendar);
  if(!validation.valid)throw new Error(validation.errors.join(' '));
  const blob=new Blob([calendar.content],{type:calendar.mime_type});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download=calendar.filename;
  anchor.style.display='none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
  return{mode:'downloaded'};
}

async function shareIcs(calendar){
  const validation=validate(calendar);
  if(!validation.valid)throw new Error(validation.errors.join(' '));
  const file=new File([calendar.content],calendar.filename,{type:calendar.mime_type});
  if(global.navigator?.share&&global.navigator?.canShare&&global.navigator.canShare({files:[file]})){
    try{
      await global.navigator.share({title:'Timeline Cucina Hub',text:'Aggiungi gli avvisi della sessione al calendario.',files:[file]});
      return{mode:'shared'};
    }catch(error){
      if(error?.name==='AbortError')return{mode:'cancelled'};
    }
  }
  return downloadIcs(calendar);
}

async function shareOrDownload(calendar){
  if(isAppleMobile())return runShortcut(calendar);
  return shareIcs(calendar);
}

function enhanceWizardUi(){
  const document=global.document;
  const button=document?.querySelector?.('#calendar');
  if(!button||button.dataset.shortcutEnhanced==='true')return;
  button.dataset.shortcutEnhanced='true';
  button.textContent='AGGIUNGI DIRETTAMENTE';
  button.title=`Esegue il Comando Rapido “${DEFAULT_SHORTCUT_NAME}”`;

  const actions=button.parentElement;
  if(actions){
    const setup=document.createElement('a');
    setup.id='shortcutSetup';
    setup.className='button secondary';
    setup.href='../workflow-engine/apple-shortcut-setup.html?v=2';
    setup.target='_blank';
    setup.rel='noopener';
    setup.textContent='CONFIGURA COMANDO RAPIDO';

    const fallback=document.createElement('button');
    fallback.id='calendarIcs';
    fallback.className='secondary';
    fallback.type='button';
    fallback.textContent='SCARICA FILE .ICS';
    fallback.onclick=async()=>{
      try{
        if(!lastCalendar)throw new Error('Genera prima la sessione.');
        await downloadIcs(lastCalendar);
        updateWizardStatus('File .ics scaricato come alternativa di emergenza.','ok');
      }catch(error){
        updateWizardStatus('Download calendario non riuscito: '+error.message,'error');
      }
    };

    button.insertAdjacentElement('afterend',setup);
    setup.insertAdjacentElement('afterend',fallback);
    const mirrorVisibility=()=>{setup.hidden=button.hidden;fallback.hidden=button.hidden};
    mirrorVisibility();
    new MutationObserver(mirrorVisibility).observe(button,{attributes:true,attributeFilter:['hidden']});
  }

  const info=document.querySelector('#calendarInfo');
  if(info)info.innerHTML=`<strong>Aggiunta diretta su iPhone e iPad</strong><br><span class="muted">Cucina Hub copia temporaneamente i dati della timeline negli appunti e avvia il Comando Rapido “${DEFAULT_SHORTCUT_NAME}”. Il file .ics resta disponibile come riserva.</span>`;
}

function scheduleUiEnhancement(){
  if(!global.document)return;
  global.setTimeout(enhanceWizardUi,0);
}

function build(options){
  const schedule=options?.schedule;
  const title=String(options?.title||'Sessione Cucina Hub');
  const milestones=buildMilestones(schedule,{title});
  if(!milestones.length)throw new Error('Nessun evento disponibile per il calendario.');
  const generatedAt=options?.generatedAt?asDate(options.generatedAt):new Date();
  const lines=[
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'PRODID:-//Cucina Hub//Timeline intelligente//IT',
    `X-WR-CALNAME:${escapeIcs(title)}`
  ];
  milestones.forEach((milestone,index)=>lines.push(...eventLines(milestone,index,{workflowId:schedule.workflow_id,uidBase:options?.uidBase,generatedAt})));
  lines.push('END:VCALENDAR');
  const calendar={
    version:3,
    title,
    filename:safeFilename(title),
    mime_type:'text/calendar;charset=utf-8',
    content:lines.join('\r\n')+'\r\n',
    milestones,
    shortcut:{name:DEFAULT_SHORTCUT_NAME,event_count:milestones.length,transport:'clipboard'}
  };
  lastCalendar=calendar;
  scheduleUiEnhancement();
  return calendar;
}

global.CucinaHubCalendarExportEngine={
  buildMilestones,build,validate,
  buildShortcutPayload,validateShortcutPayload,buildShortcutUrl,
  copyShortcutInput,runShortcut,downloadIcs,shareIcs,shareOrDownload,
  enhanceWizardUi,isAppleMobile,
  DEFAULT_SHORTCUT_NAME
};

if(global.document){
  if(global.document.readyState==='loading')global.document.addEventListener('DOMContentLoaded',scheduleUiEnhancement,{once:true});
  else scheduleUiEnhancement();
}
})(window);
