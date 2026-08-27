(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CucinaHubRagPdfCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_PDF_BYTES = 32 * 1024 * 1024;
  const MAX_PDF_PAGES = 250;
  const MIN_PAGE_CHARS = 20;

  function normalizeLine(value) {
    return String(value || "")
      .replace(/[\u0000\u00ad]/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  function textContentToText(textContent) {
    const items = Array.isArray(textContent?.items) ? textContent.items : [];
    let result = "";
    for (const item of items) {
      const value = normalizeLine(item?.str);
      if (value) {
        const previous = result.slice(-1);
        const needsSpace = result && !/[\s([{\-/]$/.test(previous) && !/^[,.;:!?%)\]}]/.test(value);
        if (needsSpace) result += " ";
        result += value;
      }
      if (item?.hasEOL && !result.endsWith("\n")) result += "\n";
    }
    return result
      .split("\n")
      .map(normalizeLine)
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  async function readTextContent(page, options = {}) {
    if (!page?.streamTextContent) return page.getTextContent(options);
    const stream = page.streamTextContent(options);
    const reader = stream?.getReader?.();
    if (!reader) return page.getTextContent(options);
    const merged = { items: [], styles: Object.create(null), lang: null };
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        const chunk = result.value || {};
        if (merged.lang == null && chunk.lang != null) merged.lang = chunk.lang;
        Object.assign(merged.styles, chunk.styles || {});
        const items = Array.isArray(chunk.items) ? chunk.items : [];
        items.forEach(item => merged.items.push(item));
      }
    } finally {
      reader.releaseLock?.();
    }
    return merged;
  }

  function validatePdfFile(file) {
    if (!file) throw new Error("Seleziona un file PDF.");
    const name = String(file.name || "");
    const type = String(file.type || "").toLowerCase();
    if (!/\.pdf$/i.test(name) && type !== "application/pdf") {
      throw new Error("Il file selezionato non è un PDF.");
    }
    if (!Number.isFinite(file.size) || file.size < 1) throw new Error("Il PDF è vuoto.");
    if (file.size > MAX_PDF_BYTES) throw new Error("Il PDF supera il limite di 32 MB.");
    return true;
  }

  function repeatedLineKeys(pages) {
    const counts = new Map();
    for (const page of pages) {
      const unique = new Set(String(page.text || "").split("\n").map(normalizeLine).filter(Boolean));
      for (const line of unique) {
        if (line.length > 120 || /^\d{1,4}$/.test(line)) continue;
        const key = line.toLocaleLowerCase("it-IT");
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    const threshold = Math.max(3, Math.ceil(pages.length * 0.6));
    return new Set([...counts].filter(([, count]) => count >= threshold).map(([key]) => key));
  }

  function cleanPages(pages) {
    const repeated = repeatedLineKeys(pages);
    return pages.map(page => {
      const lines = String(page.text || "")
        .split("\n")
        .map(normalizeLine)
        .filter(line => line && !/^\d{1,4}$/.test(line) && !repeated.has(line.toLocaleLowerCase("it-IT")));
      return { page_number: page.page_number, text: lines.join("\n").trim() };
    });
  }

  function pageHeading(text, fallback) {
    const line = String(text || "").split("\n").map(normalizeLine).find(Boolean);
    if (!line || line.length > 180) return fallback;
    return line;
  }

  function pagesToChunks(pages, options = {}) {
    const ingestionCore = options.ingestionCore;
    if (!ingestionCore?.chunkText) throw new Error("Motore di indicizzazione testuale non disponibile.");
    const cleaned = cleanPages(Array.isArray(pages) ? pages : []);
    const usable = cleaned.filter(page => page.text.length >= MIN_PAGE_CHARS);
    if (!usable.length) {
      throw new Error("Il PDF non contiene testo selezionabile. I PDF scansionati richiedono OCR, non ancora disponibile.");
    }
    const chunks = [];
    for (const page of usable) {
      const heading = pageHeading(page.text, options.heading || `Pagina ${page.page_number}`);
      const pageChunks = ingestionCore.chunkText(page.text, { heading });
      pageChunks.forEach((chunk, index) => {
        chunks.push({
          chunk_number: chunks.length,
          heading: chunk.heading || heading,
          locator: pageChunks.length > 1 ? `Pagina ${page.page_number} · Parte ${index + 1}` : `Pagina ${page.page_number}`,
          content: chunk.content,
          token_estimate: chunk.token_estimate
        });
      });
    }
    if (chunks.length > ingestionCore.MAX_CHUNKS) {
      throw new Error(`Il PDF produce ${chunks.length} frammenti: il limite è ${ingestionCore.MAX_CHUNKS}.`);
    }
    return {
      chunks,
      page_count: cleaned.length,
      indexed_page_count: usable.length,
      skipped_page_count: cleaned.length - usable.length,
      canonical_text: usable.map(page => `Pagina ${page.page_number}\n${page.text}`).join("\n\n")
    };
  }

  async function extractPdf(file, options = {}) {
    validatePdfFile(file);
    const pdfjs = options.pdfjs;
    if (!pdfjs?.getDocument) throw new Error("Lettore PDF non disponibile. Ricarica la pagina e riprova.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let document;
    let loadingTask;
    try {
      loadingTask = pdfjs.getDocument({ data: bytes, ...(options.documentOptions || {}) });
      document = await loadingTask.promise;
    } catch (error) {
      if (/password/i.test(String(error?.name || error?.message || ""))) {
        throw new Error("Il PDF è protetto da password e non può essere indicizzato.");
      }
      throw error;
    }
    if (document.numPages > MAX_PDF_PAGES) {
      if (loadingTask?.destroy) await loadingTask.destroy();
      else await document.destroy?.();
      throw new Error(`Il PDF contiene ${document.numPages} pagine: il limite è ${MAX_PDF_PAGES}.`);
    }
    const pages = [];
    try {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        // Safari 26 exposes ReadableStream.getReader(), but not the async iterator
        // used internally by PDF.js getTextContent(). Read the stream explicitly.
        const textContent = await readTextContent(page, { disableNormalization: false });
        pages.push({ page_number: pageNumber, text: textContentToText(textContent) });
        options.onProgress?.({ current: pageNumber, total: document.numPages });
        page.cleanup?.();
      }
    } finally {
      if (loadingTask?.destroy) await loadingTask.destroy();
      else await document.destroy?.();
    }
    return pages;
  }

  return Object.freeze({
    normalizeLine,
    textContentToText,
    readTextContent,
    validatePdfFile,
    cleanPages,
    pagesToChunks,
    extractPdf,
    MAX_PDF_BYTES,
    MAX_PDF_PAGES,
    MIN_PAGE_CHARS
  });
});
