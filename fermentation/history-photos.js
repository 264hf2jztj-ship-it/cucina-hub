"use strict";

(() => {
  const client = window.cucinaHubSupabase;
  if (!client) return;
  const BUCKET = "session-images";
  let covers = new Map();

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .session-cover{width:100%;max-height:340px;object-fit:cover;border-radius:12px;margin:0 0 14px;display:block}
      .session-photo-count{display:inline-block;background:#f2ebf7;border-radius:999px;padding:6px 9px;font-size:.82rem;font-weight:800;margin-bottom:8px}
    `;
    document.head.appendChild(style);
  }

  async function loadCovers() {
    const { data, error } = await client.from("baking_session_photos")
      .select("session_id,storage_path,is_cover").order("created_at", { ascending: true });
    if (error) throw error;
    const grouped = new Map();
    for (const row of data || []) {
      if (!grouped.has(row.session_id)) grouped.set(row.session_id, []);
      grouped.get(row.session_id).push(row);
    }
    for (const [sessionId, rows] of grouped) {
      const selected = rows.find(row => row.is_cover) || rows[0];
      const signed = await client.storage.from(BUCKET).createSignedUrl(selected.storage_path, 3600);
      covers.set(sessionId, { url: signed.data?.signedUrl || "", count: rows.length });
    }
  }

  function sessionIdFromArticle(article) {
    const guide = article.querySelector('a[href*="guided-session.html?session="]');
    if (!guide) return null;
    return new URL(guide.href).searchParams.get("session");
  }

  function decorate() {
    document.querySelectorAll("article.session").forEach(article => {
      if (article.dataset.photosReady === "1") return;
      const sessionId = sessionIdFromArticle(article);
      const cover = covers.get(sessionId);
      if (!cover) return;
      article.dataset.photosReady = "1";
      const top = article.querySelector(".session-top");
      if (cover.url && top) top.insertAdjacentHTML("beforebegin", `<img class="session-cover" src="${cover.url}" alt="Foto copertina sessione">`);
      if (top) top.insertAdjacentHTML("afterend", `<span class="session-photo-count">📷 ${cover.count} ${cover.count === 1 ? "foto" : "foto"}</span>`);
    });
  }

  async function init() {
    injectStyles();
    const auth = await client.auth.getSession();
    if (!auth.data.session?.user) return;
    try {
      await loadCovers();
      decorate();
      const list = document.querySelector("#list");
      if (list) new MutationObserver(decorate).observe(list, { childList: true, subtree: true });
    } catch (error) {
      console.warn("Copertine storico non disponibili:", error.message);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();