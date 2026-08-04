"use strict";

(() => {
  const BUCKET = "session-images";
  const client = window.cucinaHubSupabase;
  const sessionId = new URLSearchParams(location.search).get("session");
  if (!client || !sessionId) return;

  const esc = value => String(value ?? "").replace(/[&<>\'\"]/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[ch]);

  let user = null;
  let photos = [];
  let panel = null;
  let gallery = null;
  let status = null;
  let phaseTitle = "Sessione";

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .photo-diary{margin:18px 0;padding:16px;border:1px solid #d8cfe0;border-radius:16px;background:#fcf9ff}
      .photo-diary h2{margin:0 0 5px;font-size:1.2rem}.photo-diary p{margin:0 0 12px;color:#6d655c}
      .photo-controls{display:grid;grid-template-columns:1fr 1fr;gap:10px}.photo-controls label{display:block;font-weight:800;margin-bottom:5px}
      .photo-controls select,.photo-controls input{width:100%;padding:10px;border:1px solid #bbb2a6;border-radius:10px;font:inherit;background:#fff}
      .photo-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.photo-actions button{margin:0}
      .photo-gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:14px}
      .photo-card{position:relative;border:1px solid #ddd5ca;border-radius:12px;overflow:hidden;background:#fff}
      .photo-card img{width:100%;aspect-ratio:1.25/1;object-fit:cover;display:block}.photo-card-body{padding:8px;font-size:.85rem}
      .photo-card-actions{display:flex;gap:6px;flex-wrap:wrap;padding:0 8px 8px}.photo-card-actions button{padding:7px 9px;font-size:.75rem}
      .photo-cover{position:absolute;top:7px;left:7px;background:#365d44;color:#fff;padding:4px 7px;border-radius:999px;font-size:.72rem;font-weight:800}
      .photo-empty{padding:14px;text-align:center;color:#6d655c;background:#fff;border-radius:10px}.photo-status{margin-top:8px;color:#6d655c}
      .photo-activity-upload{margin-top:10px;padding:10px;border-radius:10px;background:#f2ebf7}
      @media(max-width:600px){.photo-controls{grid-template-columns:1fr}.photo-gallery{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  function buildPanel() {
    if (document.querySelector(".photo-diary")) return;
    const activities = document.querySelector("#activities");
    if (!activities) return;
    panel = document.createElement("section");
    panel.className = "photo-diary";
    panel.innerHTML = `
      <h2>📷 Diario fotografico</h2>
      <p>Documenta l'impasto, la fermentazione e il risultato finale. La foto copertina verrà mostrata nello storico.</p>
      <div class="photo-controls">
        <div><label for="photoLabel">Tipo di foto</label><select id="photoLabel">
          <option>Impasto appena formato</option><option>Fine impasto</option><option>Prima della puntata</option><option>Fine puntata</option>
          <option>Prima del frigo</option><option>Fine frigo</option><option>Stesura</option><option>Prima di infornare</option>
          <option>Fine cottura</option><option>Pizza intera</option><option>Cornicione</option><option>Alveolatura</option><option>Altro</option>
        </select></div>
        <div><label for="photoFile">Fotocamera o libreria</label><input id="photoFile" type="file" accept="image/*" capture="environment"></div>
      </div>
      <div class="photo-actions"><button id="uploadPhoto">CARICA FOTO</button></div>
      <div id="photoStatus" class="photo-status"></div>
      <div id="photoGallery" class="photo-gallery"></div>`;
    activities.insertAdjacentElement("afterend", panel);
    gallery = panel.querySelector("#photoGallery");
    status = panel.querySelector("#photoStatus");
    panel.querySelector("#uploadPhoto").addEventListener("click", uploadSelected);
  }

  async function signedUrl(path) {
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error) throw error;
    return data.signedUrl;
  }

  async function loadPhotos() {
    const { data, error } = await client.from("baking_session_photos")
      .select("*").eq("session_id", sessionId).order("created_at", { ascending: true });
    if (error) throw error;
    photos = data || [];
    for (const photo of photos) {
      try { photo.url = await signedUrl(photo.storage_path); } catch { photo.url = ""; }
    }
    renderGallery();
  }

  function renderGallery() {
    if (!gallery) return;
    if (!photos.length) {
      gallery.innerHTML = '<div class="photo-empty">Nessuna foto ancora caricata.</div>';
      return;
    }
    gallery.innerHTML = photos.map(photo => `
      <article class="photo-card">
        ${photo.is_cover ? '<span class="photo-cover">COPERTINA</span>' : ""}
        ${photo.url ? `<img src="${esc(photo.url)}" alt="${esc(photo.label)}">` : '<div class="photo-empty">Anteprima non disponibile</div>'}
        <div class="photo-card-body"><strong>${esc(photo.label)}</strong><br>${esc(new Date(photo.created_at).toLocaleString("it-IT"))}</div>
        <div class="photo-card-actions">
          ${photo.is_cover ? "" : `<button class="secondary" data-cover="${photo.id}">COPERTINA</button>`}
          <button class="secondary" data-delete="${photo.id}">ELIMINA</button>
        </div>
      </article>`).join("");
    gallery.querySelectorAll("[data-cover]").forEach(btn => btn.onclick = () => setCover(btn.dataset.cover));
    gallery.querySelectorAll("[data-delete]").forEach(btn => btn.onclick = () => deletePhoto(btn.dataset.delete));
  }

  async function uploadFile(file, label, activityId = null) {
    if (!file) throw new Error("Seleziona una foto.");
    if (file.size > 10 * 1024 * 1024) throw new Error("La foto supera il limite di 10 MB.");
    const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${user.id}/${sessionId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
    if (uploadError) throw uploadError;
    const first = photos.length === 0;
    const { error: rowError } = await client.from("baking_session_photos").insert({
      owner_user_id: user.id,
      session_id: sessionId,
      phase_id: phaseTitle,
      activity_id: activityId,
      label,
      storage_bucket: BUCKET,
      storage_path: path,
      mime_type: file.type || null,
      file_size_bytes: file.size,
      is_cover: first
    });
    if (rowError) {
      await client.storage.from(BUCKET).remove([path]);
      throw rowError;
    }
  }

  async function uploadSelected() {
    try {
      status.textContent = "Caricamento in corso…";
      const fileInput = panel.querySelector("#photoFile");
      const label = panel.querySelector("#photoLabel").value;
      await uploadFile(fileInput.files[0], label);
      fileInput.value = "";
      await loadPhotos();
      status.textContent = "Foto salvata nel diario.";
    } catch (error) { status.textContent = error.message; }
  }

  async function setCover(id) {
    try {
      status.textContent = "Aggiornamento copertina…";
      await client.from("baking_session_photos").update({ is_cover: false }).eq("session_id", sessionId).eq("is_cover", true);
      const { error } = await client.from("baking_session_photos").update({ is_cover: true }).eq("id", id);
      if (error) throw error;
      await loadPhotos();
      status.textContent = "Copertina aggiornata.";
    } catch (error) { status.textContent = error.message; }
  }

  async function deletePhoto(id) {
    const photo = photos.find(item => item.id === id);
    if (!photo || !confirm(`Eliminare “${photo.label}”?`)) return;
    try {
      const { error: storageError } = await client.storage.from(BUCKET).remove([photo.storage_path]);
      if (storageError) throw storageError;
      const { error: rowError } = await client.from("baking_session_photos").delete().eq("id", id);
      if (rowError) throw rowError;
      await loadPhotos();
      if (photo.is_cover && photos.length) await setCover(photos[0].id);
      status.textContent = "Foto eliminata.";
    } catch (error) { status.textContent = error.message; }
  }

  function enhancePhotoActivities() {
    phaseTitle = document.querySelector("#title")?.textContent?.trim() || "Sessione";
    document.querySelectorAll(".activity.photo").forEach(activity => {
      if (activity.querySelector(".photo-activity-upload")) return;
      const activityId = activity.id.replace(/^a-/, "");
      const label = activity.querySelector(".activity-title")?.textContent?.replace(/^\s*\d+\.\s*📷\s*/, "").trim() || "Foto fase";
      const box = document.createElement("div");
      box.className = "photo-activity-upload";
      box.innerHTML = `<input type="file" accept="image/*" capture="environment"><button>SCATTA O SCEGLI FOTO</button><span></span>`;
      const input = box.querySelector("input");
      const output = box.querySelector("span");
      box.querySelector("button").onclick = async () => {
        try {
          output.textContent = " Caricamento…";
          await uploadFile(input.files[0], label, activityId);
          input.value = "";
          await loadPhotos();
          output.textContent = " Foto salvata";
          const genericButton = activity.querySelector(":scope > button");
          if (genericButton && genericButton.textContent.includes("SEGNA")) genericButton.click();
        } catch (error) { output.textContent = ` ${error.message}`; }
      };
      activity.appendChild(box);
    });
  }

  async function init() {
    injectStyles();
    const auth = await client.auth.getSession();
    user = auth.data.session?.user;
    if (!user) return;
    const wait = setInterval(async () => {
      buildPanel();
      enhancePhotoActivities();
      if (panel) {
        clearInterval(wait);
        try { await loadPhotos(); } catch (error) { status.textContent = error.message; }
        new MutationObserver(enhancePhotoActivities).observe(document.querySelector("#activities"), { childList: true, subtree: true });
      }
    }, 250);
  }

  init().catch(console.error);
})();