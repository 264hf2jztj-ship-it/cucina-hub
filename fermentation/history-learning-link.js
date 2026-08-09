"use strict";

(() => {
  function addLink() {
    if (document.querySelector("[data-fermentation-learning-link]")) return true;
    const actions = document.querySelector(".head-actions");
    if (!actions) return false;
    const link = document.createElement("a");
    link.href = "./fermentation-learning.html?v=1";
    link.textContent = "LEARNING";
    link.dataset.fermentationLearningLink = "true";
    link.className = location.pathname.endsWith("/baking-session-history.html")
      ? "button"
      : "secondary-link";
    actions.prepend(link);
    return true;
  }

  if (addLink()) return;
  const wait = window.setInterval(() => {
    if (!addLink()) return;
    window.clearInterval(wait);
  }, 100);
})();
