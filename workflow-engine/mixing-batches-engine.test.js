"use strict";

const assert=require("node:assert/strict");
const engine=require("./mixing-batches-engine.js");

const oneBatch=engine.calculate({flourWeightG:500});
assert.equal(oneBatch.mixing_batches,1);
assert.equal(oneBatch.flour_per_batch_g,500);
assert.equal(oneBatch.capacity_adjusted,false);

const twoBatches=engine.calculate({flourWeightG:1000});
assert.equal(twoBatches.mixing_batches,2);
assert.equal(twoBatches.required_batches,2);
assert.equal(twoBatches.flour_per_batch_g,500);
assert.equal(twoBatches.capacity_adjusted,true);

const boundary=engine.calculate({flourWeightG:1000.1});
assert.equal(boundary.mixing_batches,3);
assert.ok(boundary.flour_per_batch_g<=500);

const requestedMinimum=engine.calculate({flourWeightG:400,requestedBatches:2});
assert.equal(requestedMinimum.required_batches,1);
assert.equal(requestedMinimum.mixing_batches,2);
assert.equal(requestedMinimum.capacity_adjusted,false);

assert.throws(()=>engine.calculate({flourWeightG:0}),/maggiore di zero/i);
assert.throws(()=>engine.calculate({flourWeightG:11000}),/più di 20 lavorazioni/i);

console.log("Mixing Batches Engine: calcolo capacità verificato.");
