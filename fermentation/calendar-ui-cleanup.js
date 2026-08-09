"use strict";

(() => {
  if (!window.location.pathname.endsWith("/fermentation/baking-wizard.html")) return;

  const DIRECT_INFO = '<strong>Aggiunta diretta su iPhone e iPad</strong><br><span class="muted">Cucina Hub avvia il Comando Rapido “Cucina Hub Calendario” con gli appuntamenti della timeline.</span>';

  function simplifyCalendarUi() {
    document.querySelector("#shortcutSetup")?.remove();
    document.querySelector("#calendarIcs")?.remove();

    const calendarButton = document.querySelector("#calendar");
    if (calendarButton) {
      calendarButton.textContent = "AGGIUNGI AL CALENDARIO";
      calendarButton.title = "Aggiunge gli appuntamenti della timeline al Calendario tramite il Comando Rapido Cucina Hub Calendario.";
    }

    const calendarInfo = document.querySelector("#calendarInfo");
    if (calendarInfo && /\.ics|CONFIGURA COMANDO RAPIDO/i.test(calendarInfo.textContent || "")) {
      calendarInfo.innerHTML = DIRECT_INFO;
    }

    const status = document.querySelector("#status");
    if (status && /CONFIGURA COMANDO RAPIDO/i.test(status.textContent || "")) {
      status.textContent = "Comando Rapido avviato.";
    }
  }

  function start() {
    const style = document.createElement("style");
    style.textContent = "#shortcutSetup,#calendarIcs{display:none!important}";
    document.head.appendChild(style);

    simplifyCalendarUi();
    const observer = new MutationObserver(simplifyCalendarUi);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
