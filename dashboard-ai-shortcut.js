"use strict";

(() => {
  function renderAssistantShortcut() {
    const grid = document.querySelector(".dashboard-action-grid");
    if (!grid) return false;

    grid.innerHTML = `
      <a class="dashboard-action" href="ai/index.html?v=2">
        <span aria-hidden="true">✨</span>
        <div>
          <strong>Assistente AI</strong>
          <small>Chef, impasti, Planner e fonti da un unico punto.</small>
        </div>
        <b aria-hidden="true">→</b>
      </a>`;

    const section = grid.closest(".section");
    const heading = section?.querySelector(".section-heading h3");
    const copy = section?.querySelector(".section-heading p");
    if (heading) heading.textContent = "Assistente AI";
    if (copy) copy.textContent = "Accedi agli assistenti specializzati da un unico hub.";
    return true;
  }

  window.addEventListener("cucina-hub:view-rendered", event => {
    if (event.detail?.view === "dashboard") renderAssistantShortcut();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderAssistantShortcut, { once: true });
  } else {
    renderAssistantShortcut();
  }
})();
