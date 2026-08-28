const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");

const root=path.join(__dirname,"..");
const html=fs.readFileSync(path.join(__dirname,"reader.html"),"utf8");
const js=fs.readFileSync(path.join(__dirname,"reader.js"),"utf8");
const lifecycle=fs.readFileSync(path.join(__dirname,"reader-lifecycle.js"),"utf8");
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
  assert.match(lifecycle,/URL\.revokeObjectURL\(detached\.objectUrl\)/);
  assert.match(html,/id="openPdfExternally"[\s\S]*target="_blank"/);
});

test("reader exposes accessible navigation and status",()=>{
  for(const id of["tocSelect","previousPage","nextPage","fontDown","fontUp","themeSelect","progressText","openPdfExternally"]){
    assert.match(html,new RegExp(`id="${id}"`));
  }
  assert.match(html,/aria-live="polite"/);
  assert.match(js,/localStorage\.setItem\(core\.progressStorageKey/);
});

test("reader searches EPUB and PDF locally with bounded cancellable scans",()=>{
  for(const id of["documentSearch","searchDocument","cancelSearch","searchProgress","searchResults"]){
    assert.match(html,new RegExp(`id="${id}"`));
  }
  assert.match(js,/const MAX_SEARCH_RESULTS=100/);
  assert.match(js,/state\.book\?\.spine\?\.spineItems/);
  assert.match(js,/section\.find\(query\)/);
  assert.match(js,/page\.getTextContent\(\)/);
  assert.match(js,/state\.searchToken\+=1/);
  assert.match(js,/Ricerca PDF: pagina/);
  assert.match(js,/Ricerca EPUB:/);
});

test("search results jump to the matching EPUB position or PDF page without persistence",()=>{
  assert.match(js,/state\.rendition\.display\(result\.cfi\)/);
  assert.match(js,/renderPdfPage\(result\.page\)/);
  assert.match(html,/Ricerca e risultati non vengono salvati o indicizzati/);
  assert.doesNotMatch(js,/localStorage\.setItem\([^\n]*search/i);
});

test("bookmarks stay local, store only position or page plus date, and are capped at 50",()=>{
  for(const id of["addBookmark","bookmarkList"]){
    assert.match(html,new RegExp(`id="${id}"`));
  }
  assert.match(js,/const MAX_BOOKMARKS=50/);
  assert.match(js,/cucina-hub:reader-bookmarks:/);
  assert.match(js,/\{format:"epub",cfi:item\.cfi,createdAt:item\.createdAt\}/);
  assert.match(js,/\{format:"pdf",page:item\.page,createdAt:item\.createdAt\}/);
  assert.match(js,/samePosition/);
  assert.match(html,/Solo posizione\/pagina e data, massimo 50 per documento/);
});

test("bookmark list is collapsed behind a bookmark icon by default",()=>{
  assert.match(html,/<details id="bookmarkPanel" class="reader-toolbox bookmark-panel">/);
  assert.match(html,/<summary class="bookmark-summary">[\s\S]*🔖[\s\S]*Segnalibri[\s\S]*<\/summary>/);
  assert.doesNotMatch(html,/<details id="bookmarkPanel"[^>]*\sopen(?:\s|>)/);
});

test("closing a PDF resets the UI immediately and defers potentially slow PDF destruction",()=>{
  assert.match(html,/reader-lifecycle\.js\?v=1/);
  assert.match(lifecycle,/const detached=\{/);
  assert.match(lifecycle,/state\.pdfDoc=null/);
  assert.match(lifecycle,/elements\.workspace\.hidden=true/);
  assert.match(lifecycle,/void disposeDetachedDocument\(detached\)/);
  assert.match(lifecycle,/Promise\.resolve\(\)[\s\S]*detached\.pdfDoc\.destroy\(\)/);
  assert.ok(lifecycle.indexOf("elements.workspace.hidden=true")<lifecycle.indexOf("void disposeDetachedDocument(detached)"));
});

test("Cucina Hub links and caches the document reader",()=>{
  assert.match(home,/library\/reader\.html\?v=2/);
  assert.match(app,/Lettore EPUB e PDF/);
  assert.match(worker,/cucina-hub-v33/);
  for(const asset of["library/reader.html","library/reader.css","library/epub-reader-core.js","library/reader.js","library/reader-lifecycle.js"]){
    assert.match(worker,new RegExp(asset.replaceAll(".","\\.")));
  }
});
