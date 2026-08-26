(function () {
  "use strict";

  const $ = selector => document.querySelector(selector);
  const labels = {
    indexed: "Indicizzata per l’AI",
    metadata_only: "Solo metadati",
    unavailable: "Non disponibile all’AI"
  };
  const kinds = {
    manual: "Manuale",
    course: "Corso",
    knowledge_object: "Knowledge Object"
  };
  let sources = [];
  let loading = false;
  let ingestionChunks = [];
  let ingestionHash = "";

  function client() {
    return window.cucinaHubSupabase;
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>\'\"]/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      "\"": "&quot;"
    })[character]);
  }

  function status(text, kind = "") {
    $("#pageStatus").textContent = text;
    $("#pageStatus").className = `knowledge-status ${kind}`;
  }

  function showRetry(visible) {
    $("#retryLoad").hidden = !visible;
  }

  function sourceKind(item) {
    return item.manual_id ? "manual" : item.course_id ? "course" : "knowledge_object";
  }

  function renderStats() {
    $("#indexedCount").textContent = sources.filter(item => item.access_status === "indexed").length;
    $("#metadataCount").textContent = sources.filter(item => item.access_status === "metadata_only").length;
    $("#unavailableCount").textContent = sources.filter(item => item.access_status === "unavailable").length;
    $("#chunkCount").textContent = sources.reduce((total, item) => total + Number(item.chunk_count || 0), 0);
  }

  function renderSources() {
    const filter = $("#statusFilter").value;
    const items = filter === "all" ? sources : sources.filter(item => item.access_status === filter);
    $("#sourceList").innerHTML = items.length
      ? items.map(item => {
        const kind = sourceKind(item);
        const actionLabel = Number(item.chunk_count || 0) > 0 ? "AGGIORNA INDICE" : "INDICIZZA TESTO";
        return `<article class="rag-card"><div class="rag-card-head"><div><h3>${esc(item.display_name)}</h3><small>${esc(kinds[kind])} · originale ${esc(item.original_provider)}</small></div><span class="rag-badge ${esc(item.access_status)}">${esc(labels[item.access_status])}</span></div><div class="rag-meta">${Number(item.chunk_count || 0)} frammenti${item.source_locator ? " · riferimento esterno conservato" : ""}</div><div class="rag-card-actions"><button class="button secondary" type="button" data-index-source="${esc(item.id)}">${actionLabel}</button></div></article>`;
      }).join("")
      : '<p class="muted">Nessuna fonte in questo stato.</p>';
  }

  function delay(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
  }

  async function retryNetwork(operation) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await operation();
        if (result?.error) throw result.error;
        return result;
      } catch (error) {
        lastError = error;
        if (attempt === 0) await delay(450);
      }
    }
    throw lastError;
  }

  function friendlyLoadError(error) {
    const message = String(error?.message || error || "");
    if (/load failed|failed to fetch|network|fetch/i.test(message)) {
      return "Connessione a Supabase non riuscita. Controlla la rete e premi Riprova.";
    }
    return message || "Impossibile caricare le fonti AI. Premi Riprova.";
  }

  function ingestionStatus(text, kind = "") {
    $("#ingestionStatus").textContent = text;
    $("#ingestionStatus").className = `knowledge-status ${kind}`;
  }

  function invalidateIngestionPreview() {
    ingestionChunks = [];
    ingestionHash = "";
    $("#ingestionPreview").hidden = true;
    $("#confirmIngestion").disabled = true;
    ingestionStatus("");
  }

  function renderIngestionSources() {
    const select = $("#ingestionSource");
    const selected = select.value;
    select.innerHTML = sources.map(item => `<option value="${esc(item.id)}">${esc(item.display_name)}</option>`).join("");
    if (sources.some(item => item.id === selected)) select.value = selected;
  }

  function openIngestion(sourceId) {
    renderIngestionSources();
    if (sourceId) $("#ingestionSource").value = sourceId;
    invalidateIngestionPreview();
    $("#ingestionPanel").hidden = false;
    $("#ingestionPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeIngestion() {
    $("#ingestionPanel").hidden = true;
    $("#ingestionFile").value = "";
    $("#ingestionText").value = "";
    invalidateIngestionPreview();
  }

  async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  async function readIngestionFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const allowed = /\.(txt|md)$/i.test(file.name) || ["text/plain", "text/markdown"].includes(file.type);
    if (!allowed) {
      event.target.value = "";
      ingestionStatus("In questa versione puoi scegliere soltanto file .txt o .md.", "error");
      return;
    }
    if (file.size > 1500000) {
      event.target.value = "";
      ingestionStatus("Il file supera il limite di 1,5 MB.", "error");
      return;
    }
    try {
      $("#ingestionText").value = await file.text();
      invalidateIngestionPreview();
      ingestionStatus(`File ${file.name} caricato sul dispositivo. Prepara l’anteprima per continuare.`);
    } catch (error) {
      ingestionStatus(friendlyLoadError(error), "error");
    }
  }

  async function previewIngestion() {
    try {
      const source = sources.find(item => item.id === $("#ingestionSource").value);
      if (!source) throw new Error("Seleziona una fonte valida.");
      const core = window.CucinaHubRagIngestionCore;
      if (!core) throw new Error("Motore di indicizzazione non disponibile. Ricarica la pagina.");
      ingestionChunks = core.chunkText($("#ingestionText").value, { heading: source.display_name });
      ingestionHash = await sha256(core.normalizeText($("#ingestionText").value));
      const summary = core.summarize(ingestionChunks);
      $("#previewChunkCount").textContent = summary.chunk_count.toLocaleString("it-IT");
      $("#previewCharacterCount").textContent = summary.character_count.toLocaleString("it-IT");
      $("#previewTokenCount").textContent = summary.token_estimate.toLocaleString("it-IT");
      $("#ingestionPreview").hidden = false;
      $("#confirmIngestion").disabled = false;
      ingestionStatus("Anteprima pronta. Controlla i valori e conferma per sostituire l’indice della fonte.", "ok");
    } catch (error) {
      invalidateIngestionPreview();
      ingestionStatus(error.message, "error");
    }
  }

  async function confirmIngestion() {
    const source = sources.find(item => item.id === $("#ingestionSource").value);
    if (!source || !ingestionChunks.length || !ingestionHash) return;
    const confirmed = window.confirm(`Sostituire l’indice di “${source.display_name}” con ${ingestionChunks.length} frammenti? L’originale non verrà modificato.`);
    if (!confirmed) return;
    const supabase = client();
    if (!supabase) {
      ingestionStatus("Client Supabase non disponibile. Ricarica la pagina.", "error");
      return;
    }
    $("#confirmIngestion").disabled = true;
    ingestionStatus("Indicizzazione in corso…");
    try {
      const result = await supabase.rpc("replace_rag_source_chunks", {
        p_source_index_id: source.id,
        p_chunks: ingestionChunks,
        p_content_hash: ingestionHash
      });
      if (result.error) throw result.error;
      ingestionStatus(`${result.data.chunk_count} frammenti salvati. La fonte è ora indicizzata.`, "ok");
      await load();
      window.setTimeout(closeIngestion, 900);
    } catch (error) {
      $("#confirmIngestion").disabled = false;
      ingestionStatus(friendlyLoadError(error), "error");
    }
  }

  async function search(event) {
    event.preventDefault();
    const query = $("#searchQuery").value.trim();
    if (!query) return;
    const supabase = client();
    if (!supabase) {
      $("#searchResults").innerHTML = '<p class="knowledge-status error">Client Supabase non disponibile. Ricarica la pagina.</p>';
      return;
    }
    $("#searchResults").innerHTML = '<p class="muted">Ricerca…</p>';
    try {
      const result = await retryNetwork(() => supabase.rpc("search_rag_sources", { p_query: query, p_limit: 8 }));
      const items = result.data || [];
      $("#searchResults").innerHTML = items.length
        ? items.map(item => `<article class="rag-result"><h3>${esc(item.display_name)}</h3><span class="rag-score">${esc(kinds[item.source_kind] || item.source_kind)}${item.locator ? ` · ${esc(item.locator)}` : ""}</span><p>${esc(item.content)}</p></article>`).join("")
        : '<p class="muted">Nessun frammento indicizzato corrisponde alla ricerca.</p>';
    } catch (error) {
      $("#searchResults").innerHTML = `<p class="knowledge-status error">${esc(friendlyLoadError(error))}</p>`;
    }
  }

  async function load() {
    if (loading) return;
    loading = true;
    showRetry(false);
    status("Caricamento…");
    $("#authGate").hidden = true;

    try {
      const supabase = client();
      if (!supabase) {
        throw window.cucinaHubSupabaseError || new Error("Client Supabase non disponibile. Ricarica la pagina.");
      }
      const auth = await retryNetwork(() => supabase.auth.getSession());
      const session = auth.data.session;
      if (!session?.user) {
        $("#workspace").hidden = true;
        $("#authGate").hidden = false;
        status("Sessione non disponibile. Accedi di nuovo.", "error");
        return;
      }
      const result = await retryNetwork(() => supabase
        .from("rag_source_indexes")
        .select("*")
        .eq("owner_user_id", session.user.id)
        .order("display_name"));
      sources = result.data || [];
      $("#workspace").hidden = false;
      renderStats();
      renderSources();
      renderIngestionSources();
      status(`${sources.length} fonti private caricate.`, "ok");
    } catch (error) {
      $("#workspace").hidden = true;
      status(friendlyLoadError(error), "error");
      showRetry(true);
    } finally {
      loading = false;
    }
  }

  $("#statusFilter").addEventListener("change", renderSources);
  $("#searchForm").addEventListener("submit", search);
  $("#sourceList").addEventListener("click", event => {
    const button = event.target.closest("[data-index-source]");
    if (button) openIngestion(button.dataset.indexSource);
  });
  $("#ingestionFile").addEventListener("change", readIngestionFile);
  $("#ingestionText").addEventListener("input", invalidateIngestionPreview);
  $("#ingestionSource").addEventListener("change", invalidateIngestionPreview);
  $("#previewIngestion").addEventListener("click", previewIngestion);
  $("#confirmIngestion").addEventListener("click", confirmIngestion);
  $("#closeIngestion").addEventListener("click", closeIngestion);
  $("#retryLoad").addEventListener("click", () => {
    if (!client()) {
      window.location.reload();
      return;
    }
    load();
  });
  window.addEventListener("online", load);
  load();
})();
