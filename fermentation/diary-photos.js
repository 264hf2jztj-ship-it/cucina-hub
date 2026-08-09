"use strict";

(() => {
  const client = window.cucinaHubSupabase;
  const sessionId = new URLSearchParams(window.location.search).get("session");
  const BUCKET = "session-images";
  const MAX_FILE_BYTES = 10 * 1024 * 1024;

  if (!client || !sessionId) return;

  const kinds = {
    dough: "Impasto",
    bulk: "Puntata",
    cold: "Frigorifero",
    proof: "Appretto",
    pre_bake: "Prima della cottura",
    whole: "Risultato intero",
    crust: "Bordo / cornicione",
    crumb: "Alveolatura",
    base: "Fondo",
    slice: "Sezione / fetta",
    other: "Altro"
  };

  let user = null;
  let photos = [];
  let panel = null;
  let gallery = null;
  let statusNode = null;
  let selectedFile = null;

  const esc = value => String(value ?? "").replace(/[&<>\'\"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character]);

  function setStatus(message, kind = "") {
    if (!statusNode) return;
    statusNode.className = `diary-photo-status ${kind}`.trim();
    statusNode.textContent = message;
  }

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .diary-photos .diary-photo-upload{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
      .diary-photos label{display:block;font-weight:800;margin-bottom:6px}
      .diary-photos select,.diary-photos input,.diary-photos textarea{width:100%;border:1px solid #bbb2a6;border-radius:10px;padding:11px;font:inherit;background:#fff}
      .diary-photos textarea{min-height:86px;resize:vertical}
      .diary-photo-sources,.diary-photo-actions,.diary-photo-card-actions{display:flex;gap:8px;flex-wrap:wrap}
      .diary-photo-sources{margin-top:12px}
      .diary-photo-sources label,.diary-photo-sources button,.diary-photo-actions button,.diary-photo-card-actions button{width:auto;margin:0;padding:10px 12px;border:0;border-radius:10px;background:#365d44;color:#fff;font-weight:800;cursor:pointer}
      .diary-photo-sources .secondary,.diary-photo-card-actions .secondary{background:#eee8df;color:#26221d}
      .diary-photo-selected{margin:10px 0;padding:10px 12px;border:1px solid #ddd5ca;border-radius:10px;background:#faf8f4;color:#6d655c}
      .diary-photo-status{margin:10px 0;color:#6d655c}.diary-photo-status.ok{color:#176b35}.diary-photo-status.error{color:#a62424}
      .diary-photo-gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px;margin-top:14px}
      .diary-photo-card{position:relative;border:1px solid #ddd5ca;border-radius:14px;overflow:hidden;background:#fff}
      .diary-photo-card a{display:block;background:#f2eee8}.diary-photo-card img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}
      .diary-photo-preview-missing{display:grid;place-items:center;min-height:190px;padding:20px;color:#6d655c;text-align:center;background:#faf8f4}
      .diary-photo-badges{position:absolute;top:8px;left:8px;right:8px;display:flex;gap:6px;flex-wrap:wrap;pointer-events:none}
      .diary-photo-badge{display:inline-block;padding:5px 8px;border-radius:999px;background:#26221dcc;color:#fff;font-size:.72rem;font-weight:800}
      .diary-photo-badge.cover{background:#365d44}.diary-photo-badge.source{background:#8058a5}
      .diary-photo-body{padding:12px}.diary-photo-body .photo-date{margin-bottom:10px;color:#6d655c;font-size:.84rem}
      .diary-photo-card-actions{padding:0 12px 12px}.diary-photo-card-actions button{font-size:.78rem;padding:8px 9px}
      .diary-photo-empty{grid-column:1/-1;padding:22px;text-align:center;color:#6d655c;background:#faf8f4;border-radius:12px}
      @media(max-width:760px){.diary-photos .diary-photo-upload,.diary-photo-gallery{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function kindOptions(selected) {
    const current = selected || "other";
    return Object.entries(kinds).map(([value, label]) =>
      `<option value="${value}" ${value === current ? "selected" : ""}>${esc(label)}</option>`
    ).join("");
  }

  function buildPanel() {
    if (document.querySelector("#diaryPhotosPanel")) return true;
    const form = document.querySelector("#form");
    if (!form) return false;
    const sections = form.querySelectorAll(":scope > section.panel");
    const finalActions = sections[sections.length - 1];

    panel = document.createElement("section");
    panel.id = "diaryPhotosPanel";
    panel.className = "panel diary-photos";
    panel.innerHTML = `
      <h2>5. Foto della sessione e del risultato</h2>
      <p class="helper">Le foto scattate durante la Sessione Guidata e quelle caricate qui appartengono allo stesso diario. Aggiungi una categoria e una breve didascalia utile per i confronti futuri.</p>
      <div class="diary-photo-upload">
        <div>
          <label for="diaryPhotoKind">Tipo di foto</label>
          <select id="diaryPhotoKind">${kindOptions("whole")}</select>
        </div>
        <div>
          <label for="diaryPhotoCaption">Didascalia</label>
          <textarea id="diaryPhotoCaption" placeholder="Es. fondo ben cotto, alveoli irregolari, bordo morbido…"></textarea>
        </div>
      </div>
      <input id="diaryPhotoCamera" type="file" accept="image/*" capture="environment" hidden>
      <input id="diaryPhotoLibrary" type="file" accept="image/*" hidden>
      <div class="diary-photo-sources">
        <label for="diaryPhotoCamera">SCATTA FOTO</label>
        <label for="diaryPhotoLibrary">SCEGLI DALLA LIBRERIA</label>
        <button id="diaryPhotoClear" class="secondary" type="button">RIMUOVI SELEZIONE</button>
      </div>
      <div id="diaryPhotoSelected" class="diary-photo-selected">Nessuna foto selezionata.</div>
      <div class="diary-photo-actions"><button id="diaryPhotoUpload" type="button">CARICA FOTO</button></div>
      <div id="diaryPhotoStatus" class="diary-photo-status">Caricamento archivio fotografico…</div>
      <div id="diaryPhotoGallery" class="diary-photo-gallery"></div>
    `;

    if (finalActions) finalActions.insertAdjacentElement("beforebegin", panel);
    else form.appendChild(panel);

    gallery = panel.querySelector("#diaryPhotoGallery");
    statusNode = panel.querySelector("#diaryPhotoStatus");

    const selectFile = file => {
      selectedFile = file || null;
      panel.querySelector("#diaryPhotoSelected").textContent = selectedFile
        ? `Selezionata: ${selectedFile.name} · ${(selectedFile.size / 1024 / 1024).toFixed(1)} MB`
        : "Nessuna foto selezionata.";
    };

    panel.querySelector("#diaryPhotoCamera").addEventListener("change", event => selectFile(event.target.files[0]));
    panel.querySelector("#diaryPhotoLibrary").addEventListener("change", event => selectFile(event.target.files[0]));
    panel.querySelector("#diaryPhotoClear").addEventListener("click", () => {
      selectedFile = null;
      panel.querySelector("#diaryPhotoCamera").value = "";
      panel.querySelector("#diaryPhotoLibrary").value = "";
      selectFile(null);
    });
    panel.querySelector("#diaryPhotoUpload").addEventListener("click", uploadSelected);
    return true;
  }

  async function signedUrl(storagePath) {
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
    if (error) throw error;
    return data.signedUrl;
  }

  async function loadPhotos() {
    const { data, error } = await client.from("baking_session_photos")
      .select("*")
      .eq("session_id", sessionId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;

    photos = data || [];
    await Promise.all(photos.map(async photo => {
      try {
        photo.url = await signedUrl(photo.storage_path);
      } catch {
        photo.url = "";
      }
    }));
    renderGallery();
    setStatus(`${photos.length} ${photos.length === 1 ? "foto caricata" : "foto caricate"}.`, "ok");
  }

  function renderGallery() {
    if (!gallery) return;
    if (!photos.length) {
      gallery.innerHTML = '<div class="diary-photo-empty">Nessuna foto ancora presente. La prima foto caricata diventerà automaticamente la copertina della sessione.</div>';
      return;
    }

    gallery.innerHTML = photos.map((photo, index) => {
      const kind = photo.photo_kind || "other";
      const source = photo.phase_id === "diary_result" ? "Risultato" : "Sessione guidata";
      const preview = photo.url
        ? `<a href="${esc(photo.url)}" target="_blank" rel="noopener"><img src="${esc(photo.url)}" alt="${esc(photo.caption || photo.label)}"></a>`
        : '<div class="diary-photo-preview-missing">Anteprima non disponibile per questo formato. Il file resta conservato nello Storage.</div>';
      return `
        <article class="diary-photo-card" data-photo-card="${photo.id}">
          <div class="diary-photo-badges">
            ${photo.is_cover ? '<span class="diary-photo-badge cover">COPERTINA</span>' : ""}
            <span class="diary-photo-badge source">${esc(source)}</span>
          </div>
          ${preview}
          <div class="diary-photo-body">
            <div class="photo-date">${esc(new Date(photo.created_at).toLocaleString("it-IT"))}</div>
            <label>Categoria</label>
            <select data-kind>${kindOptions(kind)}</select>
            <label style="margin-top:9px">Didascalia</label>
            <textarea data-caption placeholder="Aggiungi una nota visiva…">${esc(photo.caption || "")}</textarea>
          </div>
          <div class="diary-photo-card-actions">
            <button type="button" data-save="${photo.id}">SALVA DATI</button>
            ${photo.is_cover ? "" : `<button type="button" class="secondary" data-cover="${photo.id}">COPERTINA</button>`}
            <button type="button" class="secondary" data-move-up="${photo.id}" ${index === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="secondary" data-move-down="${photo.id}" ${index === photos.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" class="secondary" data-delete="${photo.id}">ELIMINA</button>
          </div>
        </article>
      `;
    }).join("");

    gallery.querySelectorAll("[data-save]").forEach(button => button.addEventListener("click", () => saveMetadata(button.dataset.save)));
    gallery.querySelectorAll("[data-cover]").forEach(button => button.addEventListener("click", () => setCover(button.dataset.cover)));
    gallery.querySelectorAll("[data-move-up]").forEach(button => button.addEventListener("click", () => movePhoto(button.dataset.moveUp, -1)));
    gallery.querySelectorAll("[data-move-down]").forEach(button => button.addEventListener("click", () => movePhoto(button.dataset.moveDown, 1)));
    gallery.querySelectorAll("[data-delete]").forEach(button => button.addEventListener("click", () => deletePhoto(button.dataset.delete)));
  }

  function validateFile(file) {
    if (!file) throw new Error("Scatta una foto oppure scegline una dalla libreria.");
    if (file.size > MAX_FILE_BYTES) throw new Error("La foto supera il limite di 10 MB.");
    if (file.type && !file.type.startsWith("image/")) throw new Error("Il file selezionato non è un'immagine.");
  }

  async function uploadSelected() {
    let storagePath = null;
    try {
      validateFile(selectedFile);
      setStatus("Caricamento della foto in corso…");

      const kind = panel.querySelector("#diaryPhotoKind").value;
      const caption = panel.querySelector("#diaryPhotoCaption").value.trim() || null;
      const extension = (selectedFile.name.split(".").pop() || "jpg")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "jpg";
      storagePath = `${user.id}/${sessionId}/${crypto.randomUUID()}.${extension}`;

      const upload = await client.storage.from(BUCKET).upload(storagePath, selectedFile, {
        contentType: selectedFile.type || "image/jpeg",
        upsert: false
      });
      if (upload.error) throw upload.error;

      const nextOrder = photos.reduce((maximum, photo) => Math.max(maximum, Number(photo.sort_order) || 0), 0) + 10;
      const needsCover = !photos.some(photo => photo.is_cover);
      const insert = await client.from("baking_session_photos").insert({
        owner_user_id: user.id,
        session_id: sessionId,
        phase_id: "diary_result",
        activity_id: null,
        label: kinds[kind] || kinds.other,
        photo_kind: kind,
        caption,
        sort_order: nextOrder,
        storage_bucket: BUCKET,
        storage_path: storagePath,
        mime_type: selectedFile.type || null,
        file_size_bytes: selectedFile.size,
        is_cover: needsCover,
        updated_at: new Date().toISOString()
      });
      if (insert.error) throw insert.error;

      selectedFile = null;
      panel.querySelector("#diaryPhotoCamera").value = "";
      panel.querySelector("#diaryPhotoLibrary").value = "";
      panel.querySelector("#diaryPhotoSelected").textContent = "Nessuna foto selezionata.";
      panel.querySelector("#diaryPhotoCaption").value = "";
      await loadPhotos();
      setStatus("Foto salvata nel Diario fermentazioni.", "ok");
    } catch (error) {
      if (storagePath) await client.storage.from(BUCKET).remove([storagePath]);
      setStatus(error.message, "error");
    }
  }

  async function saveMetadata(id) {
    try {
      const card = gallery.querySelector(`[data-photo-card="${id}"]`);
      if (!card) return;
      const kind = card.querySelector("[data-kind]").value;
      const caption = card.querySelector("[data-caption]").value.trim() || null;
      setStatus("Salvataggio dati della foto…");
      const { error } = await client.from("baking_session_photos").update({
        photo_kind: kind,
        label: kinds[kind] || kinds.other,
        caption,
        updated_at: new Date().toISOString()
      }).eq("id", id);
      if (error) throw error;
      await loadPhotos();
      setStatus("Categoria e didascalia aggiornate.", "ok");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function setCover(id) {
    try {
      setStatus("Aggiornamento della copertina…");
      const clear = await client.from("baking_session_photos")
        .update({ is_cover: false, updated_at: new Date().toISOString() })
        .eq("session_id", sessionId)
        .eq("is_cover", true);
      if (clear.error) throw clear.error;

      const select = await client.from("baking_session_photos")
        .update({ is_cover: true, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (select.error) throw select.error;

      await loadPhotos();
      setStatus("Foto copertina aggiornata.", "ok");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function persistOrder() {
    const now = new Date().toISOString();
    const results = await Promise.all(photos.map((photo, index) =>
      client.from("baking_session_photos")
        .update({ sort_order: (index + 1) * 10, updated_at: now })
        .eq("id", photo.id)
    ));
    const failure = results.find(result => result.error);
    if (failure) throw failure.error;
  }

  async function movePhoto(id, direction) {
    try {
      const index = photos.findIndex(photo => photo.id === id);
      const destination = index + direction;
      if (index < 0 || destination < 0 || destination >= photos.length) return;
      [photos[index], photos[destination]] = [photos[destination], photos[index]];
      setStatus("Aggiornamento dell'ordine…");
      await persistOrder();
      await loadPhotos();
      setStatus("Ordine delle foto aggiornato.", "ok");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function deletePhoto(id) {
    const photo = photos.find(item => item.id === id);
    if (!photo || !window.confirm(`Eliminare definitivamente “${photo.caption || photo.label}”?`)) return;

    try {
      setStatus("Eliminazione della foto…");
      const storageResult = await client.storage.from(BUCKET).remove([photo.storage_path]);
      if (storageResult.error) throw storageResult.error;
      const rowResult = await client.from("baking_session_photos").delete().eq("id", id);
      if (rowResult.error) throw rowResult.error;

      await loadPhotos();
      if (photo.is_cover && photos.length && !photos.some(item => item.is_cover)) {
        await setCover(photos[0].id);
      } else {
        setStatus("Foto eliminata.", "ok");
      }
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function init() {
    injectStyles();
    const auth = await client.auth.getSession();
    if (auth.error) throw auth.error;
    user = auth.data.session?.user;
    if (!user) return;

    const waitForForm = window.setInterval(async () => {
      if (!buildPanel()) return;
      window.clearInterval(waitForForm);
      try {
        await loadPhotos();
      } catch (error) {
        setStatus(error.message, "error");
      }
    }, 150);
  }

  init().catch(error => console.error("Foto Diario non disponibili:", error));
})();
