"use strict";

(() => {
  const TASK_TYPES = Object.freeze({
    prepare: Object.freeze({ label: "Preparare", icon: "🔪", order: 10 }),
    cook: Object.freeze({ label: "Cuocere", icon: "🔥", order: 20 }),
    portion: Object.freeze({ label: "Porzionare", icon: "⚖️", order: 30 }),
    store: Object.freeze({ label: "Conservare", icon: "🫙", order: 40 }),
    defrost: Object.freeze({ label: "Scongelare", icon: "❄️", order: 50 }),
    other: Object.freeze({ label: "Altro", icon: "📌", order: 60 })
  });

  const STORAGE_METHODS = Object.freeze({
    none: Object.freeze({ label: "Nessuna conservazione", icon: "—" }),
    refrigerator: Object.freeze({ label: "Frigorifero", icon: "🧊" }),
    freezer: Object.freeze({ label: "Freezer", icon: "❄️" }),
    room_temperature: Object.freeze({ label: "Temperatura ambiente", icon: "🏠" }),
    other: Object.freeze({ label: "Altro", icon: "📦" })
  });

  const TASK_STATUSES = Object.freeze({
    todo: Object.freeze({ label: "Da fare", order: 10 }),
    in_progress: Object.freeze({ label: "In corso", order: 20 }),
    done: Object.freeze({ label: "Completata", order: 30 })
  });

  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

  function isRealDate(value) {
    const raw = String(value ?? "");
    if (!DATE_PATTERN.test(raw)) return false;
    const [year, month, day] = raw.split("-").map(Number);
    const date = new Date(year, month - 1, day, 12);
    return date.getFullYear() === year
      && date.getMonth() === month - 1
      && date.getDate() === day;
  }

  function normalizeTime(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    return TIME_PATTERN.test(raw) ? raw.slice(0, 5) : null;
  }

  function nullableNumber(value) {
    const raw = String(value ?? "").trim().replace(",", ".");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  function cleanText(value) {
    return String(value ?? "").trim() || null;
  }

  function normalizeTask(input = {}, linkedMeal = null) {
    const plannedMealId = String(input.planned_meal_id ?? "").trim();
    const plannedMealItemId = cleanText(input.planned_meal_item_id);
    const taskType = String(input.task_type ?? "prepare").trim();
    const title = String(input.title ?? "").trim();
    const scheduledDate = String(input.scheduled_date ?? "").trim();
    const rawTime = String(input.scheduled_time ?? "").trim();
    const scheduledTime = normalizeTime(rawTime);
    const rawServings = String(input.servings ?? "").trim();
    const servings = rawServings ? Number(rawServings) : null;
    const quantity = nullableNumber(input.quantity);
    const unit = cleanText(input.unit);
    const storageMethod = String(input.storage_method ?? "none").trim();
    const storageNote = cleanText(input.storage_note);
    const note = cleanText(input.note);
    const status = String(input.status ?? "todo").trim();
    const errors = [];

    if (!plannedMealId) errors.push("Scegli il pasto da preparare.");
    if (!TASK_TYPES[taskType]) errors.push("Scegli un tipo di attività valido.");
    if (!title) errors.push("Inserisci il nome dell’attività.");
    if (title.length > 200) errors.push("Il nome non può superare 200 caratteri.");
    if (!isRealDate(scheduledDate)) errors.push("Scegli una data di preparazione valida.");
    if (rawTime && scheduledTime === null) errors.push("Inserisci un orario valido.");
    if (servings !== null && (!Number.isInteger(servings) || servings < 1 || servings > 50)) {
      errors.push("Le porzioni devono essere un numero intero tra 1 e 50.");
    }
    if (Number.isNaN(quantity) || (quantity !== null && quantity <= 0)) {
      errors.push("La quantità deve essere un numero maggiore di zero.");
    }
    if ((quantity === null) !== (unit === null)) {
      errors.push("Quantità e unità devono essere compilate insieme.");
    }
    if (unit && unit.length > 40) errors.push("L’unità non può superare 40 caratteri.");
    if (!STORAGE_METHODS[storageMethod]) errors.push("Scegli una conservazione valida.");
    if (!TASK_STATUSES[status]) errors.push("Lo stato dell’attività non è valido.");
    if (storageNote && storageNote.length > 500) {
      errors.push("La nota di conservazione non può superare 500 caratteri.");
    }
    if (note && note.length > 2000) errors.push("La nota non può superare 2000 caratteri.");

    if (linkedMeal) {
      if (String(linkedMeal.id ?? "") !== plannedMealId) {
        errors.push("Il pasto collegato non corrisponde alla selezione.");
      }
      if (isRealDate(scheduledDate)
          && isRealDate(linkedMeal.planned_date)
          && scheduledDate > linkedMeal.planned_date) {
        errors.push("La preparazione non può essere successiva al pasto.");
      }
      if (plannedMealItemId) {
        const items = Array.isArray(linkedMeal.planned_meal_items)
          ? linkedMeal.planned_meal_items
          : [];
        if (!items.some(item => String(item.id) === plannedMealItemId)) {
          errors.push("L’elemento scelto non appartiene al pasto.");
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      value: {
        planned_meal_id: plannedMealId,
        planned_meal_item_id: plannedMealItemId,
        task_type: taskType,
        title,
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        servings,
        quantity,
        unit,
        storage_method: storageMethod,
        storage_note: storageNote,
        note,
        status
      }
    };
  }

  function taskSortKey(task = {}) {
    const statusOrder = TASK_STATUSES[task.status]?.order ?? 999;
    const time = normalizeTime(task.scheduled_time) ?? "99:99";
    const typeOrder = TASK_TYPES[task.task_type]?.order ?? 999;
    return [
      String(task.scheduled_date ?? ""),
      String(statusOrder).padStart(3, "0"),
      time,
      String(typeOrder).padStart(3, "0"),
      String(task.title ?? ""),
      String(task.created_at ?? "")
    ].join("|");
  }

  function sortTasks(tasks = []) {
    return [...tasks].sort((left, right) => taskSortKey(left).localeCompare(taskSortKey(right)));
  }

  function groupTasksByDate(tasks = []) {
    const groups = [];
    for (const task of sortTasks(tasks)) {
      const last = groups[groups.length - 1];
      if (!last || last.date !== task.scheduled_date) {
        groups.push({ date: task.scheduled_date, tasks: [task] });
      } else {
        last.tasks.push(task);
      }
    }
    return groups;
  }

  function summarizeTasks(tasks = []) {
    return tasks.reduce((summary, task) => {
      if (Object.prototype.hasOwnProperty.call(summary, task.status)) summary[task.status] += 1;
      summary.total += 1;
      return summary;
    }, { total: 0, todo: 0, in_progress: 0, done: 0 });
  }

  function localDateValue(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDays(value, amount) {
    if (!isRealDate(value) || !Number.isInteger(amount)) return null;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day, 12);
    date.setDate(date.getDate() + amount);
    return localDateValue(date);
  }

  function defaultScheduledDate(meal) {
    return isRealDate(meal?.planned_date) ? addDays(meal.planned_date, -1) : localDateValue();
  }

  const api = Object.freeze({
    STORAGE_METHODS,
    TASK_STATUSES,
    TASK_TYPES,
    defaultScheduledDate,
    groupTasksByDate,
    normalizeTask,
    normalizeTime,
    sortTasks,
    summarizeTasks
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.CucinaHubMealPrepCore = api;
})();
