"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./rag-ingestion-core.js");

test("normalizes documents and creates bounded sequential chunks", () => {
  const text = `# Impasto\r\n\r\n${"Farina e acqua. ".repeat(140)}\r\n\r\n## Cottura\r\n\r\n${"Cuocere con attenzione. ".repeat(120)}`;
  const chunks = core.chunkText(text, { heading: "Manuale prova", targetLength: 900, maxLength: 1200 });
  assert.ok(chunks.length > 2);
  assert.deepEqual(chunks.map(item => item.chunk_number), chunks.map((_, index) => index));
  assert.ok(chunks.every(item => item.content.length <= 1200));
  assert.ok(chunks.every(item => item.token_estimate > 0));
});

test("rejects empty and oversized documents", () => {
  assert.throws(() => core.chunkText("  \n \n  "), /non contiene testo/);
  assert.throws(() => core.chunkText("x".repeat(core.MAX_DOCUMENT_CHARS + 1)), /500\.000 caratteri/);
});

test("summarizes only the prepared fragments", () => {
  const chunks = core.chunkText("Titolo\n\nPrimo paragrafo.\n\nSecondo paragrafo.", { heading: "Test" });
  const summary = core.summarize(chunks);
  assert.equal(summary.chunk_count, chunks.length);
  assert.ok(summary.character_count > 0);
  assert.ok(summary.token_estimate > 0);
});
