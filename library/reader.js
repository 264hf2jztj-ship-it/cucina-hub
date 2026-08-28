"use strict";

const core=window.CucinaHubEpubReaderCore;
const $=selector=>document.querySelector(selector);
const PDFJS_VERSION="6.2.108";
const PDFJS_BASE_URL=`https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/`;
const PDFJS_URL=`${PDFJS_BASE_URL}legacy/build/pdf.min.mjs`;
const PDFJS_WORKER_URL=`${PDFJS_BASE_URL}legacy/build/pdf.worker.min.mjs`;
const MAX_SEARCH_RESULTS=100;
const MAX_BOOKMARKS=50;
let pdfJsPromise=null;
const elements={
  file:$("#documentFile"),status:$("#readerStatus"),workspace:$("#workspace"),
  title:$("#bookTitle"),author:$("#bookAuthor"),sidebar:$("#readerSidebar"),
  toc:$("#tocSelect"),area:$("#bookArea"),previous:$("#previousPage"),next:$("#nextPage"),
  close:$("#closeBook"),fontDown:$("#fontDown"),fontUp:$("#fontUp"),
  fontValue:$("#fontValue"),theme:$("#themeSelect"),progressText:$("#progressText"),
  progressBar:$("#progressBar"),pageControls:$("#pageControls"),openPdf:$("#openPdfExternally"),
  searchForm:$("#searchForm"),searchInput:$("#documentSearch"),searchButton:$("#searchDocument"),
  cancelSearch:$("#cancelSearch"),searchProgress:$("#searchProgress"),searchResults:$("#searchResults"),
  addBookmark:$("#addBookmark"),bookmarkList:$("#bookmarkList")
};
const state={
  book:null,rendition:null,pdfDoc:null,pdfRenderTask:null,pdfPage:1,key:null,objectUrl:null,format:null,
  fontSize:core.DEFAULT_FONT_SIZE,theme:"paper",openToken:0,searchToken:0,searchResults:[]
};

function setStatus(message,type=""){
  elements.status.textContent=message;
  elements.status.className=`reader-status${type?` ${type}`:""}`;
}

function readJson(key,fallback){
  try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}
}

function saveSettings(){
  localStorage.setItem(core.settingsStorageKey(),JSON.stringify({fontSize:state.fontSize,theme:state.theme}));
}

function loadSettings(){
  const settings=readJson(core.settingsStorageKey(),{});
  state.fontSize=core.clampFontSize(settings.fontSize);
  state.theme=core.normalizeTheme(settings.theme);
  elements.fontValue.textContent=`${state.fontSize}%`;
  elements.theme.value=state.theme;
}

function applyTheme(){
  if(!state.rendition)return;
  state.rendition.themes.register("paper",{body:{color:"#202923",background:"#fff"},a:{color:"#365d44"}});
  state.rendition.themes.register("sepia",{body:{color:"#3d3226",background:"#f4ead7"},a:{color:"#785a32"}});
  state.rendition.themes.register("night",{body:{color:"#e9eee9",background:"#1c2420"},a:{color:"#9fd1ad"}});
  state.rendition.themes.select(state.theme);
  state.rendition.themes.fontSize(`${state.fontSize}%`);
}

function saveProgress(location){
  if(!state.key||!location?.start?.cfi)return;
  const generated=state.book?.locations?.length()?state.book.locations.percentageFromCfi(location.start.cfi):null;
  const percent=core.progressPercent(location)??(Number.isFinite(generated)?Math.round(generated*100):null);
  localStorage.setItem(core.progressStorageKey(state.key),JSON.stringify({
    cfi:location.start.cfi,percent,updatedAt:new Date().toISOString()
  }));
  elements.progressText.textContent=percent===null?"Posizione salvata":`${percent}%`;
  elements.progressBar.style.width=`${percent??0}%`;
}

function bookmarkStorageKey(){
  return state.key?`cucina-hub:reader-bookmarks:${state.key}`:null;
}

function normalizeBookmarks(value){
  const items=Array.isArray(value)?value:[];
  return items.flatMap(item=>{
    if(!item||typeof item!=="object"||typeof item.createdAt!=="string")return[];
    if(item.format==="epub"&&typeof item.cfi==="string"&&item.cfi)return[{format:"epub",cfi:item.cfi,createdAt:item.createdAt}];
    if(item.format==="pdf"&&Number.isInteger(item.page)&&item.page>0)return[{format:"pdf",page:item.page,createdAt:item.createdAt}];
    return[];
  }).slice(0,MAX_BOOKMARKS);
}

function loadBookmarks(){
  const key=bookmarkStorageKey();
  return key?normalizeBookmarks(readJson(key,[])):[];
}

function saveBookmarks(bookmarks){
  const key=bookmarkStorageKey();
  if(!key)return;
  const safe=normalizeBookmarks(bookmarks).slice(0,MAX_BOOKMARKS);
  localStorage.setItem(key,JSON.stringify(safe));
}

function formatBookmarkDate(value){
  const date=new Date(value);
  return Number.isNaN(date.getTime())?"data non disponibile":date.toLocaleString("it-IT",{dateStyle:"short",timeStyle:"short"});
}

function renderBookmarks(){
  const bookmarks=loadBookmarks();
  elements.bookmarkList.replaceChildren();
  if(!bookmarks.length){
    const empty=document.createElement("li");
    empty.className="tool-empty";
    empty.textContent="Nessun segnalibro per questo documento.";
    elements.bookmarkList.append(empty);
    return;
  }
  bookmarks.forEach((bookmark,index)=>{
    const item=document.createElement("li");
    const open=document.createElement("button");
    const remove=document.createElement("button");
    open.type="button";
    open.className="bookmark-open";
    open.dataset.bookmarkIndex=String(index);
    open.textContent=bookmark.format==="pdf"
      ?`Pagina ${bookmark.page} · ${formatBookmarkDate(bookmark.createdAt)}`
      :`Posizione EPUB · ${formatBookmarkDate(bookmark.createdAt)}`;
    remove.type="button";
    remove.className="bookmark-remove";
    remove.dataset.removeBookmark=String(index);
    remove.setAttribute("aria-label","Elimina segnalibro");
    remove.textContent="×";
    item.append(open,remove);
    elements.bookmarkList.append(item);
  });
}

function addCurrentBookmark(){
  if(!state.key||!state.format)return;
  let bookmark=null;
  if(state.format==="pdf"&&state.pdfDoc){
    bookmark={format:"pdf",page:state.pdfPage,createdAt:new Date().toISOString()};
  }else if(state.format==="epub"&&state.rendition){
    const cfi=state.rendition.currentLocation()?.start?.cfi;
    if(cfi)bookmark={format:"epub",cfi,createdAt:new Date().toISOString()};
  }
  if(!bookmark){
    setStatus("Non riesco a determinare la posizione corrente per il segnalibro.","error");
    return;
  }
  const bookmarks=loadBookmarks();
  const samePosition=item=>bookmark.format==="pdf"
    ?item.format==="pdf"&&item.page===bookmark.page
    :item.format==="epub"&&item.cfi===bookmark.cfi;
  const next=[bookmark,...bookmarks.filter(item=>!samePosition(item))].slice(0,MAX_BOOKMARKS);
  saveBookmarks(next);
  renderBookmarks();
  setStatus("Segnalibro salvato solo su questo dispositivo.");
}

async function openBookmark(index){
  const bookmark=loadBookmarks()[index];
  if(!bookmark)return;
  if(bookmark.format==="pdf"&&state.pdfDoc){
    await renderPdfPage(bookmark.page);
  }else if(bookmark.format==="epub"&&state.rendition){
    await state.rendition.display(bookmark.cfi);
  }
}

function removeBookmark(index){
  const bookmarks=loadBookmarks();
  if(index<0||index>=bookmarks.length)return;
  bookmarks.splice(index,1);
  saveBookmarks(bookmarks);
  renderBookmarks();
  setStatus("Segnalibro eliminato.");
}

function renderToc(items){
  const toc=core.normalizeToc(items);
  elements.toc.innerHTML='<option value="">Vai a un capitolo…</option>'+toc.map(item=>{
    const option=document.createElement("option");
    option.value=item.href;
    option.textContent=`${item.depth?"— ".repeat(Math.min(item.depth,3)):""}${item.label}`;
    return option.outerHTML;
  }).join("");
}

function resetSearch(message="Inserisci una frase da cercare nel documento."){
  state.searchToken+=1;
  state.searchResults=[];
  elements.searchResults.replaceChildren();
  elements.searchProgress.textContent=message;
  elements.cancelSearch.hidden=true;
  elements.searchButton.disabled=false;
}

function setFormat(format){
  state.format=format;
  elements.sidebar.classList.toggle("pdf-mode",format==="pdf");
  elements.pageControls.hidden=!format;
  elements.openPdf.hidden=format!=="pdf";
  elements.area.classList.toggle("pdf-area",format==="pdf");
  if(format==="epub"){
    elements.previous.disabled=false;
    elements.next.disabled=false;
  }
  resetSearch();
  renderBookmarks();
}

async function closeDocument({resetStatus=true}={}){
  state.openToken+=1;
  state.searchToken+=1;
  if(state.rendition)state.rendition.destroy();
  if(state.book)state.book.destroy();
  if(state.pdfRenderTask)state.pdfRenderTask.cancel();
  if(state.pdfDoc)await state.pdfDoc.destroy();
  if(state.objectUrl)URL.revokeObjectURL(state.objectUrl);
  state.book=null;
  state.rendition=null;
  state.pdfDoc=null;
  state.pdfRenderTask=null;
  state.pdfPage=1;
  state.key=null;
  state.objectUrl=null;
  state.format=null;
  state.searchResults=[];
  elements.openPdf.removeAttribute("href");
  elements.area.replaceChildren();
  elements.searchResults.replaceChildren();
  elements.bookmarkList.replaceChildren();
  elements.searchProgress.textContent="Inserisci una frase da cercare nel documento.";
  elements.cancelSearch.hidden=true;
  elements.searchButton.disabled=false;
  elements.workspace.hidden=true;
  elements.file.value="";
  if(resetStatus)setStatus("Documento chiuso. Seleziona un EPUB o PDF per continuare.");
}

async function openEpub(file,token){
  if(typeof window.ePub!=="function"||typeof window.JSZip!=="function"){
    throw new Error("Il motore EPUB non è disponibile. Controlla la connessione e riprova.");
  }

  setStatus(`Lettura di ${file.name}…`);
  const data=await core.withTimeout(
    file.arrayBuffer(),core.OPEN_TIMEOUT_MS,
    "La lettura del file EPUB ha richiesto troppo tempo. Riprova dopo aver chiuso le altre app."
  );
  if(token!==state.openToken)return;

  setStatus("Apertura dell’archivio EPUB…");
  state.book=window.ePub();
  await core.withTimeout(
    state.book.open(data,"binary"),core.OPEN_TIMEOUT_MS,
    "Non riesco ad aprire l’archivio EPUB. Il file potrebbe essere protetto, danneggiato o non compatibile."
  );
  if(token!==state.openToken)return;

  setStatus("Lettura di titolo e indice…");
  const[metadata,navigation]=await core.withTimeout(
    Promise.all([state.book.loaded.metadata,state.book.loaded.navigation]),
    core.OPEN_TIMEOUT_MS,
    "L’EPUB è aperto, ma titolo o indice non rispondono. Prova un’altra copia del file."
  );
  if(token!==state.openToken)return;

  elements.title.textContent=metadata.title||file.name.replace(/\.epub$/i,"");
  elements.author.textContent=metadata.creator||"Autore non indicato";
  renderToc(navigation.toc);
  setFormat("epub");
  elements.workspace.hidden=false;

  state.rendition=state.book.renderTo(elements.area,{
    width:"100%",height:"100%",flow:"paginated",spread:"none",allowScriptedContent:false
  });
  applyTheme();
  state.rendition.on("relocated",saveProgress);
  const saved=readJson(core.progressStorageKey(state.key),null);

  setStatus("Preparazione della prima pagina…");
  await core.withTimeout(
    state.rendition.display(saved?.cfi||undefined),core.RENDER_TIMEOUT_MS,
    "L’EPUB è stato letto, ma la prima pagina non può essere visualizzata. Prova a riaprire il file."
  );
  if(token!==state.openToken)return;

  if(saved?.percent!==null&&saved?.percent!==undefined){
    elements.progressText.textContent=`${saved.percent}%`;
    elements.progressBar.style.width=`${saved.percent}%`;
  }
  setStatus(saved?.cfi?"Libro aperto dal punto in cui avevi interrotto.":"Libro aperto. La posizione verrà salvata automaticamente.");
  elements.area.focus({preventScroll:true});
  state.book.locations.generate(1800).then(()=>{
    const location=state.rendition?.currentLocation();
    if(location)saveProgress(location);
  }).catch(error=>console.warn("Calcolo avanzamento EPUB non disponibile",error));
}

async function loadPdfJs(){
  if(!pdfJsPromise){
    pdfJsPromise=import(PDFJS_URL).then(pdfjs=>{
      pdfjs.GlobalWorkerOptions.workerSrc=PDFJS_WORKER_URL;
      return pdfjs;
    }).catch(error=>{
      pdfJsPromise=null;
      throw error;
    });
  }
  return pdfJsPromise;
}

async function renderPdfPage(pageNumber){
  if(!state.pdfDoc)return;
  const pdfDoc=state.pdfDoc;
  const bounded=Math.max(1,Math.min(pdfDoc.numPages,pageNumber));
  state.pdfPage=bounded;
  if(state.pdfRenderTask)state.pdfRenderTask.cancel();
  setStatus(`Preparazione pagina ${bounded} di ${pdfDoc.numPages}…`);

  const page=await pdfDoc.getPage(bounded);
  if(pdfDoc!==state.pdfDoc)return;
  const baseViewport=page.getViewport({scale:1});
  const availableWidth=Math.max(280,elements.area.clientWidth-24);
  const scale=Math.min(2.2,Math.max(.5,availableWidth/baseViewport.width));
  const viewport=page.getViewport({scale});
  const pixelRatio=Math.min(2,window.devicePixelRatio||1);
  const canvas=document.createElement("canvas");
  canvas.className="pdf-canvas";
  canvas.width=Math.floor(viewport.width*pixelRatio);
  canvas.height=Math.floor(viewport.height*pixelRatio);
  canvas.style.width=`${Math.floor(viewport.width)}px`;
  canvas.style.height=`${Math.floor(viewport.height)}px`;
  elements.area.replaceChildren(canvas);

  state.pdfRenderTask=page.render({
    canvasContext:canvas.getContext("2d",{alpha:false}),viewport,
    transform:pixelRatio===1?null:[pixelRatio,0,0,pixelRatio,0,0]
  });
  await core.withTimeout(
    state.pdfRenderTask.promise,core.RENDER_TIMEOUT_MS,
    `La pagina ${bounded} del PDF ha richiesto troppo tempo.`
  );
  state.pdfRenderTask=null;
  elements.progressText.textContent=`${bounded} / ${pdfDoc.numPages}`;
  elements.progressBar.style.width=`${Math.round(bounded/pdfDoc.numPages*100)}%`;
  elements.previous.disabled=bounded<=1;
  elements.next.disabled=bounded>=pdfDoc.numPages;
  elements.area.scrollTo({top:0,behavior:"auto"});
  setStatus(`PDF aperto — pagina ${bounded} di ${pdfDoc.numPages}.`);
}

function showPdfPage(pageNumber){
  renderPdfPage(pageNumber).catch(error=>{
    if(error?.name==="RenderingCancelledException")return;
    console.error(error);
    setStatus(error.message||"Non riesco a visualizzare questa pagina PDF.","error");
  });
}

async function openPdf(file){
  setFormat("pdf");
  elements.title.textContent=file.name.replace(/\.pdf$/i,"");
  elements.author.textContent="Documento PDF locale";
  elements.progressText.textContent="Caricamento…";
  elements.progressBar.style.width="0";
  state.objectUrl=URL.createObjectURL(file);
  elements.openPdf.href=state.objectUrl;
  elements.workspace.hidden=false;
  setStatus(`Lettura di ${file.name}…`);

  let pdfjs;
  try{
    pdfjs=await core.withTimeout(
      loadPdfJs(),core.OPEN_TIMEOUT_MS,
      "Il lettore PDF non è stato caricato. Controlla la connessione oppure apri il file a schermo intero."
    );
  }catch(error){
    elements.area.innerHTML='<div class="pdf-fallback"><p>Il visualizzatore integrato non è disponibile.</p><p>Usa il pulsante <strong>APRI PDF A SCHERMO INTERO</strong>.</p></div>';
    setStatus(error.message,"error");
    return;
  }

  const bytes=new Uint8Array(await core.withTimeout(
    file.arrayBuffer(),core.OPEN_TIMEOUT_MS*2,
    "La lettura del PDF ha richiesto troppo tempo. Riprova dopo aver chiuso le altre app."
  ));
  const loadingTask=pdfjs.getDocument({
    data:bytes,isEvalSupported:false,
    cMapUrl:`${PDFJS_BASE_URL}cmaps/`,cMapPacked:true,
    standardFontDataUrl:`${PDFJS_BASE_URL}standard_fonts/`,
    wasmUrl:`${PDFJS_BASE_URL}wasm/`
  });
  state.pdfDoc=await core.withTimeout(
    loadingTask.promise,core.OPEN_TIMEOUT_MS*2,
    "Il PDF non risponde. Potrebbe essere protetto, danneggiato o troppo complesso."
  );
  await renderPdfPage(1);
}

async function openDocument(file){
  core.validateFile(file);
  await closeDocument({resetStatus:false});
  const token=state.openToken;
  state.key=core.bookKey(file);
  const format=core.fileFormat(file);
  if(format==="pdf")await openPdf(file);
  else await openEpub(file,token);
}

function searchExcerpt(text,query,index){
  const clean=String(text||"").replace(/\s+/g," ").trim();
  const start=Math.max(0,index-52);
  const end=Math.min(clean.length,index+query.length+72);
  return`${start>0?"…":""}${clean.slice(start,end)}${end<clean.length?"…":""}`;
}

function findExactMatches(text,query,limit){
  const source=String(text||"").replace(/\s+/g," ").trim();
  const haystack=source.toLocaleLowerCase("it-IT");
  const needle=query.toLocaleLowerCase("it-IT");
  const matches=[];
  let offset=0;
  while(matches.length<limit){
    const index=haystack.indexOf(needle,offset);
    if(index<0)break;
    matches.push({index,excerpt:searchExcerpt(source,query,index)});
    offset=index+Math.max(1,needle.length);
  }
  return matches;
}

function renderSearchResults(){
  elements.searchResults.replaceChildren();
  if(!state.searchResults.length)return;
  state.searchResults.forEach((result,index)=>{
    const item=document.createElement("li");
    const button=document.createElement("button");
    const where=document.createElement("strong");
    const excerpt=document.createElement("span");
    button.type="button";
    button.className="search-result";
    button.dataset.searchIndex=String(index);
    where.textContent=result.format==="pdf"?`Pagina ${result.page}`:`Risultato EPUB ${index+1}`;
    excerpt.textContent=result.excerpt||"Apri questo risultato";
    button.append(where,excerpt);
    item.append(button);
    elements.searchResults.append(item);
  });
}

async function searchEpub(query,token){
  const sections=state.book?.spine?.spineItems||[];
  for(let index=0;index<sections.length&&state.searchResults.length<MAX_SEARCH_RESULTS;index+=1){
    if(token!==state.searchToken)return false;
    const section=sections[index];
    try{
      await section.load(state.book.load.bind(state.book));
      if(token!==state.searchToken){section.unload?.();return false}
      const remaining=MAX_SEARCH_RESULTS-state.searchResults.length;
      const found=typeof section.find==="function"?section.find(query).slice(0,remaining):[];
      state.searchResults.push(...found.map(match=>({
        format:"epub",cfi:match.cfi,excerpt:String(match.excerpt||query).replace(/\s+/g," ").trim()
      })));
    }finally{
      section.unload?.();
    }
    elements.searchProgress.textContent=`Ricerca EPUB: ${index+1} di ${sections.length} sezioni · ${state.searchResults.length} risultati`;
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  return token===state.searchToken;
}

async function searchPdf(query,token){
  const pdfDoc=state.pdfDoc;
  if(!pdfDoc)return false;
  for(let pageNumber=1;pageNumber<=pdfDoc.numPages&&state.searchResults.length<MAX_SEARCH_RESULTS;pageNumber+=1){
    if(token!==state.searchToken)return false;
    const page=await pdfDoc.getPage(pageNumber);
    try{
      const content=await page.getTextContent();
      if(token!==state.searchToken)return false;
      const text=content.items.map(item=>item.str||"").join(" ");
      const remaining=MAX_SEARCH_RESULTS-state.searchResults.length;
      state.searchResults.push(...findExactMatches(text,query,remaining).map(match=>({
        format:"pdf",page:pageNumber,excerpt:match.excerpt
      })));
    }finally{
      page.cleanup?.();
    }
    elements.searchProgress.textContent=`Ricerca PDF: pagina ${pageNumber} di ${pdfDoc.numPages} · ${state.searchResults.length} risultati`;
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  return token===state.searchToken;
}

async function runSearch(){
  const query=elements.searchInput.value.trim();
  if(!state.format||(!state.book&&!state.pdfDoc)){
    elements.searchProgress.textContent="Apri prima un documento.";
    return;
  }
  if(query.length<2){
    elements.searchProgress.textContent="Inserisci almeno 2 caratteri.";
    elements.searchInput.focus();
    return;
  }
  state.searchToken+=1;
  const token=state.searchToken;
  state.searchResults=[];
  renderSearchResults();
  elements.searchButton.disabled=true;
  elements.cancelSearch.hidden=false;
  elements.searchProgress.textContent="Avvio ricerca locale…";
  try{
    const completed=state.format==="pdf"?await searchPdf(query,token):await searchEpub(query,token);
    if(!completed||token!==state.searchToken)return;
    renderSearchResults();
    const capped=state.searchResults.length>=MAX_SEARCH_RESULTS;
    elements.searchProgress.textContent=state.searchResults.length
      ?`${state.searchResults.length} risultati${capped?` (limite ${MAX_SEARCH_RESULTS})`:""}. Tocca un risultato per aprirlo.`
      :"Nessun risultato. La ricerca resta solo in memoria sul dispositivo.";
  }catch(error){
    if(token!==state.searchToken)return;
    console.error(error);
    elements.searchProgress.textContent=error.message||"Ricerca non riuscita.";
  }finally{
    if(token===state.searchToken){
      elements.searchButton.disabled=false;
      elements.cancelSearch.hidden=true;
    }
  }
}

async function openSearchResult(index){
  const result=state.searchResults[index];
  if(!result)return;
  if(result.format==="pdf"&&state.pdfDoc){
    await renderPdfPage(result.page);
  }else if(result.format==="epub"&&state.rendition){
    await state.rendition.display(result.cfi);
  }
}

function cancelSearch(){
  state.searchToken+=1;
  elements.searchButton.disabled=false;
  elements.cancelSearch.hidden=true;
  elements.searchProgress.textContent="Ricerca annullata. I risultati parziali non vengono salvati.";
}

function changeFont(delta){
  state.fontSize=core.clampFontSize(state.fontSize+delta);
  elements.fontValue.textContent=`${state.fontSize}%`;
  state.rendition?.themes.fontSize(`${state.fontSize}%`);
  saveSettings();
}

loadSettings();
elements.file.addEventListener("change",()=>{
  const file=elements.file.files?.[0];
  if(!file)return;
  openDocument(file).catch(async error=>{
    console.error(error);
    await closeDocument({resetStatus:false});
    setStatus(error.message,"error");
  });
});
elements.previous.addEventListener("click",()=>{
  if(state.pdfDoc)showPdfPage(state.pdfPage-1);
  else void state.rendition?.prev();
});
elements.next.addEventListener("click",()=>{
  if(state.pdfDoc)showPdfPage(state.pdfPage+1);
  else void state.rendition?.next();
});
elements.close.addEventListener("click",()=>void closeDocument());
elements.fontDown.addEventListener("click",()=>changeFont(-10));
elements.fontUp.addEventListener("click",()=>changeFont(10));
elements.theme.addEventListener("change",()=>{
  state.theme=core.normalizeTheme(elements.theme.value);
  applyTheme();
  saveSettings();
});
elements.toc.addEventListener("change",()=>{
  if(elements.toc.value)void state.rendition?.display(elements.toc.value);
});
elements.searchForm.addEventListener("submit",event=>{
  event.preventDefault();
  void runSearch();
});
elements.cancelSearch.addEventListener("click",cancelSearch);
elements.searchResults.addEventListener("click",event=>{
  const button=event.target.closest("[data-search-index]");
  if(button)void openSearchResult(Number(button.dataset.searchIndex));
});
elements.addBookmark.addEventListener("click",addCurrentBookmark);
elements.bookmarkList.addEventListener("click",event=>{
  const remove=event.target.closest("[data-remove-bookmark]");
  if(remove){removeBookmark(Number(remove.dataset.removeBookmark));return}
  const open=event.target.closest("[data-bookmark-index]");
  if(open)void openBookmark(Number(open.dataset.bookmarkIndex));
});
document.addEventListener("keydown",event=>{
  if(!state.rendition||/input|select|textarea/i.test(event.target?.tagName||""))return;
  if(event.key==="ArrowLeft")void state.rendition.prev();
  if(event.key==="ArrowRight")void state.rendition.next();
});
