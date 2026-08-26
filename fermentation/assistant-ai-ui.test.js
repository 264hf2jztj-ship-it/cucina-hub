"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const page = fs.readFileSync("fermentation/fermentation-assistant.html", "utf8");
const provider = fs.readFileSync("fermentation/assistant-provider-ui.js", "utf8");
const response = fs.readFileSync("fermentation/assistant-response-ui.js", "utf8");
const edge = fs.readFileSync("supabase/functions/fermentation-assistant/main.ts", "utf8");
const schema = fs.readFileSync("supabase/functions/fermentation-assistant/response-schema.ts", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

test("assistant page exposes provider and local response validation", () => {
  assert.match(page, /assistant-response-ui\.js\?v=2/);
  assert.match(page, /assistant-provider-ui\.js\?v=2/);
  assert.match(page, /href="\.\/index\.html\?v=2"/);
  assert.match(page, /knowledge\/rag\.html\?v=1/);
  assert.match(page, /rpc\('search_rag_sources'/);
  assert.match(provider, /functions\.invoke\(FUNCTION_NAME/);
  assert.match(provider, /automatic_writes !== false/);
  assert.match(provider, /requires_user_confirmation !== true/);
  assert.match(response, /CucinaHubFermentationAssistantResponseEngine/);
});

test("edge function keeps the API key server-side and responses in preview", () => {
  assert.match(edge, /Deno\.env\.get\("OPENAI_API_KEY"\)/);
  assert.match(edge, /store:\s*false/);
  assert.match(edge, /request\.headers\.get\("authorization"\)/);
  assert.match(edge, /MAX_PACKET_BYTES/);
  assert.match(edge, /automatic_writes:\s*false/);
  assert.match(edge, /requires_user_confirmation:\s*true/);
  assert.match(schema, /state.*preview/s);
  assert.doesNotMatch(page, /OPENAI_API_KEY\s*=/);
});

test("assistant static shell is available offline", () => {
  assert.match(sw, /cucina-hub-v25/);
  for (const asset of [
    "fermentation/fermentation-assistant.html",
    "fermentation/assistant-response-ui.js",
    "fermentation/assistant-provider-ui.js",
    "workflow-engine/fermentation-assistant-context-engine.js",
    "workflow-engine/fermentation-assistant-response-engine.js"
  ]) assert.match(sw, new RegExp(asset.replace(/[.]/g, "\\.")));
});
