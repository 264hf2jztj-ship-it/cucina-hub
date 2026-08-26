(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CucinaHubDashboardCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SLOT_LABELS = Object.freeze({
    breakfast: "Colazione",
    morning_snack: "Spuntino mattina",
    lunch: "Pranzo",
    afternoon_snack: "Spuntino pomeriggio",
    dinner: "Cena",
    other: "Pasto"
  });

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

  function recipeMap(recipes = []) {
    return new Map(recipes.map(recipe => [recipe.id, recipe]));
  }

  function mealTitle(meal = {}, recipes = new Map()) {
    const recipe = recipes.get(meal.recipe_id);
    if (recipe) return [recipe.code, recipe.title].filter(Boolean).join(" — ") || "Pasto pianificato";
    const labels = (meal.planned_meal_items || [])
      .slice()
      .sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
      .map(item => item.label || item.recipe_code)
      .filter(Boolean);
    return labels.length ? labels.join(" · ") : "Pasto pianificato";
  }

  function eventTimestamp(date, time, fallback = "23:59") {
    const value = new Date(`${date}T${String(time || fallback).slice(0, 5)}:00`);
    return Number.isNaN(value.getTime()) ? Number.POSITIVE_INFINITY : value.getTime();
  }

  function plannerHref(section, week, date) {
    const parameters = new URLSearchParams({ v: "14", section, week });
    if (date) parameters.set("date", date);
    return `planner/workspace.html?${parameters.toString()}`;
  }

  function agendaItems({ meals = [], tasks = [], recipes = [], now = new Date(), limit = 6 } = {}) {
    const today = dateValue(now);
    const weekEnd = addDays(today, 7);
    const recipesById = recipeMap(recipes);
    const mealItems = meals
      .filter(meal => meal.planned_date >= today && meal.planned_date <= weekEnd)
      .filter(meal => !meal.planned_time || eventTimestamp(meal.planned_date, meal.planned_time) >= now.getTime())
      .map(meal => ({
        id: `meal:${meal.id}`,
        kind: "meal",
        icon: "🍽️",
        label: SLOT_LABELS[meal.meal_slot] || SLOT_LABELS.other,
        title: mealTitle(meal, recipesById),
        date: meal.planned_date,
        time: meal.planned_time || null,
        overdue: false,
        href: plannerHref("meal-plan", meal.planned_date, meal.planned_date)
      }));
    const taskItems = tasks
      .filter(task => task.status !== "done" && task.scheduled_date <= weekEnd)
      .map(task => ({
        id: `prep:${task.id}`,
        kind: "prep",
        icon: "🧰",
        label: "Meal Prep",
        title: task.title || "Preparazione pianificata",
        date: task.scheduled_date,
        time: task.scheduled_time || null,
        overdue: task.scheduled_date < today,
        href: plannerHref("meal-prep", task.scheduled_date)
      }));
    return [...mealItems, ...taskItems]
      .sort((left, right) => eventTimestamp(left.date, left.time) - eventTimestamp(right.date, right.time))
      .slice(0, limit);
  }

  function summary({ meals = [], tasks = [], shopping = [], notifications = [], recipes = [], now = new Date() } = {}) {
    const today = dateValue(now);
    const recipesById = recipeMap(recipes);
    const upcomingMeals = meals
      .filter(meal => meal.planned_date >= today)
      .filter(meal => !meal.planned_time || eventTimestamp(meal.planned_date, meal.planned_time) >= now.getTime())
      .slice()
      .sort((left, right) => eventTimestamp(left.planned_date, left.planned_time) - eventTimestamp(right.planned_date, right.planned_time));
    const unfinishedTasks = tasks.filter(task => task.status !== "done");
    return {
      today,
      weekStart: mondayFor(today),
      todayMeals: meals.filter(meal => meal.planned_date === today).length,
      prepDue: unfinishedTasks.filter(task => task.scheduled_date <= today).length,
      shoppingOpen: shopping.filter(item => !item.is_checked && !item.is_excluded).length,
      notificationsUnread: notifications.filter(item => item.due && item.unread && item.status !== "dismissed").length,
      nextMeal: upcomingMeals[0]
        ? { ...upcomingMeals[0], title: mealTitle(upcomingMeals[0], recipesById) }
        : null,
      agenda: agendaItems({ meals, tasks: unfinishedTasks, recipes, now })
    };
  }

  return { SLOT_LABELS, dateValue, addDays, mondayFor, mealTitle, plannerHref, agendaItems, summary };
});
