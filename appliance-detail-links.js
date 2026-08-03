"use strict";

(function () {
  const DETAIL_PATH = "appliances/detail.html";

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

  function openRequestedDetail() {
    const select = document.querySelector("#appliance");
    const button = document.querySelector("#load");
    if (!select || !button) return;

    const requestedName = new URLSearchParams(location.search).get("name")?.trim();
    if (!requestedName) return;

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const option = [...select.options].find(item => item.textContent.trim() === requestedName);
      if (option) {
        clearInterval(timer);
        select.value = option.value;
        button.click();
        return;
      }
      if (attempts >= 50) clearInterval(timer);
    }, 100);
  }

  const root = document.querySelector("#viewRoot");
  if (root) {
    const observer = new MutationObserver(addDetailLinks);
    observer.observe(root, { childList: true, subtree: true });
    addDetailLinks();
  }

  openRequestedDetail();
})();
