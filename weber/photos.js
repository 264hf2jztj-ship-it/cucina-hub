"use strict";
(() => {
  const client = window.cucinaHubSupabase;
  const core = window.CucinaHubWeberPhotos;
  const $ = selector => document.querySelector(selector);
  const session = new URLSearchParams(window.location.search).get("session");
  const state = { owner: null, photos: [], file: null, busy: false, cleanup: null };
  const esc = (value = "") => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

  function status(message, type = "") {
    $("#photoStatus").textContent = message;
    $("#photoStatus").className = type;
  }
  function busy(value) {
    state.busy = value;
    document.querySelectorAll("#photoWorkspace button, #photoWorkspace input, #photoWorkspace select, #photoWorkspace textarea, #retryCleanup").forEach(element => { element.disabled = value; });
  }
  function clearFile() {
    state.file = null;
    $("#photoCamera").value = "";
    $("#photoLibrary").value = "";
    $("#selectedFile").textContent = "Nessuna foto selezionata.";
  }
  function selectFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      core.mimeFor(file);
      state.file = file;
      $("#selectedFile").textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
    } catch (error) { clearFile(); status(error.message, "error"); }
  }
  function options(selected) {
    return Object.entries(core.KINDS).map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");
  }
  async function loadPhotos() {
    const result = await client.from("weber_session_photos")
      .select("id,session_id,storage_file_id,photo_kind,caption,created_at,file:storage_files(bucket_name,object_path,mime_type)")
      .eq("owner_user_id", state.owner).eq("session_id", session).order("created_at");
    if (result.error) throw result.error;
    state.photos = result.data ?? [];
    const cards = await Promise.all(state.photos.map(async photo => {
      let url = "";
      try {
        const file = core.checkedFile(photo, state.owner, session);
        const signed = await client.storage.from(core.BUCKET).createSignedUrl(file.object_path, 300);
        if (signed.error) throw signed.error;
        url = signed.data.signedUrl;
      } catch { /* Keep the record visible and deletable when preview is unavailable. */ }
      return `<article class="photo-card" data-photo="${esc(photo.id)}">
        ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer"><img src="${esc(url)}" alt="${esc(photo.caption || core.KINDS[photo.photo_kind])}" loading="lazy"><span>Apri foto originale ↗</span></a>` : ""}
        <p class="photo-preview-missing" ${url ? "hidden" : ""}>Anteprima non disponibile. Aggiorna i link oppure apri il file con un dispositivo compatibile.</p>
        <p class="muted">${esc(new Date(photo.created_at).toLocaleString("it-IT"))}</p>
        <div class="field"><label for="kind-${esc(photo.id)}">Fase</label><select id="kind-${esc(photo.id)}" data-kind>${options(photo.photo_kind)}</select></div>
        <div class="field"><label for="caption-${esc(photo.id)}">Didascalia</label><textarea id="caption-${esc(photo.id)}" data-caption maxlength="1000">${esc(photo.caption)}</textarea></div>
        <div class="photo-actions"><button class="button secondary" type="button" data-save="${esc(photo.id)}">SALVA DATI</button><button class="button danger" type="button" data-delete="${esc(photo.id)}">ELIMINA FOTO</button></div>
      </article>`;
    }));
    $("#photoGallery").innerHTML = cards.join("") || '<p class="muted">Nessuna foto per questa prova.</p>';
    $("#photoGallery").querySelectorAll("img").forEach(img => {
      img.onerror = () => { img.hidden = true; img.closest(".photo-card").querySelector(".photo-preview-missing").hidden = false; };
    });
  }

  async function upload(event) {
    event.preventDefault();
    if (state.busy) return;
    if (state.cleanup) { status("Completa prima la pulizia del tentativo precedente.", "error"); return; }
    busy(true);
    let committed = false;
    try {
      status("Caricamento e registrazione della foto…");
      await core.uploadPhoto(client, { owner: state.owner, session, file: state.file, kind: $("#photoKind").value, caption: $("#photoCaption").value });
      committed = true;
      clearFile();
      $("#photoCaption").value = "";
      await loadPhotos();
      status("Foto salvata nella sessione Weber.", "ok");
    } catch (error) {
      if (error.cleanup) { state.cleanup = error.cleanup; $("#retryCleanup").hidden = false; }
      status(committed ? "Foto salvata, ma galleria non aggiornata. Premi Aggiorna anteprime." : error.message, "error");
    } finally { busy(false); }
  }

  async function galleryAction(event) {
    if (state.busy) return;
    const button = event.target.closest("[data-save], [data-delete]");
    if (!button) return;
    const id = button.dataset.save || button.dataset.delete;
    const photo = state.photos.find(row => row.id === id);
    if (!photo) return;
    const deleting = Boolean(button.dataset.delete);
    if (deleting && !confirm("Eliminare definitivamente questa foto e il relativo file?")) return;
    busy(true);
    try {
      if (deleting) await core.removePhoto(client, photo, state.owner, session);
      else {
        const card = button.closest(".photo-card");
        const values = core.metadata(card.querySelector("[data-kind]").value, card.querySelector("[data-caption]").value);
        const result = await client.from("weber_session_photos").update(values).eq("id", id).eq("session_id", session).eq("owner_user_id", state.owner).select("id").single();
        if (result.error) throw result.error;
      }
      await loadPhotos();
      status(deleting ? "Foto eliminata." : "Fase e didascalia aggiornate.", "ok");
    } catch (error) { status(error.message, "error"); }
    finally { busy(false); }
  }

  $("#chooseCamera").onclick = () => $("#photoCamera").click();
  $("#chooseLibrary").onclick = () => $("#photoLibrary").click();
  $("#photoCamera").onchange = $("#photoLibrary").onchange = selectFile;
  $("#clearFile").onclick = clearFile;
  $("#photoForm").onsubmit = upload;
  $("#photoGallery").onclick = galleryAction;
  $("#refreshPhotos").onclick = async () => {
    if (state.busy) return;
    busy(true);
    try { await loadPhotos(); status("Anteprime aggiornate.", "ok"); }
    catch (error) { status(error.message, "error"); }
    finally { busy(false); }
  };
  $("#retryCleanup").onclick = async () => {
    if (state.busy || !state.cleanup) return;
    busy(true);
    try { await core.retryCleanup(client, state.cleanup); state.cleanup = null; $("#retryCleanup").hidden = true; status("Pulizia completata.", "ok"); }
    catch (error) { status(error.message, "error"); }
    finally { busy(false); }
  };

  async function init() {
    try {
      if (!client || !core) throw new Error("Collegamento foto non disponibile.");
      const access = await window.CucinaHubAuthGuard.requireAdministrator(client);
      if (!access.authorized) { $("#authGate").hidden = false; throw new Error("Accedi con l’account amministratore."); }
      if (!core.UUID.test(session ?? "")) throw new Error("Apri le foto da una sessione del Diario Weber.");
      state.owner = access.user.id;
      const result = await client.from("weber_cook_sessions").select("id,title").eq("id", session).eq("owner_user_id", state.owner).single();
      if (result.error) throw new Error("Sessione non disponibile per questo account.");
      $("#sessionTitle").textContent = `Foto · ${result.data.title}`;
      $("#photoWorkspace").hidden = false;
      busy(true);
      await loadPhotos();
      status("Archivio privato aggiornato.", "ok");
    } catch (error) { status(error.message, "error"); }
    finally { busy(false); }
  }
  void init();
})();
