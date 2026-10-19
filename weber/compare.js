"use strict";
(() => {
  const client = window.cucinaHubSupabase;
  const core = window.CucinaHubWeberCompare;
  const photos = window.CucinaHubWeberPhotos;
  const $ = selector => document.querySelector(selector);
  const state = { owner: null, list: [], pair: null, request: 0, photoRequest: 0 };
  const esc = (value = "") => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  const date = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString("it-IT") : "Data non registrata";
  const label = session => `${session.title} · ${date(session.cooked_at)}`;
  function status(message, error = false) {
    $("#compareStatus").textContent = message;
    $("#compareStatus").className = `weber-page-status${error ? " error" : ""}`;
  }
  function invalidate() {
    state.request++; state.photoRequest++; state.pair = null;
    $("#comparison").hidden = true;
    $("#comparisonRows").innerHTML = "";
    $("#photosA").innerHTML = $("#photosB").innerHTML = "";
  }
  async function loadTrials() {
    invalidate();
    const token = state.request;
    status("Caricamento delle prove…");
    $("#compareButton").disabled = $("#swapTrials").disabled = true;
    $("#trialA").disabled = $("#trialB").disabled = true;
    state.list = [];
    $("#trialA").innerHTML = $("#trialB").innerHTML = "";
    $("#listInfo").textContent = "";
    try {
      const result = await client.from("weber_cook_sessions").select("id,title,cooked_at", { count: "exact" })
        .eq("owner_user_id", state.owner).order("cooked_at", { ascending: false }).order("id").limit(200);
      if (token !== state.request) return;
      if (result.error) throw result.error;
      state.list = result.data || [];
      const options = state.list.map(row => `<option value="${esc(row.id)}">${esc(label(row))}</option>`).join("");
      $("#trialA").innerHTML = $("#trialB").innerHTML = options;
      $("#trialA").value = state.list[0]?.id || "";
      $("#trialB").value = state.list[1]?.id || "";
      const enough = state.list.length >= 2;
      $("#compareButton").disabled = $("#swapTrials").disabled = !enough;
      $("#listInfo").textContent = `Mostrate ${state.list.length} prove su ${result.count ?? state.list.length}, ordinate dalla più recente (massimo 200).`;
      status(enough ? "Scegli due prove e premi Confronta." : "Servono almeno due prove salvate nel diario per avviare il confronto.");
    } catch { if (token === state.request) status("Impossibile caricare le prove. Premi Ricarica prove per riprovare.", true); }
    finally { if (token === state.request) $("#trialA").disabled = $("#trialB").disabled = false; }
  }
  async function photoColumn(session, side, phase, token) {
    const heading = `<h3>Prova ${side} · ${esc(session.title)}</h3>`;
    const gallery = `<a class="button secondary" href="photos.html?session=${encodeURIComponent(session.id)}">APRI GALLERIA ${side}</a>`;
    let content;
    try {
      const result = await client.from("weber_session_photos")
        .select("id,session_id,storage_file_id,photo_kind,caption,created_at,file:storage_files(bucket_name,object_path,mime_type)", { count: "exact" })
        .eq("owner_user_id", state.owner).eq("session_id", session.id).eq("photo_kind", phase)
        .order("created_at", { ascending: false }).order("id").limit(6);
      if (token !== state.photoRequest) return;
      if (result.error) throw result.error;
      const records = result.data || [];
      const cards = await Promise.all(records.map(async photo => {
        let url = "";
        try {
          const file = photos.checkedFile(photo, state.owner, session.id);
          const signed = await client.storage.from(photos.BUCKET).createSignedUrl(file.object_path, 300);
          if (signed.error) throw signed.error;
          url = signed.data.signedUrl;
        } catch { /* A missing preview must not hide captions or the comparison. */ }
        return `<figure class="compare-photo">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer"><img src="${esc(url)}" alt="${esc(photo.caption || photos.KINDS[phase])}" loading="lazy">Apri originale ↗</a>` : ""}<p class="preview-missing" ${url ? "hidden" : ""}>Anteprima non disponibile. Aggiorna le anteprime o apri la galleria.</p><figcaption>${esc(photo.caption || "Senza didascalia")}<br><span class="muted">${esc(date(photo.created_at))}</span></figcaption></figure>`;
      }));
      content = records.length ? `<p>${records.length} foto mostrate su ${result.count ?? records.length} in questa fase.</p>${cards.join("")}` : "<p>Nessuna foto registrata per questa fase.</p>";
    } catch { content = "<p>Foto non disponibili. Puoi riprovare con Aggiorna anteprime; il confronto dei parametri resta valido.</p>"; }
    if (token !== state.photoRequest) return;
    const target = $(`#photos${side}`);
    target.innerHTML = heading + gallery + content;
    target.querySelectorAll("img").forEach(img => { img.onerror = () => { img.hidden = true; img.closest("figure").querySelector(".preview-missing").hidden = false; }; });
  }
  async function loadPhotos() {
    if (!state.pair) return;
    const token = ++state.photoRequest;
    const phase = $("#photoPhase").value;
    if (!Object.hasOwn(photos.KINDS, phase)) return;
    $("#photosA").innerHTML = $("#photosB").innerHTML = "<p>Caricamento foto…</p>";
    await Promise.all(state.pair.map((session, i) => photoColumn(session, i ? "B" : "A", phase, token)));
  }
  async function compare(event) {
    event?.preventDefault();
    const ids = [$("#trialA").value, $("#trialB").value];
    invalidate();
    if (ids[0] === ids[1] || ids.some(id => !state.list.some(row => row.id === id))) {
      status("Seleziona due prove diverse presenti nell’elenco.", true); return;
    }
    const token = state.request;
    status("Caricamento del confronto…");
    try {
      const result = await client.from("weber_cook_sessions").select("*,recipe:recipes(id,code,title)")
        .eq("owner_user_id", state.owner).in("id", ids);
      if (token !== state.request) return;
      if (result.error) throw result.error;
      const pair = ids.map(id => (result.data || []).find(row => row.id === id));
      if (pair.some(row => !row)) throw new Error("missing trial");
      state.pair = pair;
      $("#pairSummary").textContent = `A: ${label(pair[0])} — B: ${label(pair[1])}`;
      $("#comparisonWarnings").innerHTML = core.warnings(...pair).map(message => `<p>${esc(message)}</p>`).join("");
      $("#comparisonRows").innerHTML = core.rows(...pair).map(row => `<tr${row.different ? ' class="different"' : ""}><th scope="row">${esc(row.label)}${row.different ? '<span class="change-label">Diverso</span>' : ""}</th><td>${esc(row.a)}</td><td>${esc(row.b)}</td><td>${esc(row.delta)}</td></tr>`).join("");
      $("#comparison").hidden = false;
      status("Confronto pronto. Nessun dato è stato modificato.");
      await loadPhotos();
    } catch { if (token === state.request) { invalidate(); status("Confronto non disponibile: una prova potrebbe essere stata eliminata o non essere più accessibile. Ricarica le prove e riprova.", true); } }
  }
  $("#compareForm").onsubmit = compare;
  $("#trialA").onchange = $("#trialB").onchange = () => { invalidate(); status("Selezione cambiata. Premi Confronta per aggiornare i risultati."); };
  $("#swapTrials").onclick = () => { const a = $("#trialA").value; $("#trialA").value = $("#trialB").value; $("#trialB").value = a; return compare(); };
  $("#reloadTrials").onclick = loadTrials;
  $("#photoPhase").onchange = $("#refreshPreviews").onclick = loadPhotos;
  (async () => {
    try {
      if (!client || !core || !photos) throw new Error("missing dependency");
      const access = await window.CucinaHubAuthGuard.requireAdministrator(client);
      if (!access.authorized) { $("#authGate").hidden = false; status("Accedi con il tuo account amministratore."); return; }
      state.owner = access.user.id;
      $("#compareWorkspace").hidden = false;
      await loadTrials();
    } catch { status("Impossibile verificare l’accesso. Torna alla dashboard e riprova.", true); }
  })();
})();
