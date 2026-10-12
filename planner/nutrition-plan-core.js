"use strict";

(function (root, factory) {
  const contract = typeof module === "object" && module.exports
    ? require("./nutrition-plan-contract.js") : root.CucinaHubNutritionPlanContract;
  const api = factory(contract);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CucinaHubNutritionPlanCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (contract) {
  const SLOT_LABELS = Object.freeze({ breakfast: "Colazione", morning_snack: "Spuntino", lunch: "Pranzo", pre_workout: "Pre-workout", post_workout: "Post-workout", afternoon_snack: "Merenda", dinner: "Cena", other: "Altro" });
  const DAY_LABELS = Object.freeze({ miletto: "Miletto", freeletics: "Freeletics", rest: "Riposo", other: "Altro" });
  function today(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const get = type => parts.find(part => part.type === type).value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  function realDate(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      && !Number.isNaN(Date.parse(`${value}T12:00:00Z`))
      && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
  }
  function addDays(value, days) {
    const date = new Date(`${value}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }
  function monday(value = today()) {
    if (!realDate(value)) value = today();
    return addDays(value, -((new Date(`${value}T12:00:00Z`).getUTCDay() + 6) % 7));
  }
  function selectPlan(packages, rows, weekStart) {
    const sources = new Map(rows.map(row => [row.planner_menu_package_id, row]));
    const candidates = packages.filter(item => item.import_status === "confirmed"
      && item.period_start === weekStart && item.period_end === addDays(weekStart, 6)
      && sources.has(item.id));
    if (!candidates.length) return { status: "empty", packet: null };
    if (candidates.length > 1) return { status: "ambiguous", packet: null };
    const item = candidates[0];
    const result = contract.validatePacket(sources.get(item.id).source_payload);
    if (!result.valid || result.normalizedPacket.plan.week_start !== weekStart
        || result.normalizedPacket.plan.external_id !== item.source_external_id
        || result.normalizedPacket.plan.revision !== item.source_revision) {
      return { status: "invalid", packet: null };
    }
    return { status: "ready", packet: result.normalizedPacket, packageId: item.id };
  }
  function recipeHref(ref, recipes) {
    if (!ref) return null;
    const matches = recipes.filter(recipe => recipe.code?.trim().toUpperCase() === ref.code.trim().toUpperCase());
    return matches.length === 1 ? `../index.html?view=recipes&recipe=${encodeURIComponent(matches[0].id)}` : null;
  }
  function quantity(item) {
    const units = { piece: "pz", slice: "fette", portion: "porzioni" };
    return item.quantity != null ? `${new Intl.NumberFormat("it-IT").format(item.quantity)} ${units[item.unit] || item.unit || ""}`.trim() : "";
  }
  return Object.freeze({ SLOT_LABELS, DAY_LABELS, today, realDate, monday, addDays, selectPlan, recipeHref, quantity });
});
