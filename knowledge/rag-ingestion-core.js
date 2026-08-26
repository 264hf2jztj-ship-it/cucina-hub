(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CucinaHubRagIngestionCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_TARGET = 1800;
  const DEFAULT_MAX = 2600;
  const MAX_DOCUMENT_CHARS = 500000;
  const MAX_CHUNKS = 400;

  function normalizeText(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function splitLongBlock(block, maxLength) {
    if (block.length <= maxLength) return [block];
    const sentences = block.match(/[^.!?\n]+[.!?]+(?:\s+|$)|[^.!?\n]+$/g) || [block];
    const parts = [];
    let current = "";
    for (const sentence of sentences) {
      const clean = sentence.trim();
      if (!clean) continue;
      if (current && `${current} ${clean}`.length > maxLength) {
        parts.push(current);
        current = "";
      }
      if (clean.length > maxLength) {
        if (current) parts.push(current);
        current = "";
        for (let start = 0; start < clean.length; start += maxLength) {
          parts.push(clean.slice(start, start + maxLength).trim());
        }
      } else {
        current = current ? `${current} ${clean}` : clean;
      }
    }
    if (current) parts.push(current);
    return parts;
  }

  function headingFrom(block, fallback) {
    const firstLine = block.split("\n", 1)[0].replace(/^#{1,6}\s*/, "").trim();
    const looksLikeHeading = firstLine.length > 0 && firstLine.length <= 120 && (
      /^#{1,6}\s/.test(block) ||
      (!/[.!?]$/.test(firstLine) && block.includes("\n"))
    );
    return looksLikeHeading ? firstLine : fallback;
  }

  function chunkText(value, options = {}) {
    const text = normalizeText(value);
    if (!text) throw new Error("Il documento non contiene testo indicizzabile.");
    if (text.length > MAX_DOCUMENT_CHARS) throw new Error("Il documento supera il limite di 500.000 caratteri per questa prima versione.");

    const targetLength = Math.max(600, Number(options.targetLength) || DEFAULT_TARGET);
    const maxLength = Math.max(targetLength, Number(options.maxLength) || DEFAULT_MAX);
    const fallbackHeading = String(options.heading || "Documento importato").slice(0, 300);
    const blocks = text.split(/\n\s*\n/).flatMap(block => splitLongBlock(block.trim(), maxLength));
    const chunks = [];
    let current = "";
    let currentHeading = fallbackHeading;

    function pushCurrent() {
      if (!current.trim()) return;
      chunks.push({
        chunk_number: chunks.length,
        heading: currentHeading,
        locator: `Frammento ${chunks.length + 1}`,
        content: current.trim(),
        token_estimate: Math.max(1, Math.ceil(current.trim().length / 4))
      });
      current = "";
    }

    for (const block of blocks) {
      if (!block) continue;
      const nextHeading = headingFrom(block, currentHeading);
      if (current && `${current}\n\n${block}`.length > targetLength) pushCurrent();
      if (!current) currentHeading = nextHeading;
      current = current ? `${current}\n\n${block}` : block;
      if (current.length >= maxLength) pushCurrent();
    }
    pushCurrent();

    if (!chunks.length) throw new Error("Non è stato possibile creare frammenti dal documento.");
    if (chunks.length > MAX_CHUNKS) throw new Error(`Il documento produce ${chunks.length} frammenti: il limite è ${MAX_CHUNKS}.`);
    return chunks;
  }

  function summarize(chunks) {
    const items = Array.isArray(chunks) ? chunks : [];
    return {
      chunk_count: items.length,
      character_count: items.reduce((total, item) => total + String(item.content || "").length, 0),
      token_estimate: items.reduce((total, item) => total + Number(item.token_estimate || 0), 0)
    };
  }

  return Object.freeze({ normalizeText, chunkText, summarize, MAX_DOCUMENT_CHARS, MAX_CHUNKS });
});
