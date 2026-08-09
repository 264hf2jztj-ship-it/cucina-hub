"use strict";

(() => {
  function addLink() {
    if (document.querySelector("[data-fermentation-assistant-link]")) return true;
    const link = document.createElement("a");
    link.href = "./fermentation-assistant.html?v=4";
    link.textContent = "ASSISTENTE AI";
    link.dataset.fermentationAssistantLink = "true";

    const actions = document.querySelector(".head-actions");
    if (actions) {
      link.className = location.pathname.endsWith("/baking-session-history.html") || location.pathname.endsWith("/fermentation-learning.html")
        ? "button"
        : "secondary-link";
      actions.prepend(link);
      return true;
    }

    if (location.pathname.endsWith("/baking-wizard.html")) {
      link.className = "button secondary";
      link.style.display = "inline-block";
      link.style.width = "auto";
      const intro = document.querySelector("main > p.muted");
      if (!intro) return false;
      const row = document.createElement("div");
      row.className = "actions";
      row.style.marginBottom = "14px";
      row.appendChild(link);
      intro.insertAdjacentElement("afterend", row);
      return true;
    }

    return false;
  }

  if (addLink()) return;
  const wait = window.setInterval(() => {
    if (!addLink()) return;
    window.clearInterval(wait);
  }, 100);
})();
