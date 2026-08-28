(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.CucinaHubEpubReaderCore=api})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const MAX_EPUB_BYTES=64*1024*1024,MIN_FONT_SIZE=80,MAX_FONT_SIZE=180,DEFAULT_FONT_SIZE=105,THEMES=Object.freeze(["paper","sepia","night"]);
  function isEpubName(name=""){return String(name).trim().toLocaleLowerCase("it-IT").endsWith(".epub")}
  function validateFile(file){if(!file||!isEpubName(file.name))throw new Error("Seleziona un file EPUB valido.");if(!Number.isFinite(file.size)||file.size<=0)throw new Error("Il file EPUB è vuoto.");if(file.size>MAX_EPUB_BYTES)throw new Error("Il file supera il limite locale di 64 MB.");return file}
  function bookKey(file){validateFile(file);return[file.name.trim().toLocaleLowerCase("it-IT"),file.size,file.lastModified||0].join(":")}
  function progressStorageKey(key){return`cucina-hub:epub-progress:${key}`}
  function settingsStorageKey(){return"cucina-hub:epub-settings:v1"}
  function clampFontSize(value){const parsed=Number(value);if(!Number.isFinite(parsed))return DEFAULT_FONT_SIZE;return Math.min(MAX_FONT_SIZE,Math.max(MIN_FONT_SIZE,Math.round(parsed/5)*5))}
  function normalizeTheme(value){return THEMES.includes(value)?value:"paper"}
  function normalizeToc(items=[],depth=0,output=[]){for(const item of Array.isArray(items)?items:[]){if(!item||!item.href)continue;output.push({href:String(item.href),label:String(item.label||"Capitolo").trim()||"Capitolo",depth:Math.max(0,depth)});normalizeToc(item.subitems,depth+1,output)}return output}
  function progressPercent(location){const percentage=Number(location?.start?.percentage);if(!Number.isFinite(percentage))return null;return Math.max(0,Math.min(100,Math.round(percentage*100)))}
  return Object.freeze({MAX_EPUB_BYTES,MIN_FONT_SIZE,MAX_FONT_SIZE,DEFAULT_FONT_SIZE,THEMES,isEpubName,validateFile,bookKey,progressStorageKey,settingsStorageKey,clampFontSize,normalizeTheme,normalizeToc,progressPercent})
});
