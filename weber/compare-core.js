"use strict";
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./diary-core.js"));
  else root.CucinaHubWeberCompare = factory(root.CucinaHubWeberDiaryCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (diary) {
  const MISSING = "Non registrato";
  const number = value => value == null || String(value).trim() === "" || typeof value === "boolean" || !Number.isFinite(Number(value)) ? null : Number(value);
  const text = value => value == null || String(value).trim() === "" ? null : String(value).trim();
  const fmt = value => value.toLocaleString("it-IT", { maximumFractionDigits: 2 });
  const FIELDS = [
    ["status", "Stato", diary.STATUS_LABELS], ["recipe_id", "Ricetta"],
    ["cooking_method", "Metodo", diary.METHOD_LABELS], ["fuel_type", "Combustibile", diary.FUEL_LABELS],
    ["fuel_amount", "Quantità combustibile", "fuel"], ["ignition_method", "Accensione"],
    ["vent_bottom_percent", "Presa inferiore iniziale", "%"], ["vent_top_percent", "Presa superiore iniziale", "%"],
    ["target_grate_temp_c", "Griglia obiettivo", "°C"], ["peak_grate_temp_c", "Griglia massima", "°C"],
    ["food_core_temp_c", "Cuore finale", "°C"], ["duration_minutes", "Durata", "min"],
    ["rating", "Valutazione", "/ 5"], ["result_notes", "Risultato osservato"], ["next_change", "Prossima modifica"]
  ];
  function rows(a, b) {
    return FIELDS.map(([key, label, kind]) => {
      const numeric = typeof kind === "string";
      const av = numeric ? number(a[key]) : text(a[key]);
      const bv = numeric ? number(b[key]) : text(b[key]);
      const display = (session, value) => {
        if (value === null) return MISSING;
        if (key === "recipe_id") return session.recipe ? [session.recipe.code, session.recipe.title].filter(Boolean).join(" · ") || "Ricetta collegata" : "Ricetta collegata (dettagli non disponibili)";
        if (kind === "fuel") return `${fmt(value)} ${diary.UNIT_LABELS[session.fuel_unit] || "(unità non registrata)"}`;
        return numeric ? `${fmt(value)} ${kind}` : kind ? kind[value] || value : value;
      };
      const missing = av === null || bv === null;
      const fuelMismatch = kind === "fuel" && (!a.fuel_unit || !b.fuel_unit || !a.fuel_type || !b.fuel_type || a.fuel_unit !== b.fuel_unit || a.fuel_type !== b.fuel_type);
      const different = !missing && (av !== bv || fuelMismatch);
      let delta = missing ? "Dati mancanti" : different ? "Diverso" : "Uguale";
      if (!missing && numeric) {
        if (fuelMismatch) delta = "Non confrontabile: unità o combustibile diversi/non registrati";
        else {
          const diff = Math.round((bv - av) * 100) / 100;
          const unit = kind === "fuel" ? diary.UNIT_LABELS[a.fuel_unit] : kind === "%" ? "punti percentuali" : kind === "/ 5" ? "punti" : kind;
          delta = `${diff > 0 ? "+" : ""}${fmt(diff)} ${unit}`;
        }
      }
      return { key, label, a: display(a, av), b: display(b, bv), delta, different, missing };
    });
  }
  function warnings(a, b) {
    const messages = ["Il confronto descrive differenze, non dimostra cause: un voto più alto non identifica da solo la modifica migliore."];
    if (a.status !== "completed" || b.status !== "completed") messages.push("Almeno una prova non è conclusa: tempi e risultati possono essere incompleti.");
    if (!a.recipe_id || !b.recipe_id) messages.push("Ricetta non collegata in almeno una prova: verifica che alimento e quantità siano comparabili.");
    else if (a.recipe_id !== b.recipe_id) messages.push("Le ricette collegate sono diverse: interpreta i risultati con cautela.");
    return messages;
  }
  return { MISSING, number, rows, warnings };
});
