"use strict";
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./diary-core.js"));
  else root.CucinaHubWeberLearning = factory(root.CucinaHubWeberDiaryCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (diary) {
  const NONE = "__none__";
  const number = value => value == null || String(value).trim() === "" || typeof value === "boolean" || !Number.isFinite(Number(value)) ? null : Number(value);
  const rating = row => { const value = number(row.rating); return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null; };
  const recipeLabel = row => row.recipe ? [row.recipe.code, row.recipe.title].filter(Boolean).join(" · ") || "Ricetta collegata" : row.recipe_id ? "Ricetta collegata (dettagli non disponibili)" : "Ricetta non collegata";
  const newest = (a, b) => (Date.parse(b.cooked_at) || 0) - (Date.parse(a.cooked_at) || 0) || String(a.id).localeCompare(String(b.id));
  const GAPS = [
    ["rating", "Valutazione", row => rating(row) === null],
    ["recipe_id", "Ricetta collegata", row => !row.recipe_id],
    ["target_grate_temp_c", "Temperatura griglia obiettivo", row => number(row.target_grate_temp_c) === null],
    ["peak_grate_temp_c", "Temperatura griglia massima", row => number(row.peak_grate_temp_c) === null],
    ["duration_minutes", "Durata", row => number(row.duration_minutes) === null],
    ["result_notes", "Risultato osservato", row => !String(row.result_notes || "").trim()]
  ];
  function filter(items, filters = {}) {
    return items.filter(row => (!filters.recipe || (row.recipe_id || NONE) === filters.recipe)
      && (!filters.method || row.cooking_method === filters.method)
      && (!filters.fuel || row.fuel_type === filters.fuel));
  }
  function analyze(items, filters = {}) {
    const selected = filter(items, filters);
    const completed = selected.filter(row => row.status === "completed").sort(newest);
    const rated = completed.filter(row => rating(row) !== null);
    const groups = new Map();
    for (const row of completed) {
      const key = JSON.stringify([row.recipe_id || `unlinked:${row.id}`, row.cooking_method || null, row.fuel_type || null]);
      if (!groups.has(key)) groups.set(key, { key, recipe: recipeLabel(row), method: diary.METHOD_LABELS[row.cooking_method] || "Metodo non registrato", fuel: diary.FUEL_LABELS[row.fuel_type] || "Combustibile non registrato", sessions: [] });
      groups.get(key).sessions.push(row);
    }
    const groupList = [...groups.values()].map(group => {
      const ratedRows = group.sessions.filter(row => rating(row) !== null);
      const highest = ratedRows.length ? Math.max(...ratedRows.map(rating)) : null;
      const best = highest === null ? [] : ratedRows.filter(row => rating(row) === highest);
      const first = group.sessions[0];
      return { ...group, rated: ratedRows.length, average: ratedRows.length ? ratedRows.reduce((sum, row) => sum + rating(row), 0) / ratedRows.length : null, highest, best,
        // Missing recipe or setup values do not establish a comparable group.
        pair: first.recipe_id && first.cooking_method && first.fuel_type && group.sessions.length >= 2 ? group.sessions.slice(0, 2).map(row => row.id) : null };
    }).sort((a, b) => `${a.recipe} ${a.method} ${a.fuel}`.localeCompare(`${b.recipe} ${b.method} ${b.fuel}`, "it"));
    return { total: selected.length, completed: completed.length, other: selected.length - completed.length, rated: rated.length,
      average: rated.length ? rated.reduce((sum, row) => sum + rating(row), 0) / rated.length : null,
      gaps: GAPS.map(([key, label, missing]) => ({ key, label, count: completed.filter(missing).length })),
      incomplete: completed.filter(row => GAPS.some(([, , missing]) => missing(row))).map(row => ({ ...row, missing: GAPS.filter(([, , missing]) => missing(row)).map(([, label]) => label) })),
      groups: groupList };
  }
  function setupLabel(row) {
    const value = (key, unit) => number(row[key]) === null ? "non registrata" : `${number(row[key]).toLocaleString("it-IT")} ${unit}`;
    return `Combustibile: ${value("fuel_amount", diary.UNIT_LABELS[row.fuel_unit] || "(unità non registrata)")}; griglia obiettivo: ${value("target_grate_temp_c", "°C")}; presa inferiore: ${value("vent_bottom_percent", "%")}; superiore: ${value("vent_top_percent", "%")}.`;
  }
  return { NONE, rating, recipeLabel, analyze, setupLabel };
});
