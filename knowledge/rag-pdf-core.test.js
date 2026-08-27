"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const pdfCore = require("./rag-pdf-core.js");
const ingestionCore = require("./rag-ingestion-core.js");

function fakeFile(name = "manuale.pdf", size = 1000, type = "application/pdf") {
  return { name, type, size, arrayBuffer: async () => new ArrayBuffer(16) };
}

test("accepts bounded PDFs and rejects invalid files", () => {
  assert.equal(pdfCore.validatePdfFile(fakeFile()), true);
  assert.throws(() => pdfCore.validatePdfFile(fakeFile("manuale.txt", 1000, "text/plain")), /non è un PDF/);
  assert.throws(() => pdfCore.validatePdfFile(fakeFile("manuale.pdf", pdfCore.MAX_PDF_BYTES + 1)), /25 MB/);
});

test("reconstructs readable lines from PDF.js text items", () => {
  const text = pdfCore.textContentToText({ items: [
    { str: "Guida", hasEOL: false },
    { str: "Hurom", hasEOL: true },
    { str: "Apri", hasEOL: false },
    { str: "il tappo.", hasEOL: true }
  ] });
  assert.equal(text, "Guida Hurom\nApri il tappo.");
});

test("removes repeated headers and preserves page locators", () => {
  const pages = [1, 2, 3].map(number => ({
    page_number: number,
    text: `HUROM E30ST\n${number}\nSezione ${number}\n${"Testo operativo della pagina. ".repeat(35)}`
  }));
  const result = pdfCore.pagesToChunks(pages, { ingestionCore, heading: "Manuale Hurom" });
  assert.equal(result.page_count, 3);
  assert.equal(result.indexed_page_count, 3);
  assert.ok(result.chunks.every(item => /^Pagina [123]/.test(item.locator)));
  assert.ok(result.chunks.every(item => !item.content.includes("HUROM E30ST")));
});

test("extracts pages locally and reports progress", async () => {
  const progress = [];
  let destroyed = false;
  const pdfjs = {
    getDocument() {
      return { destroy: async () => { destroyed = true; }, promise: Promise.resolve({
        numPages: 2,
        async getPage(number) {
          return { getTextContent: async () => ({ items: [{ str: `Pagina ${number} con testo selezionabile sufficiente.`, hasEOL: true }] }) };
        }
      }) };
    }
  };
  const pages = await pdfCore.extractPdf(fakeFile(), { pdfjs, onProgress: item => progress.push(item) });
  assert.equal(pages.length, 2);
  assert.deepEqual(progress, [{ current: 1, total: 2 }, { current: 2, total: 2 }]);
  assert.equal(destroyed, true);
});

test("passes local extraction resource options to PDF.js", async () => {
  let received;
  const pdfjs = {
    getDocument(options) {
      received = options;
      return { destroy: async () => {}, promise: Promise.resolve({
        numPages: 1,
        async getPage() {
          return { getTextContent: async () => ({ items: [{ str: "Testo PDF selezionabile e sufficiente.", hasEOL: true }] }) };
        }
      }) };
    }
  };
  await pdfCore.extractPdf(fakeFile(), { pdfjs, documentOptions: { cMapUrl: "https://example.test/cmaps/", cMapPacked: true } });
  assert.equal(received.cMapUrl, "https://example.test/cmaps/");
  assert.equal(received.cMapPacked, true);
  assert.ok(received.data instanceof Uint8Array);
});

test("rejects image-only PDFs before ingestion", () => {
  assert.throws(
    () => pdfCore.pagesToChunks([{ page_number: 1, text: "" }], { ingestionCore }),
    /richiedono OCR/
  );
});
