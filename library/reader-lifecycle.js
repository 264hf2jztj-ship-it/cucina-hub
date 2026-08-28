"use strict";

(function(){
  function disposeDetachedDocument(detached){
    try{detached.pdfRenderTask?.cancel()}catch(error){console.warn("Annullamento render PDF non riuscito",error)}
    try{detached.rendition?.destroy()}catch(error){console.warn("Chiusura rendition EPUB non riuscita",error)}
    try{detached.book?.destroy()}catch(error){console.warn("Chiusura libro EPUB non riuscita",error)}
    if(detached.objectUrl){
      try{URL.revokeObjectURL(detached.objectUrl)}catch(error){console.warn("Rilascio URL PDF non riuscito",error)}
    }
    if(detached.pdfDoc?.destroy){
      Promise.resolve()
        .then(()=>detached.pdfDoc.destroy())
        .catch(error=>console.warn("Pulizia PDF differita non riuscita",error));
    }
  }

  closeDocument=async function({resetStatus=true}={}){
    state.openToken+=1;
    state.searchToken+=1;

    const detached={
      rendition:state.rendition,
      book:state.book,
      pdfRenderTask:state.pdfRenderTask,
      pdfDoc:state.pdfDoc,
      objectUrl:state.objectUrl
    };

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
    elements.openPdf.hidden=true;
    elements.sidebar.classList.remove("pdf-mode");
    elements.area.classList.remove("pdf-area");
    elements.area.replaceChildren();
    elements.searchResults.replaceChildren();
    elements.bookmarkList.replaceChildren();
    elements.searchProgress.textContent="Inserisci una frase da cercare nel documento.";
    elements.cancelSearch.hidden=true;
    elements.searchButton.disabled=false;
    elements.workspace.hidden=true;
    elements.file.value="";

    const bookmarkPanel=document.querySelector("#bookmarkPanel");
    if(bookmarkPanel)bookmarkPanel.open=false;

    if(resetStatus)setStatus("Documento chiuso. Seleziona un EPUB o PDF per continuare.");

    void disposeDetachedDocument(detached);
  };
})();
