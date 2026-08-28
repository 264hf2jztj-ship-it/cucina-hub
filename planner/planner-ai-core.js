(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.CucinaHubPlannerAiCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const MAX_PERIOD_DAYS=14;
  const MAX_PROMPT_LENGTH=800;
  const MIN_PROMPT_LENGTH=3;

  function pad(value){return String(value).padStart(2,"0")}
  function formatDateParts(year,month,day){return`${year}-${pad(month)}-${pad(day)}`}

  function isRealDate(value){
    if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const [year,month,day]=value.split("-").map(Number);
    const date=new Date(Date.UTC(year,month-1,day));
    return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
  }

  function addDays(value,days){
    if(!isRealDate(value))return null;
    const [year,month,day]=value.split("-").map(Number);
    const date=new Date(Date.UTC(year,month-1,day));
    date.setUTCDate(date.getUTCDate()+Number(days||0));
    return formatDateParts(date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate());
  }

  function inclusiveDays(start,end){
    if(!isRealDate(start)||!isRealDate(end)||end<start)return null;
    const [sy,sm,sd]=start.split("-").map(Number);
    const [ey,em,ed]=end.split("-").map(Number);
    return Math.floor((Date.UTC(ey,em-1,ed)-Date.UTC(sy,sm-1,sd))/86400000)+1;
  }

  function todayLocal(date=new Date()){
    return formatDateParts(date.getFullYear(),date.getMonth()+1,date.getDate());
  }

  function defaultPeriod(date=new Date()){
    const start=todayLocal(date);
    return{period_start:start,period_end:addDays(start,6)};
  }

  function validateRequest(value={}){
    const prompt=typeof value.prompt==="string"?value.prompt.trim():"";
    const start=value.period_start;
    const end=value.period_end;
    const servings=Number(value.servings);
    const errors=[];
    if(prompt.length<MIN_PROMPT_LENGTH||prompt.length>MAX_PROMPT_LENGTH){
      errors.push(`La richiesta deve contenere tra ${MIN_PROMPT_LENGTH} e ${MAX_PROMPT_LENGTH} caratteri.`);
    }
    if(!isRealDate(start)||!isRealDate(end)){
      errors.push("Inserisci un intervallo di date valido.");
    }
    const days=inclusiveDays(start,end);
    if(days!==null&&(days<1||days>MAX_PERIOD_DAYS)){
      errors.push(`Il primo Planner AI supporta periodi da 1 a ${MAX_PERIOD_DAYS} giorni.`);
    }
    if(!Number.isInteger(servings)||servings<1||servings>20){
      errors.push("Le porzioni devono essere un intero tra 1 e 20.");
    }
    return{valid:errors.length===0,errors,normalized:{prompt,period_start:start,period_end:end,servings}};
  }

  function validateGeneratedResponse(data){
    const packet=data?.packet;
    if(!packet||packet.contract!=="cucina-hub.menu-plan"||packet.version!==1){
      return{valid:false,message:"Planner AI non ha restituito un pacchetto menu-plan v1."};
    }
    const guardrails=packet.guardrails;
    if(guardrails?.preview_only!==true||guardrails?.automatic_save!==false||guardrails?.requires_user_confirmation!==true){
      return{valid:false,message:"Il pacchetto non rispetta i guardrail obbligatori del Planner."};
    }
    if(packet.menu?.source?.type!=="chatgpt_project"||packet.menu?.source?.label!=="Planner AI"){
      return{valid:false,message:"La provenienza del pacchetto Planner AI non è valida."};
    }
    if(data?.guardrails?.automatic_writes!==false||data?.guardrails?.stored!==false||data?.guardrails?.requires_preview!==true){
      return{valid:false,message:"La risposta del provider non rispetta i limiti di sicurezza di Cucina Hub."};
    }
    return{valid:true,message:"ok"};
  }

  function summarizePacket(packet){
    const summary={days:0,meals:0,items:0,recipes:0,foods:0,preparations:0};
    const days=Array.isArray(packet?.days)?packet.days:[];
    summary.days=days.length;
    for(const day of days){
      for(const meal of Array.isArray(day?.meals)?day.meals:[]){
        summary.meals+=1;
        for(const item of Array.isArray(meal?.items)?meal.items:[]){
          summary.items+=1;
          if(item?.type==="recipe")summary.recipes+=1;
          if(item?.type==="food")summary.foods+=1;
          if(item?.type==="preparation")summary.preparations+=1;
        }
      }
    }
    return summary;
  }

  return Object.freeze({
    MAX_PERIOD_DAYS,MAX_PROMPT_LENGTH,MIN_PROMPT_LENGTH,
    isRealDate,addDays,inclusiveDays,todayLocal,defaultPeriod,validateRequest,
    validateGeneratedResponse,summarizePacket
  });
});
