(function(global){
'use strict';

const MINUTE_MS=60000;

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
  list.push({id,title,at:asDate(at).toISOString(),description,alert_minutes:Math.max(0,Number(alertMinutes)||0),duration_minutes:Math.max(1,Number(durationMinutes)||10)});
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
    'TRANSP:OPAQUE'
  ];
  lines.push('BEGIN:VALARM');
  lines.push(`TRIGGER:${milestone.alert_minutes>0?`-PT${milestone.alert_minutes}M`:'PT0M'}`);
  lines.push('ACTION:DISPLAY');
  lines.push(`DESCRIPTION:${escapeIcs(milestone.title)}`);
  lines.push('END:VALARM');
  lines.push('END:VEVENT');
  return lines;
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
  return{
    version:1,
    filename:safeFilename(title),
    mime_type:'text/calendar;charset=utf-8',
    content:lines.join('\r\n')+'\r\n',
    milestones
  };
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

async function shareOrDownload(calendar){
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
  const blob=new Blob([calendar.content],{type:calendar.mime_type});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;anchor.download=calendar.filename;anchor.style.display='none';
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
  return{mode:'downloaded'};
}

global.CucinaHubCalendarExportEngine={buildMilestones,build,validate,shareOrDownload};
})(window);
