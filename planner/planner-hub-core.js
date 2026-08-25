(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CucinaHubPlannerHubCore = api;
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

  function mealLabel(meal = {}, recipes = new Map()) {
    const recipe = recipes.get(meal.recipe_id);
    if (recipe) return [recipe.code, recipe.title].filter(Boolean).join(" — ") || "Ricetta";
    const items = Array.isArray(meal.planned_meal_items) ? meal.planned_meal_items : [];
    const labels = items
      .slice()
      .sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
      .map(item => item.label || item.recipe_code)
      .filter(Boolean);
    if (!labels.length) return "Pasto pianificato";
    return labels.length > 2 ? `${labels.slice(0, 2).join(" · ")} +${labels.length - 2}` : labels.join(" · ");
  }

  function mealsByDate(meals = []) {
    const grouped = new Map();
    meals.forEach(meal => {
      if (!grouped.has(meal.planned_date)) grouped.set(meal.planned_date, []);
      grouped.get(meal.planned_date).push(meal);
    });
    for (const rows of grouped.values()) {
      rows.sort((left, right) => {
        const leftKey = `${left.planned_time || "99:99"}|${left.meal_slot || "other"}`;
        const rightKey = `${right.planned_time || "99:99"}|${right.meal_slot || "other"}`;
        return leftKey.localeCompare(rightKey);
      });
    }
    return grouped;
  }

  function moduleHref(section, week, extra = {}) {
    const params = new URLSearchParams({ v: "14", section });
    if (week) params.set("week", week);
    Object.entries(extra).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return `workspace.html?${params.toString()}`;
  }

  function counts({ meals = [], tasks = [], shopping = [], packages = [] } = {}) {
    return {
      meals: meals.length,
      prep: tasks.length,
      prepTodo: tasks.filter(task => task.status !== "done").length,
      shopping: shopping.filter(item => !item.is_checked && !item.is_excluded).length,
      packages: packages.filter(item => item.status === "pending").length
    };
  }

  return { SLOT_LABELS, mealLabel, mealsByDate, moduleHref, counts };
});
