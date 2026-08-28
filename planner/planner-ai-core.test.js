const assert=require("node:assert/strict");
const test=require("node:test");
const core=require("./planner-ai-core.js");

test("default period is seven days",()=>{
  const period=core.defaultPeriod(new Date(2026,7,28,10,0,0));
  assert.deepEqual(period,{period_start:"2026-08-28",period_end:"2026-09-03"});
  assert.equal(core.inclusiveDays(period.period_start,period.period_end),7);
});

test("request validation caps Planner AI to fourteen days",()=>{
  assert.equal(core.validateRequest({
    prompt:"Menu pratico",period_start:"2026-08-28",period_end:"2026-09-10",servings:2
  }).valid,true);
  const tooLong=core.validateRequest({
    prompt:"Menu pratico",period_start:"2026-08-28",period_end:"2026-09-11",servings:2
  });
  assert.equal(tooLong.valid,false);
  assert.match(tooLong.errors.join(" "),/14/);
});

test("generated response requires menu-plan guardrails and Planner AI provenance",()=>{
  const base={
    packet:{
      contract:"cucina-hub.menu-plan",version:1,
      menu:{source:{type:"chatgpt_project",label:"Planner AI"}},
      days:[],
      guardrails:{preview_only:true,automatic_save:false,requires_user_confirmation:true}
    },
    guardrails:{automatic_writes:false,stored:false,requires_preview:true}
  };
  assert.equal(core.validateGeneratedResponse(base).valid,true);
  assert.equal(core.validateGeneratedResponse({
    ...base,packet:{...base.packet,guardrails:{preview_only:true,automatic_save:true,requires_user_confirmation:true}}
  }).valid,false);
});

test("summary counts menu item types without modifying the packet",()=>{
  const packet={days:[{meals:[{items:[
    {type:"recipe"},{type:"food"},{type:"preparation"}
  ]}]}]};
  assert.deepEqual(core.summarizePacket(packet),{
    days:1,meals:1,items:3,recipes:1,foods:1,preparations:1
  });
});
