(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
    return;
  }

  root.CucinaHubPageNavigation = api;

  const start = () => api.mount(root.document, root);
  if (root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const NAV_ID = "cucinaHubPageNavigation";
  const STYLE_ID = "cucinaHubPageNavigationStyles";

  function appRootPath(dashboardUrl) {
    return new URL("./", dashboardUrl).pathname;
  }

  function canUseBrowserBack(referrer, currentUrl, dashboardUrl, historyLength) {
    if (!referrer || Number(historyLength) <= 1) return false;

    try {
      const previous = new URL(referrer);
      const current = new URL(currentUrl);
      const dashboard = new URL(dashboardUrl);
      const samePage = previous.pathname === current.pathname && previous.search === current.search;

      return (
        previous.origin === current.origin &&
        previous.origin === dashboard.origin &&
        previous.pathname.startsWith(appRootPath(dashboard)) &&
        !samePage
      );
    } catch {
      return false;
    }
  }

  function resolveDashboardUrl(documentObject) {
    const script = documentObject.currentScript || documentObject.querySelector('script[src*="page-navigation.js"]');
    if (!script?.src) return new URL("../index.html?v=24", documentObject.baseURI).href;
    return new URL("index.html?v=24", script.src).href;
  }

  function addStyles(documentObject) {
    if (documentObject.getElementById(STYLE_ID)) return;

    const style = documentObject.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .cucina-page-nav {
        position: fixed;
        right: max(16px, env(safe-area-inset-right));
        bottom: max(16px, env(safe-area-inset-bottom));
        z-index: 900;
        display: flex;
        gap: 8px;
        padding: 8px;
        border: 1px solid rgba(31, 42, 36, .16);
        border-radius: 16px;
        background: rgba(255, 255, 255, .94);
        box-shadow: 0 12px 32px rgba(31, 42, 36, .18);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
      }
      .cucina-page-nav__action {
        display: inline-flex;
        min-height: 44px;
        align-items: center;
        justify-content: center;
        padding: 10px 14px;
        border: 1px solid #dbe3dd;
        border-radius: 11px;
        background: #fff;
        color: #1f2a24;
        font: 700 .9rem/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-decoration: none;
        cursor: pointer;
      }
      .cucina-page-nav__action--home {
        border-color: #2f6b4f;
        background: #2f6b4f;
        color: #fff;
      }
      body.cucina-page-nav-active {
        padding-bottom: calc(88px + env(safe-area-inset-bottom));
      }
      @media (max-width: 600px) {
        .cucina-page-nav {
          right: max(10px, env(safe-area-inset-right));
          bottom: max(10px, env(safe-area-inset-bottom));
          left: max(10px, env(safe-area-inset-left));
        }
        .cucina-page-nav__action { flex: 1 1 0; }
      }
      @media print { .cucina-page-nav { display: none !important; } }
    `;
    documentObject.head.appendChild(style);
  }

  function mount(documentObject, windowObject) {
    if (!documentObject?.body || documentObject.getElementById(NAV_ID)) return null;

    const dashboardUrl = resolveDashboardUrl(documentObject);
    addStyles(documentObject);

    const nav = documentObject.createElement("nav");
    nav.id = NAV_ID;
    nav.className = "cucina-page-nav";
    nav.setAttribute("aria-label", "Navigazione pagina");

    const back = documentObject.createElement("button");
    back.className = "cucina-page-nav__action";
    back.type = "button";
    back.textContent = "← Indietro";
    back.addEventListener("click", () => {
      if (canUseBrowserBack(documentObject.referrer, windowObject.location.href, dashboardUrl, windowObject.history.length)) {
        windowObject.history.back();
      } else {
        windowObject.location.assign(dashboardUrl);
      }
    });

    const dashboard = documentObject.createElement("a");
    dashboard.className = "cucina-page-nav__action cucina-page-nav__action--home";
    dashboard.href = dashboardUrl;
    dashboard.textContent = "⌂ Dashboard";

    nav.append(back, dashboard);
    documentObject.body.appendChild(nav);
    documentObject.body.classList.add("cucina-page-nav-active");
    return nav;
  }

  return { appRootPath, canUseBrowserBack, mount, resolveDashboardUrl };
});
