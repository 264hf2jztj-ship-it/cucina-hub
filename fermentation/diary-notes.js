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
  let notes = [];
  let panel = null;
  let listNode = null;
  let statusNode = null;

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

  function toLocalInput(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function toIso(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error("Data e ora della nota non valide.");
    return date.toISOString();
  }

  function setStatus(message, kind = "") {
    if (!statusNode) return;
    statusNode.className = `diary-note-status ${kind}`.trim();
    statusNode.textContent = message;
  }

  function injectStyles() {
    if (document.querySelector("#diaryNotesStyles")) return;
    const style = document.createElement("style");
    style.id = "diaryNotesStyles";
    style.textContent = `
      .diary-notes .diary-note-compose{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px;align-items:end}
      .diary-notes .diary-note-compose .note-text{grid-column:1/-1}
      .diary-notes label{display:block;font-weight:800;margin-bottom:6px}
      .diary-notes select,.diary-notes input,.diary-notes textarea{width:100%;border:1px solid #bbb2a6;border-radius:10px;padding:11px;font:inherit;background:#fff}
      .diary-notes textarea{min-height:90px;resize:vertical}
      .diary-note-actions,.diary-note-card-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .diary-note-actions button,.diary-note-card-actions button{width:auto;padding:10px 12px}
      .diary-note-card-actions .secondary{background:#eee8df;color:#26221d}
      .diary-note-status{margin:10px 0;color:#6d655c}.diary-note-status.ok{color:#176b35}.diary-note-status.error{color:#a62424}
      .diary-note-list{display:grid;gap:11px;margin-top:14px}
      .diary-note-card{border:1px solid #ddd5ca;border-radius:13px;padding:13px;background:#faf8f4}
      .diary-note-card-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:10px}
      .diary-note-badges{display:flex;gap:6px;flex-wrap:wrap}
      .diary-note-badge{display:inline-block;padding:4px 8px;border-radius:999px;background:#eee8df;font-size:.76rem;font-weight:800}
      .diary-note-badge.problem{background:#fff0ed;color:#9f2d2d}.diary-note-badge.change{background:#eef5f0;color:#365d44}.diary-note-badge.idea{background:#f4f0f8;color:#6d408f}
      .diary-note-date{color:#6d655c;font-size:.84rem;white-space:nowrap}
      .diary-note-edit-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
      .diary-note-edit-grid .note-text{grid-column:1/-1}
      .diary-note-empty{padding:20px;text-align:center;color:#6d655c;background:#faf8f4;border-radius:12px}
      @media(max-width:760px){.diary-notes .diary-note-compose,.diary-note-edit-grid{grid-template-columns:1fr}.diary-notes .diary-note-compose .note-text,.diary-note-edit-grid .note-text{grid-column:auto}.diary-note-card-head{flex-direction:column}.diary-note-date{white-space:normal}}
    `;
    document.head.appendChild(style);
  }

  function buildPanel() {
    if (document.querySelector("#diaryNotesPanel")) return true;
    const form = document.querySelector("#form");
    if (!form) return false;

    const photoPanel = document.querySelector("#diaryPhotosPanel");
    const sections = form.querySelectorAll(":scope > section.panel");
    const finalActions = sections[sections.length - 1];

    panel = document.createElement("section");
    panel.id = "diaryNotesPanel";
    panel.className = "panel diary-notes";
    panel.innerHTML = `
      <h2>4. Note cronologiche della sessione</h2>
      <p class="helper">Registra ciò che osservi mentre lavori: cambiamenti, problemi e idee restano ordinati per fase e orario. Le tre osservazioni finali sopra continuano a essere il riepilogo conclusivo.</p>
      <div class="diary-note-compose">
        <div>
          <label for="diaryNotePhase">Fase</label>
          <select id="diaryNotePhase">${optionList(phases, "general")}</select>
        </div>
        <div>
          <label for="diaryNoteKind">Tipo</label>
          <select id="diaryNoteKind">${optionList(kinds, "observation")}</select>
        </div>
        <div>
          <label for="diaryNoteObservedAt">Data e ora</label>
          <input id="diaryNoteObservedAt" type="datetime-local" value="${toLocalInput()}">
        </div>
        <div class="note-text">
          <label for="diaryNoteText">Nota</label>
          <textarea id="diaryNoteText" maxlength="5000" placeholder="Es. dopo 90 minuti la massa è cresciuta circa del 60% e presenta bolle laterali."></textarea>
        </div>
      </div>
      <div class="diary-note-actions"><button id="diaryNoteAdd" type="button">AGGIUNGI NOTA</button></div>
      <div id="diaryNoteStatus" class="diary-note-status">Caricamento note…</div>
      <div id="diaryNoteList" class="diary-note-list"></div>
    `;

    if (photoPanel) photoPanel.insertAdjacentElement("beforebegin", panel);
    else if (finalActions) finalActions.insertAdjacentElement("beforebegin", panel);
    else form.appendChild(panel);

    listNode = panel.querySelector("#diaryNoteList");
    statusNode = panel.querySelector("#diaryNoteStatus");
    panel.querySelector("#diaryNoteAdd").addEventListener("click", createNote);
    return true;
  }

  async function loadNotes() {
    const { data, error } = await client.from("baking_session_notes")
      .select("*")
      .eq("session_id", sessionId)
      .order("observed_at", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    notes = data || [];
    renderNotes();
    setStatus(`${notes.length} ${notes.length === 1 ? "nota registrata" : "note registrate"}.`, "ok");
  }

  function renderNotes() {
    if (!listNode) return;
    if (!notes.length) {
      listNode.innerHTML = '<div class="diary-note-empty">Nessuna nota cronologica. Puoi aggiungerla qui oppure direttamente durante la Sessione Guidata.</div>';
      return;
    }

    listNode.innerHTML = notes.map(note => `
      <article class="diary-note-card" data-note-card="${note.id}">
        <div class="diary-note-card-head">
          <div class="diary-note-badges">
            <span class="diary-note-badge">${esc(phases[note.phase_key] || phases.general)}</span>
            <span class="diary-note-badge ${esc(note.note_kind)}">${esc(kinds[note.note_kind] || kinds.observation)}</span>
          </div>
          <span class="diary-note-date">${esc(new Date(note.observed_at).toLocaleString("it-IT"))}</span>
        </div>
        <div class="diary-note-edit-grid">
          <div><label>Fase</label><select data-phase>${optionList(phases, note.phase_key)}</select></div>
          <div><label>Tipo</label><select data-kind>${optionList(kinds, note.note_kind)}</select></div>
          <div><label>Data e ora</label><input data-observed type="datetime-local" value="${toLocalInput(note.observed_at)}"></div>
          <div class="note-text"><label>Testo</label><textarea data-text maxlength="5000">${esc(note.note_text)}</textarea></div>
        </div>
        <div class="diary-note-card-actions">
          <button type="button" data-save-note="${note.id}">SALVA MODIFICHE</button>
          <button type="button" class="secondary" data-delete-note="${note.id}">ELIMINA</button>
        </div>
      </article>
    `).join("");

    listNode.querySelectorAll("[data-save-note]").forEach(button =>
      button.addEventListener("click", () => saveNote(button.dataset.saveNote))
    );
    listNode.querySelectorAll("[data-delete-note]").forEach(button =>
      button.addEventListener("click", () => deleteNote(button.dataset.deleteNote))
    );
  }

  function validateText(value) {
    const text = String(value || "").trim();
    if (!text) throw new Error("Scrivi il testo della nota.");
    if (text.length > 5000) throw new Error("La nota supera il limite di 5000 caratteri.");
    return text;
  }

  async function createNote() {
    try {
      const text = validateText(panel.querySelector("#diaryNoteText").value);
      const now = new Date().toISOString();
      setStatus("Salvataggio nota…");
      const { error } = await client.from("baking_session_notes").insert({
        owner_user_id: user.id,
        session_id: sessionId,
        phase_key: panel.querySelector("#diaryNotePhase").value,
        note_kind: panel.querySelector("#diaryNoteKind").value,
        note_text: text,
        observed_at: toIso(panel.querySelector("#diaryNoteObservedAt").value),
        created_at: now,
        updated_at: now
      });
      if (error) throw error;
      panel.querySelector("#diaryNoteText").value = "";
      panel.querySelector("#diaryNoteObservedAt").value = toLocalInput();
      await loadNotes();
      setStatus("Nota aggiunta al Diario fermentazioni.", "ok");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function saveNote(id) {
    try {
      const card = listNode.querySelector(`[data-note-card="${id}"]`);
      if (!card) return;
      const text = validateText(card.querySelector("[data-text]").value);
      setStatus("Aggiornamento nota…");
      const { error } = await client.from("baking_session_notes").update({
        phase_key: card.querySelector("[data-phase]").value,
        note_kind: card.querySelector("[data-kind]").value,
        note_text: text,
        observed_at: toIso(card.querySelector("[data-observed]").value),
        updated_at: new Date().toISOString()
      }).eq("id", id);
      if (error) throw error;
      await loadNotes();
      setStatus("Nota aggiornata.", "ok");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function deleteNote(id) {
    const note = notes.find(item => item.id === id);
    if (!note || !window.confirm("Eliminare definitivamente questa nota?")) return;
    try {
      setStatus("Eliminazione nota…");
      const { error } = await client.from("baking_session_notes").delete().eq("id", id);
      if (error) throw error;
      await loadNotes();
      setStatus("Nota eliminata.", "ok");
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
        await loadNotes();
      } catch (error) {
        setStatus(error.message, "error");
      }
    }, 150);
  }

  init().catch(error => console.error("Note Diario non disponibili:", error));
})();
