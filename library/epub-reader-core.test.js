const assert=require("node:assert/strict");
const test=require("node:test");
const core=require("./epub-reader-core.js");

const fakeFile=(name="Libro.epub",size=1024,lastModified=10)=>({name,size,lastModified});

test("recognizes EPUB and PDF documents",()=>{
  assert.equal(core.fileFormat("Libro.EPUB"),"epub");
  assert.equal(core.fileFormat("Manuale.pdf"),"pdf");
  assert.equal(core.fileFormat("note.txt"),null);
  assert.equal(core.isEpubName("Libro.epub"),true);
  assert.equal(core.isPdfName("Manuale.pdf"),true);
});

test("validates format-specific local limits",()=>{
  assert.equal(core.validateFile(fakeFile()).name,"Libro.epub");
  assert.equal(core.validateFile(fakeFile("Manuale.pdf")).name,"Manuale.pdf");
  assert.throws(()=>core.validateFile(fakeFile("Libro.txt")),/EPUB o PDF valido/);
  assert.throws(()=>core.validateFile(fakeFile("Libro.epub",0)),/EPUB è vuoto/);
  assert.throws(()=>core.validateFile(fakeFile("Libro.epub",core.MAX_EPUB_BYTES+1)),/64 MB/);
  assert.throws(()=>core.validateFile(fakeFile("Manuale.pdf",core.MAX_PDF_BYTES+1)),/128 MB/);
});

test("builds a stable device-local progress key",()=>{
  const file=fakeFile("  Libro.EPUB  ",2048,99);
  assert.equal(core.bookKey(file),"libro.epub:2048:99");
  assert.match(core.progressStorageKey(core.bookKey(file)),/^cucina-hub:epub-progress:/);
});

test("stops an operation that does not answer",async()=>{
  await assert.rejects(core.withTimeout(new Promise(()=>{}),5,"tempo scaduto"),/tempo scaduto/);
  assert.equal(await core.withTimeout(Promise.resolve("ok"),50,"errore"),"ok");
});

test("flattens nested table of contents preserving depth",()=>assert.deepEqual(
  core.normalizeToc([{label:"Parte 1",href:"p1.xhtml",subitems:[{label:"Capitolo",href:"c1.xhtml"}]},{label:"Senza link",subitems:[]}]),
  [{label:"Parte 1",href:"p1.xhtml",depth:0},{label:"Capitolo",href:"c1.xhtml",depth:1}]
));

test("normalizes reader preferences and progress",()=>{
  assert.equal(core.clampFontSize(77),80);
  assert.equal(core.clampFontSize(114),115);
  assert.equal(core.clampFontSize(900),180);
  assert.equal(core.normalizeTheme("night"),"night");
  assert.equal(core.normalizeTheme("unknown"),"paper");
  assert.equal(core.progressPercent({start:{percentage:.426}}),43);
  assert.equal(core.progressPercent({}),null);
});
