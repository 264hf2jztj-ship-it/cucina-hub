(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CucinaHubWeberPhotos = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";
  const BUCKET = "recipe-images";
  const MAX_BYTES = 10 * 1024 * 1024;
  const KINDS = Object.freeze({ setup: "Setup della brace", cooking: "Fase di cottura", result: "Risultato finale" });
  const TYPES = Object.freeze({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" });
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function mimeFor(file) {
    if (!file || !Number.isInteger(file.size) || file.size <= 0 || file.size > MAX_BYTES) throw new Error("Scegli una foto non vuota di massimo 10 MB.");
    const extension = String(file.name ?? "").split(".").pop().toLowerCase();
    const mime = file.type || ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" })[extension];
    if (!Object.hasOwn(TYPES, mime ?? "")) throw new Error("Formati ammessi: JPEG, PNG, WebP, HEIC e HEIF.");
    return mime;
  }

  function metadata(kind, caption = "") {
    if (!Object.hasOwn(KINDS, kind)) throw new Error("Seleziona una fase valida.");
    const text = String(caption).trim();
    if (text.length > 1000) throw new Error("La didascalia può contenere al massimo 1000 caratteri.");
    return { photo_kind: kind, caption: text || null };
  }

  function objectPath(owner, session, id, mime) {
    if (![owner, session, id].every(value => UUID.test(value))) throw new Error("Identificativo sessione o file non valido.");
    if (!Object.hasOwn(TYPES, mime)) throw new Error("Formato non valido.");
    return `${owner}/weber/${session}/photos/${id}.${TYPES[mime]}`;
  }

  function checkedFile(photo, owner, session) {
    const file = photo.file;
    if (!file || file.bucket_name !== BUCKET || file.object_path !== objectPath(owner, session, photo.storage_file_id, file.mime_type)) {
      throw new Error("Il file non corrisponde alla sessione Weber.");
    }
    return file;
  }

  async function uploadPhoto(client, { owner, session, file, kind, caption }, id = globalThis.crypto.randomUUID()) {
    const mime = mimeFor(file);
    const values = metadata(kind, caption);
    const path = objectPath(owner, session, id, mime);
    const storage = client.storage.from(BUCKET);
    let upload;
    try { upload = await storage.upload(path, file, { contentType: mime, upsert: false, cacheControl: "0" }); }
    catch {
      const error = new Error("Risposta del caricamento non ricevuta. Usa Riprova pulizia prima di caricare nuovamente la foto.");
      error.cleanup = { owner, session, id, path };
      throw error;
    }
    if (upload.error) throw upload.error;
    const args = { p_file_id: id, p_session_id: session, p_photo_kind: values.photo_kind, p_caption: values.caption, p_mime_type: mime, p_size_bytes: file.size, p_original_filename: file.name || null };
    let result;
    try { result = await client.rpc("register_weber_photo", args); }
    catch (error) { result = { error }; }
    if (result.error) {
      // A network error may arrive after the DB commit: reconcile before deleting the object.
      let lookup;
      try { lookup = await client.from("weber_session_photos").select("id").eq("id", id).eq("owner_user_id", owner).maybeSingle(); }
      catch (error) { lookup = { error }; }
      if (lookup.error) {
        const error = new Error("Registrazione non verificabile. Usa Riprova pulizia: la verifica conserverà il file se è già registrato.");
        error.cleanup = { owner, session, id, path };
        throw error;
      }
      if (lookup.data) return id;
      let cleanup;
      try { cleanup = await storage.remove([path]); }
      catch (error) { cleanup = { error }; }
      if (cleanup.error) {
        const error = new Error("Registrazione fallita e pulizia del file non riuscita. Usa Riprova pulizia prima di lasciare questa pagina.");
        error.cleanup = { owner, session, id, path };
        throw error;
      }
      throw result.error;
    }
    return id;
  }

  async function retryCleanup(client, pending) {
    const prefix = `${pending.owner}/weber/${pending.session}/photos/${pending.id}.`;
    if (!pending.path.startsWith(prefix) || ![pending.owner, pending.session, pending.id].every(value => UUID.test(value))) throw new Error("Percorso di pulizia non valido.");
    const lookup = await client.from("weber_session_photos").select("id").eq("id", pending.id).eq("owner_user_id", pending.owner).maybeSingle();
    if (lookup.error) throw lookup.error;
    if (lookup.data) return;
    const result = await client.storage.from(BUCKET).remove([pending.path]);
    if (result.error) throw result.error;
  }

  async function removePhoto(client, photo, owner, session) {
    const file = checkedFile(photo, owner, session);
    const storage = await client.storage.from(BUCKET).remove([file.object_path]);
    if (storage.error) throw storage.error;
    let result;
    try { result = await client.rpc("unregister_weber_photo", { p_photo_id: photo.id }); }
    catch (error) { result = { error }; }
    if (result.error) throw new Error("File rimosso, ma pulizia del registro non riuscita. Premi nuovamente Elimina per completarla.");
  }

  return { BUCKET, MAX_BYTES, KINDS, TYPES, UUID, mimeFor, metadata, objectPath, checkedFile, uploadPhoto, removePhoto, retryCleanup };
});
