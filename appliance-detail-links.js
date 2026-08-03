"use strict";

(function () {
  const DETAIL_PATH = "appliances/open.html";

  function addDetailLinks() {
    document.querySelectorAll(".appliance-row").forEach(row => {
      if (row.querySelector("[data-appliance-detail-link]")) return;
      const heading = row.querySelector("h3");
      if (!heading) return;

      const name = heading.textContent.trim();
      if (!name) return;

      const link = document.createElement("a");
      link.className = "card-link";
      link.dataset.applianceDetailLink = "true";
      link.href = `${DETAIL_PATH}?name=${encodeURIComponent(name)}`;
      link.textContent = "Apri scheda →";
      link.setAttribute("aria-label", `Apri la scheda di ${name}`);

      const badge = row.querySelector(":scope > .badge");
      if (badge) {
        const actions = document.createElement("div");
        actions.style.display = "grid";
        actions.style.gap = "10px";
        actions.style.justifyItems = "end";
        badge.replaceWith(actions);
        actions.append(badge, link);
      } else {
        row.appendChild(link);
      }
    });
  }

  const root = document.querySelector("#viewRoot");
  if (!root) return;
  const observer = new MutationObserver(addDetailLinks);
  observer.observe(root, { childList: true, subtree: true });
  addDetailLinks();
})();
