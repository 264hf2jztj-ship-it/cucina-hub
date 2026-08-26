(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CucinaHubAnalyticsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SLOT_LABELS = Object.freeze({
    breakfast: "Colazione",
    morning_snack: "Spuntino mattina",
    lunch: "Pranzo",
    afternoon_snack: "Spuntino pomeriggio",
    dinner: "Cena",
    other: "Altro"
  });
  const PREP_LABELS = Object.freeze({ todo: "Da fare", in_progress: "In corso", done: "Completate" });

  function dateValue(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDays(value, amount) {
    const date = new Date(`${value}T12:00:00`);
    date.setDate(date.getDate() + amount);
    return dateValue(date);
  }

  function mondayFor(value) {
    const date = new Date(`${value}T12:00:00`);
    const weekday = date.getDay() || 7;
    date.setDate(date.getDate() - weekday + 1);
    return dateValue(date);
  }

  function datePart(value) {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : dateValue(date);
  }

  function periodRange(days = 90, now = new Date()) {
    const safeDays = [30, 90, 365].includes(Number(days)) ? Number(days) : 90;
    const end = dateValue(now);
    const start = addDays(end, -(safeDays - 1));
    const previousEnd = addDays(start, -1);
    return { days: safeDays, start, end, previousStart: addDays(previousEnd, -(safeDays - 1)), previousEnd };
  }

  function inRange(value, start, end) {
    const date = datePart(value);
    return Boolean(date && date >= start && date <= end);
  }

  function countBy(items, key, labels = {}) {
    const counts = new Map();
    items.forEach(item => {
      const value = item[key] || "other";
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    return [...counts.entries()]
      .map(([value, count]) => ({ value, label: labels[value] || value, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "it"));
  }

  function weeklySeries({ start, end, meals = [], prep = [], sessions = [] } = {}) {
    const weeks = [];
    let cursor = mondayFor(start);
    while (cursor <= end) {
      weeks.push({ weekStart: cursor, meals: 0, prep: 0, sessions: 0 });
      cursor = addDays(cursor, 7);
    }
    const byWeek = new Map(weeks.map(item => [item.weekStart, item]));
    const increment = (items, dateKey, metric) => items.forEach(item => {
      const date = datePart(item[dateKey]);
      if (!date || date < start || date > end) return;
      const week = byWeek.get(mondayFor(date));
      if (week) week[metric] += 1;
    });
    increment(meals, "planned_date", "meals");
    increment(prep, "scheduled_date", "prep");
    increment(sessions.filter(item => item.status === "completed"), "completed_at", "sessions");
    return weeks;
  }

  function delta(current, previous) {
    if (!previous) return current ? { value: null, label: "nessun dato nel periodo precedente" } : { value: 0, label: "invariato" };
    const value = Math.round((current - previous) / previous * 100);
    return { value, label: value === 0 ? "invariato" : `${value > 0 ? "+" : ""}${value}% rispetto al periodo precedente` };
  }

  function summary({ days = 90, now = new Date(), meals = [], prep = [], sessions = [], recipes = [] } = {}) {
    const range = periodRange(days, now);
    const currentMeals = meals.filter(item => inRange(item.planned_date, range.start, range.end));
    const previousMeals = meals.filter(item => inRange(item.planned_date, range.previousStart, range.previousEnd));
    const currentPrep = prep.filter(item => inRange(item.scheduled_date, range.start, range.end));
    const previousPrep = prep.filter(item => inRange(item.scheduled_date, range.previousStart, range.previousEnd));
    const currentSessions = sessions.filter(item => item.status === "completed" && inRange(item.completed_at, range.start, range.end));
    const previousSessions = sessions.filter(item => item.status === "completed" && inRange(item.completed_at, range.previousStart, range.previousEnd));
    const currentRecipes = recipes.filter(item => inRange(item.created_at, range.start, range.end));
    const previousRecipes = recipes.filter(item => inRange(item.created_at, range.previousStart, range.previousEnd));
    const completedPrep = currentPrep.filter(item => item.status === "done").length;
    const activeDates = new Set([
      ...currentMeals.map(item => datePart(item.planned_date)),
      ...currentPrep.map(item => datePart(item.scheduled_date)),
      ...currentSessions.map(item => datePart(item.completed_at)),
      ...currentRecipes.map(item => datePart(item.created_at))
    ].filter(Boolean));

    return {
      range,
      metrics: {
        meals: { value: currentMeals.length, trend: delta(currentMeals.length, previousMeals.length) },
        prepCompleted: { value: completedPrep, total: currentPrep.length, rate: currentPrep.length ? Math.round(completedPrep / currentPrep.length * 100) : 0, trend: delta(completedPrep, previousPrep.filter(item => item.status === "done").length) },
        sessions: { value: currentSessions.length, trend: delta(currentSessions.length, previousSessions.length) },
        recipes: { value: currentRecipes.length, trend: delta(currentRecipes.length, previousRecipes.length) }
      },
      library: {
        totalRecipes: recipes.filter(item => item.status !== "archived").length,
        certifiedRecipes: recipes.filter(item => item.status === "certified").length,
        activeDays: activeDates.size
      },
      weekly: weeklySeries({ start: range.start, end: range.end, meals: currentMeals, prep: currentPrep, sessions: currentSessions }),
      mealSlots: countBy(currentMeals, "meal_slot", SLOT_LABELS),
      prepStatuses: countBy(currentPrep, "status", PREP_LABELS)
    };
  }

  return { SLOT_LABELS, PREP_LABELS, dateValue, addDays, mondayFor, datePart, periodRange, inRange, countBy, weeklySeries, delta, summary };
});
