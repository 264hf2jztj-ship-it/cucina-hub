(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CucinaHubCalendarCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MEAL_SLOT_LABELS = Object.freeze({
    breakfast: "Colazione",
    morning_snack: "Spuntino mattina",
    lunch: "Pranzo",
    afternoon_snack: "Spuntino pomeriggio",
    dinner: "Cena",
    other: "Altro"
  });

  function dateAtNoon(value) {
    if (value instanceof Date) {
      const copy = new Date(value);
      copy.setHours(12, 0, 0, 0);
      return copy;
    }
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function isoDate(date) {
    const value = dateAtNoon(date);
    if (!value) return "";
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function monthAnchor(value) {
    const date = dateAtNoon(value) || dateAtNoon(new Date());
    return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
  }

  function shiftMonth(value, amount) {
    const anchor = monthAnchor(value);
    return new Date(anchor.getFullYear(), anchor.getMonth() + Number(amount || 0), 1, 12, 0, 0, 0);
  }

  function mondayIndex(day) {
    return (day + 6) % 7;
  }

  function buildMonthCells(value) {
    const anchor = monthAnchor(value);
    const gridStart = new Date(anchor);
    gridStart.setDate(anchor.getDate() - mondayIndex(anchor.getDay()));
    const today = isoDate(new Date());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const dateIso = isoDate(date);
      return {
        date: dateIso,
        day: date.getDate(),
        inMonth: date.getMonth() === anchor.getMonth(),
        isToday: dateIso === today
      };
    });
  }

  function monthGridRange(value) {
    const cells = buildMonthCells(value);
    return { start: cells[0].date, end: cells[cells.length - 1].date };
  }

  function groupEvents(meals = [], tasks = []) {
    const grouped = new Map();
    const add = (date, event) => {
      if (!date) return;
      if (!grouped.has(date)) grouped.set(date, []);
      grouped.get(date).push(event);
    };

    meals.forEach(meal => add(meal.planned_date, {
      type: "meal",
      id: meal.id,
      date: meal.planned_date,
      time: meal.planned_time || null,
      slot: meal.meal_slot || "other",
      payload: meal
    }));

    tasks.forEach(task => add(task.scheduled_date, {
      type: "prep",
      id: task.id,
      date: task.scheduled_date,
      time: task.scheduled_time || null,
      status: task.status || "todo",
      payload: task
    }));

    for (const events of grouped.values()) {
      events.sort((left, right) => {
        const leftTime = left.time || (left.type === "meal" ? "23:00" : "22:00");
        const rightTime = right.time || (right.type === "meal" ? "23:00" : "22:00");
        return leftTime.localeCompare(rightTime) || left.type.localeCompare(right.type);
      });
    }
    return grouped;
  }

  function filterEvents(events = [], filter = "all") {
    if (filter === "meals") return events.filter(event => event.type === "meal");
    if (filter === "prep") return events.filter(event => event.type === "prep");
    return events.slice();
  }

  function mealSlotLabel(slot) {
    return MEAL_SLOT_LABELS[slot] || MEAL_SLOT_LABELS.other;
  }

  return {
    MEAL_SLOT_LABELS,
    isoDate,
    monthAnchor,
    shiftMonth,
    buildMonthCells,
    monthGridRange,
    groupEvents,
    filterEvents,
    mealSlotLabel
  };
});
