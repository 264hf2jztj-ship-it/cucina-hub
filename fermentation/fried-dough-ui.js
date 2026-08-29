"use strict";

(() => {
  const STYLE="fried_dough";
  const DEVICE="induction_deep_fry";
  const DEFAULTS={
    vessel_name:"Pentola/friggitrice KitchenCraft inox Ø20 cm",vessel_diameter_cm:20,vessel_capacity_l:3,basket_used:false,
    heat_source:"induction",hob_name:"Piastra a induzione IKEA",oil_type:"olio di semi di arachide",oil_volume_ml:1000,
    temperature_min_c:165,temperature_max_c:175,start_temperature_c:174,seconds_per_side:60,batch_size:1,handling_seconds:30,preheat_minutes:15,
    initial_power:7,frying_power:5,recovery_power:6,lower_power:4,mixing_batches:1,oil_percent:3,sugar_percent:0.8
  };
  function waitFor(check,timeoutMs=15000){return new Promise((resolve,reject)=>{const started=Date.now();const timer=setInterval(()=>{try{const value=check();if(value){clearInterval(timer);resolve(value);}else if(Date.now()-started>timeoutMs){clearInterval(timer);reject(new Error("Interfaccia impasti fritti non pronta."));}}catch(error){clearInterval(timer);reject(error);}},80);});}
  function n(value,fallback=0){const number=Number(value);return Number.isFinite(number)?number:fallback;}
  function esc(value){return String(value??"").replace(/[&<>\"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[char]);}
  function setValue(id,value){const node=document.querySelector(`#${id}`);if(node&&value!==null&&value!==undefined)node.value=String(value);}
  function currentPacket(){const input=document.querySelector("#chatRecipeJson"),engine=window.CucinaHubChatRecipeImportEngine;if(!input?.value||!engine?.normalize)return null;try{const packet=engine.normalize(input.value);return packet.recipe.product_style===STYLE?packet:null;}catch(error){return null;}}
  function patchEngines(){
    const sizing=window.CucinaHubDoughSizingEngine;
    sizing.STYLE_DEFAULTS[STYLE]={shape:sizing.SHAPES.ROUND,profile:"custom",loading_g_cm2:0.678,diameter_cm:13,count:18,label:"Pizzonde / impasto fritto"};
    presets[STYLE]={name:"Pizzonde / impasto fritto",hydration:61,salt:2.4,base:0.15,bulk:75,proof:60,ideal:170,bake:45};
    appliances[DEVICE]={label:"Induzione + pentola per frittura",max:190,preheat:15,note:"KitchenCraft inox Ø20 cm senza cestello; olio di arachide, controllo continuo con termometro."};
  }
  function addOptions(){
    const style=document.querySelector("#style"),device=document.querySelector("#ovenType");
    if(!style.querySelector(`option[value="${STYLE}"]`)){const option=document.createElement("option");option.value=STYLE;option.textContent="Pizzonde / impasto fritto";style.appendChild(option);}
    if(!device.querySelector(`option[value="${DEVICE}"]`)){const option=document.createElement("option");option.value=DEVICE;option.textContent="Induzione + pentola per frittura";device.appendChild(option);}
  }
  function addStyles(){const style=document.createElement("style");style.textContent=`
    .fried-box{background:#fff3df;border:1px solid #e4c58e;border-radius:14px;padding:14px}.fried-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:10px}.fried-grid .wide{grid-column:span 2}.fried-note{margin-top:10px;padding:10px;border-radius:10px;background:#fff}.fried-info{background:#fff3df;border:1px solid #e4c58e}
    @media(max-width:760px){.fried-grid{grid-template-columns:1fr 1fr}.fried-grid .wide{grid-column:1/-1}}@media(max-width:430px){.fried-grid{grid-template-columns:1fr}.fried-grid .wide{grid-column:auto}}
  `;document.head.appendChild(style);}
  function createPanel(){
    const panel=document.createElement("div");panel.id="friedDoughPanel";panel.className="full fried-box";panel.hidden=true;panel.innerHTML=`
      <label>Profilo frittura</label><div class="muted">Impostazioni operative per pizzonde e altri impasti fritti. La timeline non inserirà il frigorifero.</div>
      <div class="fried-grid">
        <div class="wide"><label for="friedVessel">Pentola</label><input id="friedVessel" value="${DEFAULTS.vessel_name}"></div>
        <div><label for="friedDiameter">Diametro (cm)</label><input id="friedDiameter" type="number" min="12" max="60" step="1" value="20"></div>
        <div><label for="friedCapacity">Capacità (l)</label><input id="friedCapacity" type="number" min="1" max="20" step="0.1" value="3"></div>
        <div class="wide"><label for="friedHob">Fonte di calore</label><input id="friedHob" value="${DEFAULTS.hob_name}"></div>
        <div class="wide"><label for="friedOilType">Olio di frittura</label><input id="friedOilType" value="${DEFAULTS.oil_type}"></div>
        <div><label for="friedOilVolume">Olio (ml)</label><input id="friedOilVolume" type="number" min="300" max="10000" step="50" value="1000"></div>
        <div><label for="friedOilPercent">Olio nell’impasto (%)</label><input id="friedOilPercent" type="number" min="0" max="15" step="0.1" value="3"></div>
        <div><label for="friedSugarPercent">Zucchero/miele (%)</label><input id="friedSugarPercent" type="number" min="0" max="10" step="0.1" value="0.8"></div>
        <div><label for="friedTempMin">Temperatura minima (°C)</label><input id="friedTempMin" type="number" min="140" max="200" step="1" value="165"></div>
        <div><label for="friedTempMax">Temperatura massima (°C)</label><input id="friedTempMax" type="number" min="140" max="200" step="1" value="175"></div>
        <div><label for="friedStartTemp">Inizio frittura (°C)</label><input id="friedStartTemp" type="number" min="140" max="200" step="1" value="174"></div>
        <div><label for="friedSecondsSide">Secondi per lato</label><input id="friedSecondsSide" type="number" min="20" max="300" step="5" value="60"></div>
        <div><label for="friedBatchSize">Pezzi per turno</label><input id="friedBatchSize" type="number" min="1" max="10" step="1" value="1"></div>
        <div><label for="friedHandling">Cambio pezzo (sec)</label><input id="friedHandling" type="number" min="0" max="180" step="5" value="30"></div>
        <div><label for="friedPreheat">Riscaldamento olio (min)</label><input id="friedPreheat" type="number" min="3" max="60" step="1" value="15"></div>
        <div><label for="friedMixingBatches">Impasti separati (automatico)</label><input id="friedMixingBatches" type="number" min="1" max="20" step="1" value="1" readonly aria-describedby="friedMixingCapacity"></div>
        <div><label for="friedPowerInitial">Potenza iniziale</label><input id="friedPowerInitial" type="number" min="1" max="10" step="1" value="7"></div>
        <div><label for="friedPowerCook">Potenza frittura</label><input id="friedPowerCook" type="number" min="1" max="10" step="1" value="5"></div>
        <div><label for="friedPowerRecovery">Potenza recupero</label><input id="friedPowerRecovery" type="number" min="1" max="10" step="1" value="6"></div>
        <div><label for="friedPowerLower">Potenza riduzione</label><input id="friedPowerLower" type="number" min="1" max="10" step="1" value="4"></div>
      </div>
      <div id="friedMixingCapacity" class="fried-note"><strong>Capacità DCG KM1401R:</strong> il Wizard calcola automaticamente una lavorazione ogni 500 g di farina e conserva eventuali suddivisioni più prudenti indicate nel pacchetto.</div>
      <div class="fried-note"><strong>Cestello disattivato durante la frittura.</strong> È previsto un pezzo alla volta, con controllo dell’olio tramite termometro.</div>`;
    document.querySelector("#ovenType")?.closest("div")?.insertAdjacentElement("afterend",panel);
    return panel;
  }
  function readProfile(){return{
    vessel_name:document.querySelector("#friedVessel").value.trim()||DEFAULTS.vessel_name,vessel_diameter_cm:n(document.querySelector("#friedDiameter").value,20),vessel_capacity_l:n(document.querySelector("#friedCapacity").value,3),basket_used:false,
    heat_source:"induction",hob_name:document.querySelector("#friedHob").value.trim()||DEFAULTS.hob_name,oil_type:document.querySelector("#friedOilType").value.trim()||DEFAULTS.oil_type,oil_volume_ml:n(document.querySelector("#friedOilVolume").value,1000),
    temperature_min_c:n(document.querySelector("#friedTempMin").value,165),temperature_max_c:n(document.querySelector("#friedTempMax").value,175),start_temperature_c:n(document.querySelector("#friedStartTemp").value,174),seconds_per_side:n(document.querySelector("#friedSecondsSide").value,60),batch_size:Math.max(1,Math.round(n(document.querySelector("#friedBatchSize").value,1))),handling_seconds:n(document.querySelector("#friedHandling").value,30),preheat_minutes:n(document.querySelector("#friedPreheat").value,15),
    initial_power:n(document.querySelector("#friedPowerInitial").value,7),frying_power:n(document.querySelector("#friedPowerCook").value,5),recovery_power:n(document.querySelector("#friedPowerRecovery").value,6),lower_power:n(document.querySelector("#friedPowerLower").value,4),mixing_batches:Math.max(1,Math.round(n(document.querySelector("#friedMixingBatches").value,1)))
  };}
  function syncPacket(packet){if(!packet)return;const f=packet.cooking?.frying||{};const map={friedVessel:f.vessel_name,friedDiameter:f.vessel_diameter_cm,friedCapacity:f.vessel_capacity_l,friedHob:f.hob_name,friedOilType:f.oil_type,friedOilVolume:f.oil_volume_ml,friedTempMin:f.temperature_min_c,friedTempMax:f.temperature_max_c,friedStartTemp:f.start_temperature_c,friedSecondsSide:f.seconds_per_side,friedBatchSize:f.batch_size,friedHandling:f.handling_seconds,friedPreheat:f.preheat_minutes,friedPowerInitial:f.initial_power,friedPowerCook:f.frying_power,friedPowerRecovery:f.recovery_power,friedPowerLower:f.lower_power,friedMixingBatches:f.mixing_batches,friedOilPercent:packet.formula?.oil_percent,friedSugarPercent:packet.formula?.sugar_percent};Object.entries(map).forEach(([id,value])=>setValue(id,value));}
  function fryMinutes(count,profile){return Math.max(1,Math.ceil(count*(profile.seconds_per_side*2+profile.handling_seconds)/(profile.batch_size*60)));}
  function calculateMixingBatches(flour,packet){
    const engine=window.CucinaHubMixingBatchesEngine;
    if(!engine?.calculate)throw new Error("Calcolo capacità impastatrice non disponibile.");
    const requested=n(packet?.cooking?.frying?.mixing_batches,1);
    const result=engine.calculate({flourWeightG:flour,requestedBatches:requested});
    setValue("friedMixingBatches",result.mixing_batches);
    const note=document.querySelector("#friedMixingCapacity");
    if(note)note.innerHTML=`<strong>${esc(result.appliance_label)} · ciotola ${result.bowl_capacity_l} l:</strong> ${esc(result.explanation)}${result.capacity_adjusted?' La suddivisione è stata aumentata automaticamente rispetto al pacchetto.':''}`;
    return result;
  }
  function attachImportedSnapshot(packet){if(!packet||!window.CucinaHubChatRecipeImportEngine||!workflow)return;const linkedFlours=(typeof blendRows!=="undefined"?blendRows:[]).map(row=>{const profile=flourProfiles.find(item=>item.id===row.profileId);return profile?{profile_id:profile.id,label:profileLabel(profile),percentage:Number(row.percentage)}:null;}).filter(Boolean);workflow.context.chat_recipe_import=window.CucinaHubChatRecipeImportEngine.sessionSnapshot(packet,{environmentProfileId:document.querySelector("#environmentProfile")?.value||null,flours:linkedFlours});plan.workflow_definition=workflow;}
  function renderFriedInfo(profile,count,totalMinutes,oilWeight,sugarWeight){let box=document.querySelector("#friedCookingInfo");if(!box){box=document.createElement("div");box.id="friedCookingInfo";box.className="info-box fried-info";document.querySelector("#ovenNote")?.insertAdjacentElement("beforebegin",box);}box.innerHTML=`<div class="info-head"><div><strong>Frittura profonda</strong><br><span class="muted">${esc(profile.vessel_name)} · ${esc(profile.hob_name)}</span></div><span class="info-badge">SENZA CESTELLO</span></div><div class="action-grid"><div class="action-card"><span>Olio</span><strong>${profile.oil_volume_ml} ml ${esc(profile.oil_type)}</strong></div><div class="action-card"><span>Intervallo operativo</span><strong>${profile.temperature_min_c}–${profile.temperature_max_c} °C</strong></div><div class="action-card"><span>Durata stimata</span><strong>${totalMinutes} min per ${count} pezzi</strong></div><div class="action-card"><span>Tempo per lato</span><strong>${profile.seconds_per_side} secondi</strong></div><div class="action-card"><span>Olio nell’impasto</span><strong>${oilWeight.toFixed(1)} g</strong></div><div class="action-card"><span>Zucchero/miele</span><strong>${sugarWeight.toFixed(1)} g</strong></div></div>`;}
  function rebuildFried(packet){
    if(!plan)throw new Error("La proposta base non è stata generata.");
    const profile=readProfile(),preset=presets[STYLE],environment=env(),room=n(environment?.room_temperature_c,22),humidity=n(environment?.relative_humidity_percent,55),fridge=n(environment?.fridge_temperature_c,4);
    const sizing=window.CucinaHubDoughSizingWizard.calculateSizing(),count=Math.max(1,Math.round(n(sizing.count,packet?.format?.count||1))),cookMinutes=fryMinutes(count,profile);
    const baselineBulk=n(packet?.fermentation?.bulk_minutes,preset.bulk),baselineProof=n(packet?.fermentation?.proof_minutes,preset.proof),oilPercent=n(packet?.formula?.oil_percent,document.querySelector("#friedOilPercent").value),sugarPercent=n(packet?.formula?.sugar_percent,document.querySelector("#friedSugarPercent").value);
    let activeWindowMinutes=12+18*profile.mixing_batches+baselineBulk+baselineProof+profile.preheat_minutes+cookMinutes+5;
    let effectiveHours=Math.max(4,activeWindowMinutes/60);
    let baseYeastPercent=preset.base*(24/effectiveHours);if(document.querySelector("#yeastType").value==="dry_yeast")baseYeastPercent*=0.4;
    let flour=n(packet?.formula?.flour_weight_g,0);
    if(!(flour>0)){
      const probe=CucinaHubTemperatureCorrectionEngine.calculate({roomTemperatureC:room,referenceTemperatureC:22,bulkMinutes:baselineBulk,proofMinutes:baselineProof,yeastWeightG:1000*baseYeastPercent/100,yeastType:document.querySelector("#yeastType").value});
      const effectiveYeastPercent=probe.corrected.yeast_weight_g/1000*100;
      const target=n(sizing.total_dough_weight_g,1000);
      flour=target/(1+preset.hydration/100+preset.salt/100+oilPercent/100+sugarPercent/100+effectiveYeastPercent/100);
    }
    const mixingCalculation=calculateMixingBatches(flour,packet);profile.mixing_batches=mixingCalculation.mixing_batches;
    activeWindowMinutes=12+18*profile.mixing_batches+baselineBulk+baselineProof+profile.preheat_minutes+cookMinutes+5;
    effectiveHours=Math.max(4,activeWindowMinutes/60);
    baseYeastPercent=preset.base*(24/effectiveHours);if(document.querySelector("#yeastType").value==="dry_yeast")baseYeastPercent*=0.4;
    const water=flour*preset.hydration/100,salt=flour*preset.salt/100,oilWeight=flour*oilPercent/100,sugarWeight=flour*sugarPercent/100,baseYeast=flour*baseYeastPercent/100;
    temperatureCorrection=CucinaHubTemperatureCorrectionEngine.calculate({roomTemperatureC:room,referenceTemperatureC:22,bulkMinutes:baselineBulk,proofMinutes:baselineProof,yeastWeightG:baseYeast,yeastType:document.querySelector("#yeastType").value});
    humidityCorrection=CucinaHubHumidityCorrectionEngine.calculate({relativeHumidityPercent:humidity,referenceHumidityPercent:55});
    fridgeCorrection=CucinaHubFridgeCorrectionEngine.calculate({fridgeTemperatureC:fridge,referenceTemperatureC:4,coldFermentationMinutes:0});
    flourBlend=CucinaHubFlourBlendEngine.build({totalFlourG:flour,components:currentBlendInput()});
    const total=flour+water+salt+oilWeight+sugarWeight+temperatureCorrection.corrected.yeast_weight_g,portion=total/count;
    document.querySelector("#flourWeight").value=flour.toFixed(1);updateFlourPreview();
    Object.assign(plan,{product_style:STYLE,title:`${packet?.recipe?.title||preset.name} — ${fmt(new Date(plan.target_meal_at))}`,flour_name:flourBlend.label,flour_weight_g:+flour.toFixed(1),hydration_percent:preset.hydration,water_weight_g:+water.toFixed(1),salt_weight_g:+salt.toFixed(1),yeast_weight_g:temperatureCorrection.corrected.yeast_weight_g,oil_weight_g:+oilWeight.toFixed(1),sugar_weight_g:+sugarWeight.toFixed(1),bulk_fermentation_minutes:temperatureCorrection.corrected.bulk_minutes,cold_fermentation_minutes:0,final_proof_minutes:temperatureCorrection.corrected.proof_minutes,cooking_method:"deep_fry",cooking_profile:profile,oven_type:DEVICE,oven_temperature_c:profile.start_temperature_c,dough_shape:"round",portion_count:count,portion_weight_g:+portion.toFixed(1),dough_total_weight_g:+total.toFixed(1),round_diameter_cm:sizing.geometry.diameter_cm,dough_loading_g_cm2:+(portion/(Math.PI*Math.pow(n(sizing.geometry.diameter_cm,13)/2,2))).toFixed(3),sizing_profile:"custom"});
    plan.temperature_correction=temperatureCorrection;plan.humidity_correction=humidityCorrection;plan.fridge_correction=fridgeCorrection;plan.flour_blend=flourBlend;plan.preheat_minutes=profile.preheat_minutes;plan.bake_minutes=cookMinutes;
    workflow=CucinaHubSessionWorkflowBuilder.build(plan);
    workflow.context.flour_blend=flourBlend;workflow.context.temperature_correction=temperatureCorrection;workflow.context.humidity_correction=humidityCorrection;workflow.context.fridge_correction=fridgeCorrection;workflow.context.mixing_batches_calculation=mixingCalculation;workflow.context.environment_snapshot={profile_id:environment?.id||null,name:environment?.name||null,room_temperature_c:room,relative_humidity_percent:humidity,fridge_temperature_c:fridge};workflow.context.dough_sizing={...sizing,calculated_dough_weight_g:plan.dough_total_weight_g,calculated_portion_weight_g:plan.portion_weight_g,formula_snapshot:{flour_weight_g:plan.flour_weight_g,water_weight_g:plan.water_weight_g,salt_weight_g:plan.salt_weight_g,yeast_weight_g:plan.yeast_weight_g,oil_weight_g:plan.oil_weight_g,sugar_weight_g:plan.sugar_weight_g,hydration_percent:plan.hydration_percent}};
    schedule=CucinaHubTimelineEngine.build({workflow,targetAt:new Date(plan.target_meal_at)});const scheduleValidation=CucinaHubTimelineEngine.validate(schedule);if(!scheduleValidation.valid)throw new Error(scheduleValidation.errors.join(" "));
    plan.generated_plan=schedule.events;workflow.timeline={version:schedule.version,target_at:schedule.target_at,start_at:schedule.start_at,summary:schedule.summary};calendarExport=CucinaHubCalendarExportEngine.build({schedule,title:plan.title,uidBase:workflow.id});const calendarValidation=CucinaHubCalendarExportEngine.validate(calendarExport);if(!calendarValidation.valid)throw new Error(calendarValidation.errors.join(" "));workflow.context.calendar_export={version:calendarExport.version,milestone_count:calendarExport.milestones.length,filename:calendarExport.filename};plan.workflow_definition=workflow;attachImportedSnapshot(packet);
    document.querySelector("#summary").textContent=`${count} pizzonde da circa ${portion.toFixed(0)} g, ${profile.mixing_batches} impasti separati, nessun frigorifero. Per terminare alle ${onlyTime(plan.target_meal_at)}, inizia alle ${onlyTime(schedule.start_at)}.`;
    document.querySelector("#startAt").textContent=fmt(schedule.start_at);document.querySelector("#activeTime").textContent=minutesLabel(schedule.summary.active_minutes);document.querySelector("#blendMetric").textContent=flourBlend.components.length===1?"1 farina":`${flourBlend.components.length} farine`;document.querySelector("#water").textContent=`${plan.water_weight_g} g`;document.querySelector("#salt").textContent=`${plan.salt_weight_g} g`;document.querySelector("#yeast").textContent=`${grams(plan.yeast_weight_g,document.querySelector("#yeastType").value)} g`;document.querySelector("#hydration").textContent=`${preset.hydration}%`;document.querySelector("#bake").textContent=`Olio ${profile.temperature_min_c}–${profile.temperature_max_c} °C · ${cookMinutes} min`;document.querySelector("#phases").textContent=`${workflow.phases.length} fasi · ${schedule.events.length} eventi`;
    document.querySelector("#calendarInfo").innerHTML=`<strong>${calendarExport.milestones.length} avvisi pronti per Calendario</strong><br><span class="muted">Impasti, pieghe, panetti, riscaldamento olio, inizio frittura e orario finale.</span>`;document.querySelector("#ovenNote").textContent=`Scalda a potenza ${profile.initial_power}, scendi a ${profile.frying_power}; usa ${profile.recovery_power} solo per recuperare temperatura e ${profile.lower_power} se l’olio sale troppo.`;
    renderFlour();renderTemperature();renderHumidity();renderFridge();renderTimeline();renderFriedInfo(profile,count,cookMinutes,oilWeight,sugarWeight);document.querySelector("#proposal").hidden=false;document.querySelector("#start").hidden=true;document.querySelector("#calendar").hidden=false;msg("Sessione per impasto fritto generata. Controlla tutto prima di salvare.","ok");
  }
  async function init(){
    await waitFor(()=>document.querySelector("#style")&&document.querySelector("#ovenType")&&document.querySelector("#generate")&&window.CucinaHubDoughSizingWizard&&window.CucinaHubDoughSizingEngine&&window.CucinaHubMixingBatchesEngine?.VERSION===1&&window.CucinaHubChatRecipeImportEngine?.VERSION===2&&window.CucinaHubSessionWorkflowBuilder?.buildFried&&typeof presets!=="undefined"&&typeof appliances!=="undefined");
    patchEngines();addOptions();addStyles();const panel=createPanel(),style=document.querySelector("#style"),device=document.querySelector("#ovenType"),generateButton=document.querySelector("#generate"),resetButton=document.querySelector("#reset");
    const visibility=()=>{const active=style.value===STYLE;panel.hidden=!active;if(active){device.value=DEVICE;device.disabled=true;}else device.disabled=false;};
    style.addEventListener("change",visibility);visibility();
    const originalGenerate=generateButton.onclick;generateButton.onclick=function(){try{const packet=style.value===STYLE?currentPacket():null;if(style.value===STYLE){syncPacket(packet);device.disabled=false;device.value=DEVICE;}originalGenerate.call(generateButton);if(style.value===STYLE&&plan)rebuildFried(packet);}catch(error){msg(error.message,"error");}finally{visibility();}};
    const originalReset=resetButton.onclick;resetButton.onclick=function(){originalReset.call(resetButton);Object.entries(DEFAULTS).forEach(()=>{});document.querySelector("#friedCookingInfo")?.remove();visibility();};
    window.CucinaHubFriedDoughWizard={VERSION:2,DEFAULTS,readProfile,rebuildFried,syncPacket,calculateMixingBatches};
  }
  init().catch(error=>console.error("Supporto impasti fritti non disponibile:",error));
})();
