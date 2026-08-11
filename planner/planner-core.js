"use strict";

(() => {
  const MEAL_SLOTS = Object.freeze({
    breakfast: Object.freeze({ label: "Colazione", icon: "☀️", order: 10 }),
    morning_snack: Object.freeze({ label: "Spuntino mattina", icon: "🍎", order: 20 }),
    lunch: Object.freeze({ label: "Pranzo", icon: "🍽️", order: 30 }),
    afternoon_snack: Object.freeze({ label: "Spuntino pomeriggio", icon: "🥛", order: 40 }),
    dinner: Object.freeze({ label: "Cena", icon: "🌙", order: 50 }),
    other: Object.freeze({ label: "Altro", icon: "📌", order: 60 })
  });

  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

  function isRealDate(value) {
    if (!DATE_PATTERN.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year
      && date.getMonth() === month - 1
      && date.getDate() === day;
  }

  function normalizeTime(value) {
    const time = String(value ?? "").trim();
    if (!time) return null;
    return TIME_PATTERN.test(time) ? time.slice(0, 5) : null;
  }

  function normalizeEntry(input = {}) {
    const recipeId = String(input.recipe_id ?? "").trim();
    const plannedDate = String(input.planned_date ?? "").trim();
    const mealSlot = String(input.meal_slot ?? "").trim();
    const rawTime = String(input.planned_time ?? "").trim();
    const plannedTime = normalizeTime(rawTime);
    const rawServings = String(input.servings ?? "").trim();
    const servings = rawServings ? Number(rawServings) : null;
    const note = String(input.note ?? "").trim() || null;
    const errors = [];

    if (!recipeId) errors.push("Seleziona una ricetta della Biblioteca.");
    if (!isRealDate(plannedDate)) errors.push("Scegli una data valida.");
    if (!MEAL_SLOTS[mealSlot]) errors.push("Scegli una fascia del pasto valida.");
    if (rawTime && plannedTime === null) errors.push("Inserisci un orario valido.");
    if (servings !== null && (!Number.isInteger(servings) || servings < 1 || servings > 50)) {
      errors.push("Le porzioni devono essere un numero intero tra 1 e 50.");
    }
    if (note && note.length > 1000) errors.push("La nota non può superare 1000 caratteri.");

    return {
      valid: errors.length === 0,
      errors,
      value: {
        recipe_id: recipeId,
        planned_date: plannedDate,
        meal_slot: mealSlot,
        planned_time: plannedTime,
        servings,
        note
      }
    };
  }

  function entrySortKey(entry = {}) {
    const slotOrder = MEAL_SLOTS[entry.meal_slot]?.order ?? 999;
    const time = normalizeTime(entry.planned_time) ?? "99:99";
    return [String(entry.planned_date ?? ""), String(slotOrder).padStart(3, "0"), time, String(entry.created_at ?? "")].join("|");
  }

  function sortEntries(entries = []) {
    return [...entries].sort((left, right) => entrySortKey(left).localeCompare(entrySortKey(right)));
  }

  function groupEntriesByDate(entries = []) {
    const groups = [];
    for (const entry of sortEntries(entries)) {
      const lastGroup = groups.at(-1);
      if (!lastGroup || lastGroup.date !== entry.planned_date) {
        groups.push({ date: entry.planned_date, entries: [entry] });
      } else {
        lastGroup.entries.push(entry);
      }
    }
    return groups;
  }

  function dateFromValue(value) {
    if (!isRealDate(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  }

  function addDays(value, amount) {
    const date = dateFromValue(value);
    if (!date || !Number.isInteger(amount)) return null;
    date.setDate(date.getDate() + amount);
    return localDateValue(date);
  }

  function startOfWeek(value) {
    const date = dateFromValue(value);
    if (!date) return null;
    const daysSinceMonday = (date.getDay() + 6) % 7;
    return addDays(value, -daysSinceMonday);
  }

  function weekForDate(value, entries = []) {
    const startDate = startOfWeek(value);
    if (!startDate) {
      return { startDate: null, endDate: null, days: [], entries: [] };
    }

    const endDate = addDays(startDate, 6);
    const weekEntries = sortEntries(entries).filter(entry => (
      entry.planned_date >= startDate && entry.planned_date <= endDate
    ));
    const entriesByDate = new Map();

    for (const entry of weekEntries) {
      const dayEntries = entriesByDate.get(entry.planned_date) ?? [];
      dayEntries.push(entry);
      entriesByDate.set(entry.planned_date, dayEntries);
    }

    return {
      startDate,
      endDate,
      days: Array.from({ length: 7 }, (_, index) => {
        const date = addDays(startDate, index);
        return { date, entries: entriesByDate.get(date) ?? [] };
      }),
      entries: weekEntries
    };
  }

  function localDateValue(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const api = Object.freeze({
    MEAL_SLOTS,
    addDays,
    groupEntriesByDate,
    isRealDate,
    localDateValue,
    normalizeEntry,
    normalizeTime,
    startOfWeek,
    sortEntries,
    weekForDate
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.CucinaHubPlannerCore = api;
})();
