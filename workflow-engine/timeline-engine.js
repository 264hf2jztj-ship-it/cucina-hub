(function(global){
'use strict';

const MINUTE_MS=60000;

function asDate(value,label){
  const date=value instanceof Date?new Date(value.getTime()):new Date(value);
  if(Number.isNaN(date.getTime()))throw new Error(`${label||'Data'} non valida.`);
  return date;
}

function positiveMinutes(value,fallback=0){
  const minutes=Number(value);
  return Number.isFinite(minutes)&&minutes>0?minutes:fallback;
}

function activityMinutes(phase,activityId,fallback=0){
  const activity=(phase.activities||[]).find(item=>item.id===activityId);
  return activity&&Number.isFinite(Number(activity.seconds))?Math.max(0,Number(activity.seconds)/60):fallback;
}

function attentionFor(phase,forced){
  if(forced)return forced;
  if(phase.metadata?.attention)return phase.metadata.attention;
  if(phase.type==='fermentation')return 'passive';
  if(phase.type==='resting')return 'passive';
  return 'active';
}

function makeEvent({id,title,phase,start,end,attention,parallel=false,kind='phase',note=null}){
  const duration=Math.max(0,(end-start)/MINUTE_MS);
  return {
    id,
    title,
    source_phase_id:phase?.id||null,
    phase_type:phase?.type||kind,
    kind,
    start_at:start.toISOString(),
    end_at:end.toISOString(),
    duration_minutes:+duration.toFixed(2),
    attention:attentionFor(phase,attention),
    parallel,
    note
  };
}

function scheduleSequentialBackwards(phases,cursor,events){
  let current=new Date(cursor.getTime());
  for(let index=phases.length-1;index>=0;index--){
    const phase=phases[index];
    const minutes=positiveMinutes(phase.estimated_minutes,0);
    const start=new Date(current.getTime()-minutes*MINUTE_MS);
    events.push(makeEvent({
      id:phase.id,
      title:phase.title,
      phase,
      start,
      end:current,
      kind:'phase'
    }));
    current=start;
  }
  return current;
}

function getBakeParts(phase){
  const metadata=phase.metadata||{};
  const preheat=positiveMinutes(metadata.preheat_minutes,activityMinutes(phase,'preheat_timer',0));
  const bake=positiveMinutes(metadata.bake_minutes,activityMinutes(phase,'bake_timer',0));
  const total=positiveMinutes(phase.estimated_minutes,preheat+bake);
  if(preheat>0&&bake>0)return{preheat,bake};
  if(total>0)return{preheat:0,bake:total};
  throw new Error('La fase di cottura non contiene durate utilizzabili.');
}

function build(options){
  const workflow=options?.workflow;
  if(!workflow||!Array.isArray(workflow.phases)||workflow.phases.length===0)throw new Error('Workflow non valido per la timeline.');
  const targetAt=asDate(options.targetAt,'Orario del pasto');
  const now=options.now?asDate(options.now,'Ora corrente'):new Date();
  const phases=workflow.phases;
  const bakeIndex=phases.findIndex(phase=>phase.id==='session_bake'||phase.type==='baking');
  if(bakeIndex<0)throw new Error('Workflow senza fase di cottura.');

  const beforeBake=phases.slice(0,bakeIndex);
  const bakePhase=phases[bakeIndex];
  const afterBake=phases.slice(bakeIndex+1);
  const events=[];

  let cursor=new Date(targetAt.getTime());
  cursor=scheduleSequentialBackwards(afterBake,cursor,events);

  const parts=getBakeParts(bakePhase);
  const bakeEnd=new Date(cursor.getTime());
  const bakeStart=new Date(bakeEnd.getTime()-parts.bake*MINUTE_MS);
  events.push(makeEvent({
    id:`${bakePhase.id}:bake`,
    title:bakePhase.metadata?.bake_title||`Cottura — ${bakePhase.title}`,
    phase:bakePhase,
    start:bakeStart,
    end:bakeEnd,
    attention:'active',
    kind:'bake'
  }));

  if(parts.preheat>0){
    const preheatStart=new Date(bakeStart.getTime()-parts.preheat*MINUTE_MS);
    events.push(makeEvent({
      id:`${bakePhase.id}:preheat`,
      title:bakePhase.metadata?.preheat_title||`Preriscaldamento — ${bakePhase.title}`,
      phase:bakePhase,
      start:preheatStart,
      end:bakeStart,
      attention:'passive',
      parallel:true,
      kind:'preheat',
      note:'Può svolgersi in parallelo con la parte finale dell’appretto.'
    }));
  }

  cursor=scheduleSequentialBackwards(beforeBake,bakeStart,events);
  events.sort((a,b)=>new Date(a.start_at)-new Date(b.start_at)||new Date(a.end_at)-new Date(b.end_at));

  const scheduleStart=events.reduce((earliest,event)=>{
    const value=new Date(event.start_at);
    return !earliest||value<earliest?value:earliest;
  },null)||new Date(targetAt.getTime());
  const totalEventMinutes=events.reduce((sum,event)=>sum+event.duration_minutes,0);
  const spanMinutes=Math.max(0,(targetAt-scheduleStart)/MINUTE_MS);
  const activeMinutes=events.filter(event=>event.attention==='active').reduce((sum,event)=>sum+event.duration_minutes,0);
  const passiveMinutes=events.filter(event=>event.attention==='passive').reduce((sum,event)=>sum+event.duration_minutes,0);
  const overlapMinutes=Math.max(0,totalEventMinutes-spanMinutes);
  const warnings=[];
  if(scheduleStart<now)warnings.push('La preparazione dovrebbe essere già iniziata: scegli un orario più avanti o riduci i tempi previsti.');
  if(targetAt<=now)warnings.push('L’orario del pasto deve essere futuro.');

  return {
    version:1,
    workflow_id:workflow.id||null,
    target_at:targetAt.toISOString(),
    start_at:scheduleStart.toISOString(),
    events,
    summary:{
      span_minutes:+spanMinutes.toFixed(2),
      active_minutes:+activeMinutes.toFixed(2),
      passive_minutes:+passiveMinutes.toFixed(2),
      overlap_minutes:+overlapMinutes.toFixed(2),
      event_count:events.length
    },
    warnings
  };
}

function phaseWindow(schedule,phaseId){
  const matches=(schedule?.events||[]).filter(event=>event.source_phase_id===phaseId);
  if(!matches.length)return null;
  const start=matches.reduce((value,event)=>Math.min(value,new Date(event.start_at).getTime()),Infinity);
  const end=matches.reduce((value,event)=>Math.max(value,new Date(event.end_at).getTime()),-Infinity);
  return {start_at:new Date(start).toISOString(),end_at:new Date(end).toISOString(),events:matches};
}

function validate(schedule){
  if(!schedule||!Array.isArray(schedule.events))return{valid:false,errors:['Timeline assente o non valida.']};
  const errors=[];
  for(const event of schedule.events){
    const start=new Date(event.start_at),end=new Date(event.end_at);
    if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))errors.push(`Date non valide per ${event.title||event.id}.`);
    else if(end<=start)errors.push(`Intervallo non valido per ${event.title||event.id}.`);
  }
  const target=new Date(schedule.target_at);
  if(Number.isNaN(target.getTime()))errors.push('Orario obiettivo non valido.');
  return{valid:errors.length===0,errors};
}

global.CucinaHubTimelineEngine={build,phaseWindow,validate};
})(window);
