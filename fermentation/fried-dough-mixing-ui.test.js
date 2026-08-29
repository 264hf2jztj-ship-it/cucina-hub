"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.join(__dirname,"..");
const loader=fs.readFileSync(path.join(root,"supabase-client.js"),"utf8");
const ui=fs.readFileSync(path.join(__dirname,"fried-dough-ui.js"),"utf8");
const wizard=fs.readFileSync(path.join(__dirname,"baking-wizard.html"),"utf8");

const engineIndex=loader.indexOf("mixing-batches-engine.js?v=1");
const uiIndex=loader.indexOf("fried-dough-ui.js?v=2");
assert.ok(engineIndex>=0&&uiIndex>engineIndex,"Il motore capacità deve essere caricato prima della UI.");
assert.match(ui,/friedMixingBatches[^>]+readonly/);
assert.match(ui,/CucinaHubMixingBatchesEngine/);
assert.match(ui,/mixing_batches_calculation/);
assert.match(wizard,/supabase-client\.js\?v=13/);

console.log("Fried Dough UI: calcolo automatico capacità integrato.");
