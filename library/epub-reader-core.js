(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.CucinaHubEpubReaderCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const MAX_EPUB_BYTES=64*1024*1024;
  const MAX_PDF_BYTES=128*1024*1024;
  const OPEN_TIMEOUT_MS=30000;
  const RENDER_TIMEOUT_MS=30000;
  const MIN_FONT_SIZE=80;
  const MAX_FONT_SIZE=180;
  const DEFAULT_FONT_SIZE=105;
  const THEMES=Object.freeze(["paper","sepia","night"]);

  function fileFormat(fileOrName=""){
    const name=typeof fileOrName==="string"?fileOrName:fileOrName?.name;
    const normalized=String(name||"").trim().toLocaleLowerCase("it-IT");
    if(normalized.endsWith(".epub"))return"epub";
    if(normalized.endsWith(".pdf"))return"pdf";
    return null;
  }

  function isEpubName(name=""){return fileFormat(name)==="epub"}
  function isPdfName(name=""){return fileFormat(name)==="pdf"}

  function validateFile(file){
    const format=fileFormat(file);
    if(!file||!format)throw new Error("Seleziona un file EPUB o PDF valido.");
    if(!Number.isFinite(file.size)||file.size<=0)throw new Error(`Il file ${format.toUpperCase()} è vuoto.`);
    const maxBytes=format==="epub"?MAX_EPUB_BYTES:MAX_PDF_BYTES;
    if(file.size>maxBytes)throw new Error(`Il file ${format.toUpperCase()} supera il limite locale di ${maxBytes/1024/1024} MB.`);
    return file;
  }

  function bookKey(file){
    validateFile(file);
    return[file.name.trim().toLocaleLowerCase("it-IT"),file.size,file.lastModified||0].join(":");
  }

  function progressStorageKey(key){return`cucina-hub:epub-progress:${key}`}
  function settingsStorageKey(){return"cucina-hub:epub-settings:v1"}

  function withTimeout(promise,timeoutMs,message){
    let timer;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),timeoutMs)})
    ]).finally(()=>clearTimeout(timer));
  }

  function clampFontSize(value){
    const parsed=Number(value);
    if(!Number.isFinite(parsed))return DEFAULT_FONT_SIZE;
    return Math.min(MAX_FONT_SIZE,Math.max(MIN_FONT_SIZE,Math.round(parsed/5)*5));
  }

  function normalizeTheme(value){return THEMES.includes(value)?value:"paper"}

  function normalizeToc(items=[],depth=0,output=[]){
    for(const item of Array.isArray(items)?items:[]){
      if(!item||!item.href)continue;
      output.push({href:String(item.href),label:String(item.label||"Capitolo").trim()||"Capitolo",depth:Math.max(0,depth)});
      normalizeToc(item.subitems,depth+1,output);
    }
    return output;
  }

  function progressPercent(location){
    const percentage=Number(location?.start?.percentage);
    if(!Number.isFinite(percentage))return null;
    return Math.max(0,Math.min(100,Math.round(percentage*100)));
  }

  return Object.freeze({
    MAX_EPUB_BYTES,MAX_PDF_BYTES,OPEN_TIMEOUT_MS,RENDER_TIMEOUT_MS,
    MIN_FONT_SIZE,MAX_FONT_SIZE,DEFAULT_FONT_SIZE,THEMES,
    fileFormat,isEpubName,isPdfName,validateFile,bookKey,progressStorageKey,
    settingsStorageKey,withTimeout,clampFontSize,normalizeTheme,normalizeToc,progressPercent
  });
});
