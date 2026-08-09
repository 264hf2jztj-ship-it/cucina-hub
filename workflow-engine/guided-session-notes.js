"use strict";

(() => {
  const client = window.cucinaHubSupabase;
  const sessionId = new URLSearchParams(window.location.search).get("session");

  if (!client || !sessionId) return;

  const phases = {
    general: "Generale",
    preparation: "Preparazione ingredienti",
    mixing: "Impasto",
    bulk: "Puntata",
    cold: "Frigorifero",
    shaping: "Formatura / staglio",
    proof: "Appretto",
    baking: "Cottura",
    result: "Risultato"
  };

  const kinds = {
    observation: "Osservazione",
    change: "Modifica eseguita",
    problem: "Problema",
    idea: "Idea per la prossima volta"
  };

  let user = null;
  let panel = null;
  let statusNode = null;
  let recentNode = null;
  let phaseSelect = null;

  const esc = value => String(value ?? "").replace(/[&<>\'\"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character]);

  function optionList(values, selected) {
    return Object.entries(values).map(([value, label]) =>
      `<option value="${value}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`
    ).join("");
  }

  function detectCurrentPhase() {
    const text = String(document.querySelector("#title")?.textContent || "").toLowerCase();
    if (/ingred|prepar/.test(text)) return "preparation";
    if (/impast|mescol|incord/.test(text)) return "mixing";
    if (/puntat|prima lievit/.test(text)) return "bulk";
    if (/frigo|fredd/.test(text)) return "cold";
    if (/formatur|staglio|panett/.test(text)) return "shaping";
    if (/apprett|seconda lievit/.test(text)) return "proof";
    if (/cott|forno|inforn/.test(text)) return "baking";
    if (/complet|risultat/.test(text)) return "result";
    return "general";
  }

  function setStatus(message, kind = "") {
    if (!statusNode) return;
    statusNode.className = `guided-note-status ${kind}`.trim();
    statusNode.textContent = message;
  }

  function injectStyles() {
    if (document.querySelector("#guidedNotesStyles")) return;
    const style = document.createElement("style");
    style.id = "guidedNotesStyles";
    style.textContent = `
      .guided-notes{margin:16px 0;border:1px solid #c9d9cf;border-radius:14px;background:#f6fbf7;overflow:hidden}
      .guided-notes summary{padding:13px 15px;font-weight:800;cursor:pointer;list-style:none}.guided-notes summary::-webkit-details-marker{display:none}
      .guided-notes summary::after{content:'＋';float:right}.guided-notes[open] summary::after{content:'−'}
      .guided-note-body{padding:0 15px 15px}
      .guided-note-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      .guided-note-grid .note-text{grid-column:1/-1}
      .guided-notes label{display:block;font-weight:800;margin-bottom:5px}
      .guided-notes select,.guided-notes textarea{width:100%;box-sizing:border-box;border:1px solid #bbb2a6;border-radius:10px;padding:10px;font:inherit;background:#fff}
      .guided-notes textarea{min-height:78px;resize:vertical}
      .guided-note-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.guided-note-actions button{padding:10px 12px}
      .guided-note-status{margin:9px 0;color:#6d655c}.guided-note-status.ok{color:#176b35}.guided-note-status.error{color:#a62424}
      .guided-note-recent{display:grid;gap:7px;margin-top:10px}.guided-note-item{background:#fff;border:1px solid #ddd5ca;border-radius:10px;padding:9px 10px}
      .guided-note-item-head{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:5px}.guided-note-badge{padding:3px 7px;border-radius:999px;background:#eee8df;font-size:.72rem;font-weight:800}.guided-note-time{margin-left:auto;color:#6d655c;font-size:.78rem}
      .guided-note-empty{color:#6d655c;font-size:.9rem}
      @media(max-width:600px){.guided-note-grid{grid-template-columns:1fr}.guided-note-grid .note-text{grid-column:auto}.guided-note-time{margin-left:0;width:100%}}
    `;
    document.head.appendChild(style);
  }

  function buildPanel() {
    if (document.querySelector("#guidedNotesPanel")) return true;
    const nav = document.querySelector(".nav");
    if (!nav) return false;

    const detected = detectCurrentPhase();
    panel = document.createElement("details");
    panel.id = "guidedNotesPanel";
    panel.className = "guided-notes";
    panel.innerHTML = `
      <summary>📝 AGGIUNGI UNA NOTA ALLA SESSIONE</summary>
      <div class="guided-note-body">
        <p class="muted">Annota subito ciò che osservi. La nota sarà disponibile nel Diario fermentazioni con fase e orario.</p>
        <div class="guided-note-grid">
          <div><label for="guidedNotePhase">Fase</label><select id="guidedNotePhase">${optionList(phases, detected)}</select></div>
          <div><label for="guidedNoteKind">Tipo</label><select id="guidedNoteKind">${optionList(kinds, "observation")}</select></div>
          <div class="note-text"><label for="guidedNoteText">Nota</label><textarea id="guidedNoteText" maxlength="5000" placeholder="Es. impasto ancora molto teso, prolungo il riposo di 15 minuti."></textarea></div>
        </div>
        <div class="guided-note-actions"><button id="guidedNoteSave" type="button">SALVA NOTA</button></div>
        <div id="guidedNoteStatus" class="guided-note-status">Pronto.</div>
        <div id="guidedNoteRecent" class="guided-note-recent"></div>
      </div>
    `;
    nav.insertAdjacentElement("beforebegin", panel);
    statusNode = panel.querySelector("#guidedNoteStatus");
    recentNode = panel.querySelector("#guidedNoteRecent");
    phaseSelect = panel.querySelector("#guidedNotePhase");
    panel.querySelector("#guidedNoteSave").addEventListener("click", saveNote);
    panel.addEventListener("toggle", () => {
      if (panel.open) phaseSelect.value = detectCurrentPhase();
    });
    return true;
  }

  function validateText(value) {
    const text = String(value || "").trim();
    if (!text) throw new Error("Scrivi il testo della nota.");
    if (text.length > 5000) throw new Error("La nota supera il limite di 5000 caratteri.");
    return text;
  }

  async function loadRecent() {
    const { data, error } = await client.from("baking_session_notes")
      .select("id,phase_key,note_kind,note_text,observed_at")
      .eq("session_id", sessionId)
      .order("observed_at", { ascending: false })
      .limit(3);
    if (error) throw error;

    const notes = data || [];
    if (!notes.length) {
      recentNode.innerHTML = '<div class="guided-note-empty">Nessuna nota ancora registrata.</div>';
      return;
    }

    recentNode.innerHTML = notes.map(note => `
      <div class="guided-note-item">
        <div class="guided-note-item-head">
          <span class="guided-note-badge">${esc(phases[note.phase_key] || phases.general)}</span>
          <span class="guided-note-badge">${esc(kinds[note.note_kind] || kinds.observation)}</span>
          <span class="guided-note-time">${esc(new Date(note.observed_at).toLocaleString("it-IT"))}</span>
        </div>
        <div>${esc(note.note_text)}</div>
      </div>
    `).join("");
  }

  async function saveNote() {
    try {
      const textArea = panel.querySelector("#guidedNoteText");
      const text = validateText(textArea.value);
      const now = new Date().toISOString();
      setStatus("Salvataggio nota…");
      const { error } = await client.from("baking_session_notes").insert({
        owner_user_id: user.id,
        session_id: sessionId,
        phase_key: phaseSelect.value,
        note_kind: panel.querySelector("#guidedNoteKind").value,
        note_text: text,
        observed_at: now,
        created_at: now,
        updated_at: now
      });
      if (error) throw error;
      textArea.value = "";
      await loadRecent();
      setStatus("Nota salvata nel Diario fermentazioni.", "ok");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function observePhaseChanges() {
    const title = document.querySelector("#title");
    if (!title) return;
    const observer = new MutationObserver(() => {
      if (phaseSelect && !panel?.open) phaseSelect.value = detectCurrentPhase();
    });
    observer.observe(title, { childList: true, characterData: true, subtree: true });
  }

  async function init() {
    injectStyles();
    const auth = await client.auth.getSession();
    if (auth.error) throw auth.error;
    user = auth.data.session?.user;
    if (!user) return;

    const waitForUi = window.setInterval(async () => {
      if (!buildPanel()) return;
      window.clearInterval(waitForUi);
      observePhaseChanges();
      try {
        await loadRecent();
      } catch (error) {
        setStatus(error.message, "error");
      }
    }, 150);
  }

  init().catch(error => console.error("Note Sessione Guidata non disponibili:", error));
})();
