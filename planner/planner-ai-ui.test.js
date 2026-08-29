const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");

const root=path.join(__dirname,"..");
const html=fs.readFileSync(path.join(__dirname,"ai.html"),"utf8");
const js=fs.readFileSync(path.join(__dirname,"planner-ai.js"),"utf8");
const hub=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
const worker=fs.readFileSync(path.join(root,"sw.js"),"utf8");
const edge=fs.readFileSync(path.join(root,"supabase/functions/planner-assistant/main.ts"),"utf8");

test("Planner Hub exposes Planner AI as a dedicated module",()=>{
  assert.match(hub,/href="ai\.html\?v=1"/);
  assert.match(hub,/>Planner AI</);
});

test("Planner AI is preview-first and requires an explicit staging action",()=>{
  for(const id of["plannerAiPrompt","plannerAiStart","plannerAiEnd","plannerAiServings","plannerAiGenerate","plannerAiStage"]){
    assert.match(html,new RegExp(`id="${id}"`));
  }
  assert.match(html,/Nessuna scrittura automatica/);
  assert.match(js,/client\.functions\.invoke\(GENERATE_FUNCTION/);
  assert.match(js,/client\.functions\.invoke\(STAGE_FUNCTION/);
  assert.match(js,/state\.packet/);
  assert.match(js,/workspace\.html\?v=14&section=menu-package/);
});

test("Planner AI server is read-only and uses personal context first",()=>{
  assert.match(edge,/rest\/v1\/recipes/);
  assert.match(edge,/rest\/v1\/planned_meals/);
  assert.match(edge,/rpc\/search_rag_sources/);
  assert.match(edge,/store: false/);
  assert.match(edge,/automatic_writes: false/);
  assert.match(edge,/requires_preview: true/);
  assert.doesNotMatch(edge,/rest\/v1\/(?:planner_menu_packages|planned_meal_items)\b[\s\S]*method:\s*"POST"/);
});

test("generated packet reuses menu-plan v1 guardrails and Planner AI provenance",()=>{
  assert.match(edge,/contract: "cucina-hub\.menu-plan"/);
  assert.match(edge,/version: 1/);
  assert.match(edge,/type: "chatgpt_project"/);
  assert.match(edge,/label: "Planner AI"/);
  assert.match(edge,/preview_only: true/);
  assert.match(edge,/automatic_save: false/);
  assert.match(edge,/requires_user_confirmation: true/);
});

test("Planner AI assets are part of the PWA app shell",()=>{
  assert.match(worker,/const CACHE_NAME = "cucina-hub-v\d+";/);
  for(const asset of["planner/ai.html","planner/planner-ai.css","planner/planner-ai-core.js","planner/planner-ai.js"]){
    assert.match(worker,new RegExp(asset.replaceAll(".","\\.")));
  }
});
