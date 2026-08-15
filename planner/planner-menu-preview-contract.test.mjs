import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

import {
  canonicalStringify,
  computePayloadHash,
  validatePacket,
} from "../supabase/functions/planner-menu-preview/contract.mjs";

const require = createRequire(import.meta.url);
const frontendEngine = require("./menu-plan-import-engine.js");
const fixture = JSON.parse(fs.readFileSync(new URL("./test-fixtures/menu-plan-v1-valid.json", import.meta.url), "utf8"));

const frontendValidation = frontendEngine.validatePacket(fixture);
const edgeValidation = validatePacket(fixture);
assert.equal(frontendValidation.valid, true);
assert.equal(edgeValidation.valid, true);
assert.deepEqual(edgeValidation.normalizedPacket, frontendValidation.normalizedPacket);
assert.equal(
  canonicalStringify(edgeValidation.normalizedPacket),
  frontendEngine.canonicalStringify(frontendValidation.normalizedPacket)
);
assert.equal(
  await computePayloadHash(edgeValidation.normalizedPacket),
  await frontendEngine.computePayloadHash(frontendValidation.normalizedPacket)
);
assert.deepEqual(edgeValidation.summary, frontendValidation.summary);

const mutations = [
  packet => { packet.owner_user_id = "forbidden"; },
  packet => { packet.guardrails.automatic_save = true; },
  packet => { packet.menu.period_start = "2026-02-30"; },
  packet => { packet.menu.source.generated_at = "ieri"; },
  packet => { packet.days[0].unexpected = true; },
  packet => { packet.days[0].meals[0].items[0].quantity = 2; },
  packet => { packet.days[0].meals[0].items.push(structuredClone(packet.days[0].meals[0].items[0])); },
];

for (const mutate of mutations) {
  const packet = structuredClone(fixture);
  mutate(packet);
  const frontend = frontendEngine.validatePacket(packet);
  const edge = validatePacket(packet);
  assert.equal(edge.valid, false);
  assert.deepEqual(
    edge.errors.map(item => [item.code, item.path]),
    frontend.errors.map(item => [item.code, item.path])
  );
}

console.log("Contratto menu-plan v1: validatore Edge allineato al Planner.");
