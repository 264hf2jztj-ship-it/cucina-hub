"use strict";

(() => {
  const path = window.location.pathname;
  const sizingFields = [
    "dough_shape","portion_count","portion_weight_g","dough_total_weight_g",
    "tray_width_cm","tray_length_cm","round_diameter_cm","dough_loading_g_cm2","sizing_profile"
  ];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-dough-sizing-engine]`);
      if (existing) {
        if (window.CucinaHubDoughSizingEngine) resolve();
        else existing.addEventListener("load", resolve, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.dataset.doughSizingEngine = "1";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Motore di calcolo impasto non disponibile."));
      document.head.appendChild(script);
    });
  }

  function waitFor(check, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = window.setInterval(() => {
        try {
          const value = check();
          if (value) {
            window.clearInterval(timer);
            resolve(value);
          } else if (Date.now() - started > timeoutMs) {
            window.clearInterval(timer);
            reject(new Error("Interfaccia del Wizard non pronta."));
          }
        } catch (error) {
          window.clearInterval(timer);
          reject(error);
        }
      }, 80);
    });
  }

  function initSessionsSupport() {
    waitFor(() => document.querySelector("#list") && typeof duplicateFields !== "undefined" && typeof sessions !== "undefined").then(() => {
      try {
        if (typeof duplicateFields !== "undefined" && Array.isArray(duplicateFields)) {
          sizingFields.forEach(field => { if (!duplicateFields.includes(field)) duplicateFields.push(field); });
        }
      } catch (error) {
        console.warn("Campi formato non aggiunti alla duplicazione:", error.message);
      }

      const decorate = () => {
        if (typeof sessions === "undefined" || !Array.isArray(sessions)) return;
        document.querySelectorAll("article.session").forEach(article => {
          if (article.dataset.doughSizingReady === "1") return;
          const link = article.querySelector('a[href*="guided-session.html?session="]');
          if (!link) return;
          const id = new URL(link.href).searchParams.get("session");
          const session = sessions.find(item => item.id === id);
          if (!session || !session.dough_shape) return;
          const metrics = article.querySelector(".metrics");
          if (!metrics) return;
          const format = session.dough_shape === "tray"
            ? `${session.portion_count || 1} teglie ${session.tray_width_cm || "—"}×${session.tray_length_cm || "—"} cm`
            : session.dough_shape === "round"
              ? `${session.portion_count || 1} panetti Ø ${session.round_diameter_cm || "—"} cm`
              : "Quantità manuale";
          metrics.insertAdjacentHTML("afterbegin", `<span class="metric">${format}</span>${session.portion_weight_g ? `<span class="metric">${Number(session.portion_weight_g).toFixed(0)} g per panetto</span>` : ""}`);
          article.dataset.doughSizingReady = "1";
        });
      };
      decorate();
      new MutationObserver(decorate).observe(document.querySelector("#list"), { childList: true, subtree: true });
    }).catch(error => console.warn(error.message));
  }

  async function initWizard() {
    await loadScript("../workflow-engine/dough-sizing-engine.js?v=1");
    await waitFor(() => {
      const button = document.querySelector("#generate");
      return button && typeof button.onclick === "function" && typeof window.CucinaHubDoughSizingEngine !== "undefined" ? button : null;
    });

    const engine = window.CucinaHubDoughSizingEngine;
    const styleSelect = document.querySelector("#style");
    const flourInput = document.querySelector("#flourWeight");
    const flourField = flourInput?.parentElement;
    const flourBox = document.querySelector(".flour-box");
    const generateButton = document.querySelector("#generate");
    const resetButton = document.querySelector("#reset");
    if (!styleSelect || !flourInput || !flourBox || !generateButton) return;

    const style = document.createElement("style");
    style.textContent = `
      .dough-sizing-box{background:#eef5f0;border:1px solid #cbdccd;border-radius:14px;padding:14px}
      .dough-sizing-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:10px}
      .dough-sizing-grid .wide{grid-column:span 2}.dough-sizing-preview{margin-top:11px;padding:11px;border-radius:10px;background:#fff;border:1px solid #d4e1d6}
      .dough-sizing-preview strong{display:block;font-size:1.08rem}.dough-sizing-helper{margin-top:5px;color:#6d655c;font-size:.9rem}
      @media(max-width:760px){.dough-sizing-grid{grid-template-columns:1fr 1fr}.dough-sizing-grid .wide{grid-column:1/-1}}
      @media(max-width:430px){.dough-sizing-grid{grid-template-columns:1fr}.dough-sizing-grid .wide{grid-column:auto}}
    `;
    document.head.appendChild(style);

    const box = document.createElement("div");
    box.className = "full dough-sizing-box";
    box.innerHTML = `
      <label>Quanto impasto vuoi preparare?</label>
      <div class="dough-sizing-helper">Il Wizard parte dal numero di teglie o panetti e ricava automaticamente farina, acqua, sale e lievito.</div>
      <div class="dough-sizing-grid">
        <div><label id="sizingCountLabel" for="sizingCount">Numero</label><input id="sizingCount" type="number" min="1" max="50" step="1" value="1"></div>
        <div id="trayWidthWrap"><label for="trayWidth">Larghezza teglia (cm)</label><input id="trayWidth" type="number" min="10" max="100" step="0.5" value="30"></div>
        <div id="trayLengthWrap"><label for="trayLength">Lunghezza teglia (cm)</label><input id="trayLength" type="number" min="10" max="100" step="0.5" value="40"></div>
        <div id="roundDiameterWrap" hidden><label for="roundDiameter">Diametro (cm)</label><input id="roundDiameter" type="number" min="8" max="60" step="0.5" value="30"></div>
        <div class="wide"><label for="sizingProfile">Risultato desiderato</label><select id="sizingProfile"><option value="thin">Più sottile e croccante</option><option value="standard" selected>Equilibrata</option><option value="thick">Più alta e morbida</option><option value="custom">Personalizzata</option></select></div>
        <div class="wide"><label for="loadingFactor">Carico impasto (g/cm²)</label><input id="loadingFactor" type="number" min="0.15" max="1.20" step="0.001"></div>
      </div>
      <div id="sizingPreview" class="dough-sizing-preview"></div>
    `;
    flourBox.insertAdjacentElement("beforebegin", box);

    const nodes = {
      count: box.querySelector("#sizingCount"), countLabel: box.querySelector("#sizingCountLabel"),
      width: box.querySelector("#trayWidth"), length: box.querySelector("#trayLength"), diameter: box.querySelector("#roundDiameter"),
      widthWrap: box.querySelector("#trayWidthWrap"), lengthWrap: box.querySelector("#trayLengthWrap"), diameterWrap: box.querySelector("#roundDiameterWrap"),
      profile: box.querySelector("#sizingProfile"), loading: box.querySelector("#loadingFactor"), preview: box.querySelector("#sizingPreview")
    };
    let latestSizing = null;
    const originalGenerate = generateButton.onclick;
    const originalReset = resetButton?.onclick;

    function currentStyle() { return styleSelect.value; }
    function defaultForStyle() { return engine.styleDefault(currentStyle()); }
    function setDefaultValues() {
      const defaults = defaultForStyle();
      nodes.count.value = defaults.count || 1;
      nodes.width.value = defaults.width_cm || 30;
      nodes.length.value = defaults.length_cm || 40;
      nodes.diameter.value = defaults.diameter_cm || 30;
      nodes.profile.value = defaults.profile || "standard";
      nodes.loading.value = defaults.loading_g_cm2 || "";
      renderMode();
      updatePreview();
    }
    function renderMode() {
      const defaults = defaultForStyle();
      const tray = defaults.shape === engine.SHAPES.TRAY;
      const round = defaults.shape === engine.SHAPES.ROUND;
      const manual = defaults.shape === engine.SHAPES.MANUAL;
      box.hidden = manual;
      if (flourField) flourField.hidden = !manual;
      nodes.widthWrap.hidden = !tray;
      nodes.lengthWrap.hidden = !tray;
      nodes.diameterWrap.hidden = !round;
      nodes.countLabel.textContent = tray ? "Numero teglie (1 panetto per teglia)" : "Numero panetti";
    }
    function syncLoadingFromProfile() {
      const defaults = defaultForStyle();
      if (defaults.shape === engine.SHAPES.MANUAL) return;
      if (nodes.profile.value !== "custom") nodes.loading.value = engine.loadingFor({ style: currentStyle(), profile: nodes.profile.value });
    }
    function calculateSizing() {
      const defaults = defaultForStyle();
      if (defaults.shape === engine.SHAPES.MANUAL) return engine.calculate({ style: currentStyle(), shape: defaults.shape, manualFlourG: flourInput.value });
      return engine.calculate({
        style: currentStyle(), shape: defaults.shape, count: nodes.count.value, widthCm: nodes.width.value,
        lengthCm: nodes.length.value, diameterCm: nodes.diameter.value, profile: nodes.profile.value, loadingGcm2: nodes.loading.value
      });
    }
    function formulaEstimate(sizing) {
      if (sizing.shape === engine.SHAPES.MANUAL) return null;
      const preset = typeof presets !== "undefined" ? presets[currentStyle()] : null;
      if (!preset) throw new Error("Preset ricetta non disponibile.");
      const target = new Date(document.querySelector("#targetMeal")?.value || "");
      const hours = Number.isNaN(target.getTime()) ? 24 : Math.max(4, (target - Date.now()) / 3600000);
      const environment = typeof env === "function" ? env() : null;
      return engine.deriveFormula({
        totalDoughWeightG: sizing.total_dough_weight_g, hydrationPercent: preset.hydration, saltPercent: preset.salt,
        stylePreset: preset, hours, yeastType: document.querySelector("#yeastType")?.value || "fresh_yeast",
        roomTemperatureC: Number(environment?.room_temperature_c ?? 22), referenceTemperatureC: 22
      });
    }
    function syncFormula(formula, sizing) {
      flourInput.value = formula.flour_weight_g.toFixed(1);
      if (typeof updateFlourPreview === "function") updateFlourPreview();
      window.dispatchEvent(new CustomEvent("cucina-hub:dough-sizing-updated", {
        detail: { style: currentStyle(), sizing, formula }
      }));
    }
    function updatePreview() {
      try {
        renderMode();
        syncLoadingFromProfile();
        const sizing = calculateSizing();
        latestSizing = sizing;
        if (sizing.shape === engine.SHAPES.MANUAL) return;
        const formula = formulaEstimate(sizing);
        syncFormula(formula, sizing);
        nodes.preview.innerHTML = `<strong>${sizing.explanation}</strong><span class="dough-sizing-helper">Stima ingredienti: ${formula.flour_weight_g.toFixed(0)} g farina · ${formula.water_weight_g.toFixed(0)} g acqua · ${formula.salt_weight_g.toFixed(1)} g sale. Il lievito verrà corretto con orario e temperatura reali.</span>`;
      } catch (error) {
        nodes.preview.innerHTML = `<span class="error">${error.message}</span>`;
      }
    }
    function prepareFlourFromSizing() {
      const sizing = calculateSizing();
      latestSizing = sizing;
      if (sizing.shape === engine.SHAPES.MANUAL) return sizing;
      const formula = formulaEstimate(sizing);
      syncFormula(formula, sizing);
      return sizing;
    }
    function attachSizingToGeneratedPlan(sizing) {
      if (typeof plan === "undefined" || !plan || typeof workflow === "undefined" || !workflow) return;
      const actualTotal = Number(plan.flour_weight_g || 0) + Number(plan.water_weight_g || 0) + Number(plan.salt_weight_g || 0) + Number(plan.yeast_weight_g || 0);
      const snapshot = {
        ...sizing,
        calculated_dough_weight_g: Math.round(actualTotal * 10) / 10,
        calculated_portion_weight_g: sizing.count ? Math.round(actualTotal / sizing.count * 10) / 10 : null,
        formula_snapshot: {
          flour_weight_g: plan.flour_weight_g, water_weight_g: plan.water_weight_g, salt_weight_g: plan.salt_weight_g,
          yeast_weight_g: plan.yeast_weight_g, hydration_percent: plan.hydration_percent
        }
      };
      plan.dough_shape = sizing.shape;
      plan.portion_count = sizing.count;
      plan.portion_weight_g = snapshot.calculated_portion_weight_g;
      plan.dough_total_weight_g = snapshot.calculated_dough_weight_g;
      plan.tray_width_cm = sizing.geometry.width_cm;
      plan.tray_length_cm = sizing.geometry.length_cm;
      plan.round_diameter_cm = sizing.geometry.diameter_cm;
      plan.dough_loading_g_cm2 = sizing.loading_g_cm2;
      plan.sizing_profile = sizing.profile;
      workflow.context = workflow.context || {};
      workflow.context.dough_sizing = snapshot;
      plan.workflow_definition = workflow;

      let totalMetric = document.querySelector("#doughTotalMetric");
      if (!totalMetric) {
        totalMetric = document.createElement("div"); totalMetric.className = "metric"; totalMetric.innerHTML = 'Impasto totale<strong id="doughTotalValue"></strong>';
        document.querySelector("#proposal .metrics")?.insertAdjacentElement("afterbegin", totalMetric);
      }
      let portionMetric = document.querySelector("#portionMetric");
      if (!portionMetric) {
        portionMetric = document.createElement("div"); portionMetric.className = "metric"; portionMetric.id = "portionMetric"; portionMetric.innerHTML = 'Panetti<strong id="portionValue"></strong>';
        totalMetric.insertAdjacentElement("afterend", portionMetric);
      }
      totalMetric.id = "doughTotalMetric";
      document.querySelector("#doughTotalValue").textContent = `${snapshot.calculated_dough_weight_g.toFixed(0)} g`;
      document.querySelector("#portionValue").textContent = sizing.count ? `${sizing.count} × ${snapshot.calculated_portion_weight_g.toFixed(0)} g` : "—";
      const summary = document.querySelector("#summary");
      if (summary && sizing.shape !== engine.SHAPES.MANUAL) summary.textContent = `${sizing.explanation} ${summary.textContent}`;
    }

    generateButton.onclick = () => {
      try {
        const sizing = prepareFlourFromSizing();
        if (typeof invalidateProposal === "function") invalidateProposal();
        originalGenerate.call(generateButton);
        attachSizingToGeneratedPlan(sizing);
      } catch (error) {
        if (typeof msg === "function") msg(error.message, "error");
      }
    };

    if (resetButton && typeof originalReset === "function") resetButton.onclick = () => {
      originalReset.call(resetButton);
      setDefaultValues();
    };

    styleSelect.addEventListener("change", () => {
      setDefaultValues();
      if (typeof invalidateProposal === "function") invalidateProposal("Formato modificato. Genera nuovamente la proposta.");
    });
    nodes.profile.addEventListener("change", () => { syncLoadingFromProfile(); updatePreview(); if (typeof invalidateProposal === "function") invalidateProposal("Spessore modificato. Genera nuovamente la proposta."); });
    nodes.loading.addEventListener("input", () => { nodes.profile.value = "custom"; updatePreview(); if (typeof invalidateProposal === "function") invalidateProposal("Carico impasto modificato. Genera nuovamente la proposta."); });
    [nodes.count,nodes.width,nodes.length,nodes.diameter].forEach(input => input.addEventListener("input", () => { updatePreview(); if (typeof invalidateProposal === "function") invalidateProposal("Formato o quantità modificati. Genera nuovamente la proposta."); }));
    [document.querySelector("#targetMeal"),document.querySelector("#yeastType")].forEach(input => input?.addEventListener("change", () => { updatePreview(); if (typeof invalidateProposal === "function") invalidateProposal("Orario o lievito modificato. Genera nuovamente la proposta."); }));
    document.querySelector("#environmentProfile")?.addEventListener("change", updatePreview);

    setDefaultValues();
    window.CucinaHubDoughSizingWizard = { calculateSizing, prepareFlourFromSizing, updatePreview, fields: sizingFields };
  }

  if (path.endsWith("/fermentation/baking-wizard.html")) initWizard().catch(error => console.error("Calcolo formato non disponibile:", error));
  else if (path.endsWith("/fermentation/baking-sessions.html")) initSessionsSupport();
})();
