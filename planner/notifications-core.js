(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CucinaHubNotificationsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_PREFERENCES = Object.freeze({
    meals_enabled: true,
    meal_lead_minutes: 60,
    meal_prep_enabled: true,
    meal_prep_lead_minutes: 30,
    system_notifications_enabled: false,
    timezone: "Europe/Rome"
  });

  const MEAL_SLOT_LABELS = Object.freeze({
    breakfast: "Colazione",
    morning_snack: "Spuntino mattina",
    lunch: "Pranzo",
    afternoon_snack: "Spuntino pomeriggio",
    dinner: "Cena",
    other: "Altro"
  });

  function clampLead(value, fallback) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1440) return fallback;
    return parsed;
  }

  function normalizePreferences(value = {}) {
    return {
      meals_enabled: value.meals_enabled !== false,
      meal_lead_minutes: clampLead(value.meal_lead_minutes, DEFAULT_PREFERENCES.meal_lead_minutes),
      meal_prep_enabled: value.meal_prep_enabled !== false,
      meal_prep_lead_minutes: clampLead(value.meal_prep_lead_minutes, DEFAULT_PREFERENCES.meal_prep_lead_minutes),
      system_notifications_enabled: value.system_notifications_enabled === true,
      timezone: String(value.timezone || DEFAULT_PREFERENCES.timezone).slice(0, 100)
    };
  }

  function localDateTime(date, time) {
    if (!date || !time) return null;
    const normalizedTime = String(time).slice(0, 5);
    const value = new Date(`${date}T${normalizedTime}:00`);
    return Number.isNaN(value.getTime()) ? null : value;
  }

  function currentState(source, states = []) {
    const sourceType = source.source_type;
    const sourceId = source.source_id;
    const sourceUpdatedAt = new Date(source.source_updated_at || 0).getTime();
    const state = states.find(item => item.source_type === sourceType && item.source_id === sourceId);
    if (!state) return null;
    const stateSourceUpdatedAt = new Date(state.source_updated_at || 0).getTime();
    return stateSourceUpdatedAt === sourceUpdatedAt ? state : null;
  }

  function mealTitle(meal, recipeMap = new Map()) {
    const recipe = recipeMap.get(meal.recipe_id);
    if (recipe) return [recipe.code, recipe.title].filter(Boolean).join(" — ") || "Pasto pianificato";
    const items = Array.isArray(meal.planned_meal_items) ? meal.planned_meal_items : [];
    const labels = items
      .slice()
      .sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
      .map(item => item.label || item.recipe_code)
      .filter(Boolean);
    return labels.length ? labels.join(" · ") : "Pasto pianificato";
  }

  function sourceRows(meals = [], tasks = [], preferences = {}, recipeMap = new Map()) {
    const prefs = normalizePreferences(preferences);
    const rows = [];

    if (prefs.meals_enabled) {
      meals.forEach(meal => {
        const eventAt = localDateTime(meal.planned_date, meal.planned_time);
        if (!eventAt) return;
        rows.push({
          source_type: "planned_meal",
          source_id: meal.id,
          source_updated_at: meal.updated_at,
          title: mealTitle(meal, recipeMap),
          kind_label: MEAL_SLOT_LABELS[meal.meal_slot] || MEAL_SLOT_LABELS.other,
          event_at: eventAt,
          remind_at: new Date(eventAt.getTime() - prefs.meal_lead_minutes * 60000),
          lead_minutes: prefs.meal_lead_minutes,
          href: `workspace.html?v=14&section=meal-plan&week=${meal.planned_date}&date=${meal.planned_date}`
        });
      });
    }

    if (prefs.meal_prep_enabled) {
      tasks.forEach(task => {
        if (task.status === "done") return;
        const eventAt = localDateTime(task.scheduled_date, task.scheduled_time);
        if (!eventAt) return;
        rows.push({
          source_type: "meal_prep_task",
          source_id: task.id,
          source_updated_at: task.updated_at,
          title: task.title || "Attività Meal Prep",
          kind_label: "Meal Prep",
          event_at: eventAt,
          remind_at: new Date(eventAt.getTime() - prefs.meal_prep_lead_minutes * 60000),
          lead_minutes: prefs.meal_prep_lead_minutes,
          href: `workspace.html?v=14&section=meal-prep&week=${task.scheduled_date}`
        });
      });
    }

    return rows.sort((left, right) => left.remind_at - right.remind_at);
  }

  function buildNotifications({ meals = [], tasks = [], states = [], preferences = {}, recipes = [], now = new Date() } = {}) {
    const recipeMap = new Map(recipes.map(recipe => [recipe.id, recipe]));
    const start = now.getTime() - 24 * 60 * 60 * 1000;
    const end = now.getTime() + 14 * 24 * 60 * 60 * 1000;
    return sourceRows(meals, tasks, preferences, recipeMap)
      .filter(item => item.event_at.getTime() >= start && item.event_at.getTime() <= end)
      .map(item => {
        const state = currentState(item, states);
        const status = state?.status || "unread";
        const due = item.remind_at.getTime() <= now.getTime();
        return {
          ...item,
          status,
          due,
          state,
          unread: status === "unread",
          should_notify: due && status === "unread" && !state?.notified_at
        };
      });
  }

  function groupNotifications(items = []) {
    return {
      due: items.filter(item => item.due && item.status !== "dismissed"),
      upcoming: items.filter(item => !item.due && item.status !== "dismissed"),
      dismissed: items.filter(item => item.status === "dismissed")
    };
  }

  function unreadCount(items = []) {
    return items.filter(item => item.due && item.unread && item.status !== "dismissed").length;
  }

  function statePayload(item, status, now = new Date()) {
    const timestamp = now.toISOString();
    return {
      source_type: item.source_type,
      source_id: item.source_id,
      source_updated_at: item.source_updated_at,
      status,
      read_at: status === "read" ? timestamp : null,
      dismissed_at: status === "dismissed" ? timestamp : null
    };
  }

  function notificationBody(item) {
    const eventTime = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" }).format(item.event_at);
    return `${item.kind_label} alle ${eventTime} · ${item.title}`;
  }

  return {
    DEFAULT_PREFERENCES,
    normalizePreferences,
    localDateTime,
    buildNotifications,
    groupNotifications,
    unreadCount,
    statePayload,
    notificationBody
  };
});
