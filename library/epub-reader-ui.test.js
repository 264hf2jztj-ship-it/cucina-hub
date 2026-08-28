const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");

const root=path.join(__dirname,"..");
const html=fs.readFileSync(path.join(__dirname,"reader.html"),"utf8");
const js=fs.readFileSync(path.join(__dirname,"reader.js"),"utf8");
const home=fs.readFileSync(path.join(root,"index.html"),"utf8");
const app=fs.readFileSync(path.join(root,"app.js"),"utf8");
const worker=fs.readFileSync(path.join(root,"sw.js"),"utf8");

test("reader accepts EPUB and PDF while keeping documents local",()=>{
  assert.match(html,/jszip@3\.10\.1/);
  assert.match(html,/epubjs@0\.3\.93/);
  assert.match(html,/accept="\.epub,\.pdf,application\/epub\+zip,application\/pdf"/);
  assert.match(html,/64 MB per EPUB, 128 MB per PDF/);
  assert.match(html,/Nessun caricamento su GitHub, Supabase o OpenAI/);
});

test("EPUB opens binary data with timeouts and a visible render target",()=>{
  assert.match(js,/state\.book\.open\(data,"binary"\)/);
  assert.doesNotMatch(js,/openAs:"epub"/);
  assert.ok((js.match(/core\.withTimeout\(/g)||[]).length>=4);
  assert.ok(js.indexOf("elements.workspace.hidden=false")<js.indexOf("state.book.renderTo"));
  assert.match(js,/allowScriptedContent:false/);
  assert.match(js,/locations\.generate\(1800\)/);
});

test("PDF renders locally with PDF.js and keeps a native full-screen fallback",()=>{
  assert.match(js,/pdfjs-dist@\$\{PDFJS_VERSION\}/);
  assert.match(js,/pdfjs\.getDocument\(/);
  assert.match(js,/page\.render\(/);
  assert.match(js,/document\.createElement\("canvas"\)/);
  assert.match(js,/URL\.createObjectURL\(file\)/);
  assert.match(js,/URL\.revokeObjectURL\(state\.objectUrl\)/);
  assert.match(html,/id="openPdfExternally"[\s\S]*target="_blank"/);
});

test("reader exposes accessible navigation and status",()=>{
  for(const id of["tocSelect","previousPage","nextPage","fontDown","fontUp","themeSelect","progressText","openPdfExternally"]){
    assert.match(html,new RegExp(`id="${id}"`));
  }
  assert.match(html,/aria-live="polite"/);
  assert.match(js,/localStorage\.setItem\(core\.progressStorageKey/);
});

test("Cucina Hub links and caches the document reader",()=>{
  assert.match(home,/library\/reader\.html\?v=2/);
  assert.match(app,/Lettore EPUB e PDF/);
  assert.match(worker,/cucina-hub-v31/);
  for(const asset of["library/reader.html","library/reader.css","library/epub-reader-core.js","library/reader.js"]){
    assert.match(worker,new RegExp(asset.replaceAll(".","\\.")));
  }
});
