"use strict";

const core=window.CucinaHubEpubReaderCore;
const $=selector=>document.querySelector(selector);
const PDFJS_VERSION="6.2.108";
const PDFJS_BASE_URL=`https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/`;
const PDFJS_URL=`${PDFJS_BASE_URL}legacy/build/pdf.min.mjs`;
const PDFJS_WORKER_URL=`${PDFJS_BASE_URL}legacy/build/pdf.worker.min.mjs`;
let pdfJsPromise=null;
const elements={
  file:$("#documentFile"),status:$("#readerStatus"),workspace:$("#workspace"),
  title:$("#bookTitle"),author:$("#bookAuthor"),sidebar:$("#readerSidebar"),
  toc:$("#tocSelect"),area:$("#bookArea"),previous:$("#previousPage"),next:$("#nextPage"),
  close:$("#closeBook"),fontDown:$("#fontDown"),fontUp:$("#fontUp"),
  fontValue:$("#fontValue"),theme:$("#themeSelect"),progressText:$("#progressText"),
  progressBar:$("#progressBar"),pageControls:$("#pageControls"),openPdf:$("#openPdfExternally")
};
const state={
  book:null,rendition:null,pdfDoc:null,pdfRenderTask:null,pdfPage:1,key:null,objectUrl:null,format:null,
  fontSize:core.DEFAULT_FONT_SIZE,theme:"paper",openToken:0
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

function renderToc(items){
  const toc=core.normalizeToc(items);
  elements.toc.innerHTML='<option value="">Vai a un capitolo…</option>'+toc.map(item=>{
    const option=document.createElement("option");
    option.value=item.href;
    option.textContent=`${item.depth?"— ".repeat(Math.min(item.depth,3)):""}${item.label}`;
    return option.outerHTML;
  }).join("");
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
}

async function closeDocument({resetStatus=true}={}){
  state.openToken+=1;
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
  elements.openPdf.removeAttribute("href");
  elements.area.replaceChildren();
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
document.addEventListener("keydown",event=>{
  if(!state.rendition||/input|select|textarea/i.test(event.target?.tagName||""))return;
  if(event.key==="ArrowLeft")void state.rendition.prev();
  if(event.key==="ArrowRight")void state.rendition.next();
});
