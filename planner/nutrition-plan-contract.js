"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CucinaHubNutritionPlanContract = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const CONTRACT = "cucina-hub.nutrition-plan";
  const VERSION = 1;
  const DAY_TYPES = Object.freeze(["miletto", "freeletics", "rest", "other"]);
  const MEAL_SLOTS = Object.freeze([
    "breakfast",
    "morning_snack",
    "lunch",
    "pre_workout",
    "post_workout",
    "afternoon_snack",
    "dinner",
    "other"
  ]);
  const SOURCE_TYPES = Object.freeze(["chatgpt_project", "manual", "other"]);
  const SHOPPING_CATEGORIES = Object.freeze([
    "proteins",
    "carbohydrates",
    "fruit",
    "vegetables",
    "dairy",
    "fats_extras",
    "other"
  ]);
  const STANDARD_UNITS = Object.freeze({
    g: "g",
    kg: "kg",
    ml: "ml",
    l: "l",
    piece: "piece",
    slice: "slice",
    portion: "portion"
  });
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

  function issue(code, path, message, severity = "error") {
    return { code, path, message, severity };
  }

  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value ?? {}, key);
  }

  function validateAllowedFields(value, path, allowedFields, errors) {
    if (!isPlainObject(value)) return;
    const allowed = new Set(allowedFields);
    Object.keys(value).forEach(field => {
      if (allowed.has(field)) return;
      errors.push(issue(
        field === "owner_user_id" ? "owner_user_id_forbidden" : "unexpected_field",
        path === "$" ? field : `${path}.${field}`,
        field === "owner_user_id"
          ? "owner_user_id viene derivato dall'identità autenticata e non deve essere presente nel pacchetto."
          : `Il campo ${field} non appartiene al contratto versione 1.`
      ));
    });
  }

  function validateRequiredText(value, path, errors, maxLength) {
    const normalized = text(value);
    if (!normalized) errors.push(issue("missing_text", path, "Il testo è obbligatorio."));
    else if (normalized.length > maxLength) errors.push(issue("invalid_text", path, `Il testo può contenere al massimo ${maxLength} caratteri.`));
  }

  function validateOptionalText(value, path, errors, maxLength) {
    if (value === undefined || value === null) return;
    if (typeof value !== "string" || value.trim().length > maxLength) {
      errors.push(issue("invalid_text", path, `Il testo deve contenere al massimo ${maxLength} caratteri.`));
    }
  }

  function isRealDate(value) {
    if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day;
  }

  function dateFromValue(value) {
    return new Date(`${value}T12:00:00Z`);
  }

  function addDays(value, amount) {
    const date = dateFromValue(value);
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  }

  function isMonday(value) {
    return isRealDate(value) && dateFromValue(value).getUTCDay() === 1;
  }

  function isRfc3339(value) {
    if (typeof value !== "string" || !value.trim()) return false;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
    return isRealDate(value.slice(0, 10)) && !Number.isNaN(Date.parse(value));
  }

  function validateNumber(value, path, errors, { minimum, maximum, optional = false } = {}) {
    if ((value === undefined || value === null) && optional) return;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push(issue("invalid_number", path, "Il valore deve essere un numero finito."));
      return;
    }
    if (value < minimum || value > maximum) {
      errors.push(issue("number_out_of_range", path, `Il valore deve essere compreso tra ${minimum} e ${maximum}.`));
    }
  }

  function validateQuantity(value, path, errors) {
    const hasQuantity = hasOwn(value, "quantity") && value.quantity !== null;
    const hasUnit = hasOwn(value, "unit") && text(value.unit) !== "";
    if (hasQuantity && (typeof value.quantity !== "number" || !Number.isFinite(value.quantity) || value.quantity <= 0)) {
      errors.push(issue("invalid_quantity", `${path}.quantity`, "La quantità deve essere un numero positivo."));
    }
    if (hasQuantity && !hasUnit) errors.push(issue("missing_unit", `${path}.unit`, "L'unità è obbligatoria quando è presente una quantità."));
    if (hasOwn(value, "unit") && value.unit !== null && (!hasUnit || text(value.unit).length > 40)) {
      errors.push(issue("invalid_unit", `${path}.unit`, "L'unità deve essere un testo non vuoto di massimo 40 caratteri."));
    }
  }

  function validateRecipeRef(value, path, errors) {
    if (value === undefined || value === null) return;
    if (!isPlainObject(value)) {
      errors.push(issue("invalid_recipe_ref", path, "recipe_ref deve essere un oggetto oppure null."));
      return;
    }
    validateAllowedFields(value, path, ["code"], errors);
    validateRequiredText(value.code, `${path}.code`, errors, 120);
  }

  function validateComponent(value, path, errors) {
    if (!isPlainObject(value)) {
      errors.push(issue("invalid_component", path, "Ogni componente deve essere un oggetto."));
      return;
    }
    validateAllowedFields(value, path, ["name", "quantity", "unit", "note"], errors);
    validateRequiredText(value.name, `${path}.name`, errors, 240);
    validateQuantity(value, path, errors);
    validateOptionalText(value.note, `${path}.note`, errors, 500);
  }

  function validateAlternative(value, path, errors) {
    if (!isPlainObject(value)) {
      errors.push(issue("invalid_alternative", path, "Ogni alternativa deve essere un oggetto."));
      return;
    }
    validateAllowedFields(value, path, ["label", "components", "recipe_ref", "note"], errors);
    validateRequiredText(value.label, `${path}.label`, errors, 240);
    validateRecipeRef(value.recipe_ref, `${path}.recipe_ref`, errors);
    validateOptionalText(value.note, `${path}.note`, errors, 1000);
    if (!Array.isArray(value.components)) {
      errors.push(issue("invalid_components", `${path}.components`, "components deve essere un array."));
    } else {
      value.components.forEach((component, index) => validateComponent(component, `${path}.components[${index}]`, errors));
    }
    if ((!Array.isArray(value.components) || value.components.length === 0) && !isPlainObject(value.recipe_ref)) {
      errors.push(issue("empty_alternative", path, "Un'alternativa richiede almeno un componente oppure recipe_ref."));
    }
  }

  function validateMeal(value, path, errors, seenMealKeys) {
    if (!isPlainObject(value)) {
      errors.push(issue("invalid_meal", path, "Ogni pasto deve essere un oggetto."));
      return;
    }
    validateAllowedFields(value, path, ["key", "slot", "title", "time", "components", "recipe_ref", "alternatives", "note"], errors);
    const mealKey = text(value.key);
    validateRequiredText(value.key, `${path}.key`, errors, 200);
    if (mealKey && seenMealKeys.has(mealKey)) errors.push(issue("duplicate_meal_key", `${path}.key`, `meal.key ${mealKey} è duplicato nel pacchetto.`));
    if (mealKey) seenMealKeys.add(mealKey);
    if (!MEAL_SLOTS.includes(value.slot)) errors.push(issue("unsupported_meal_slot", `${path}.slot`, "La fascia del pasto non è supportata."));
    validateRequiredText(value.title, `${path}.title`, errors, 240);
    if (value.time !== undefined && value.time !== null && !TIME_PATTERN.test(value.time)) {
      errors.push(issue("invalid_meal_time", `${path}.time`, "L'orario deve usare HH:MM."));
    }
    validateRecipeRef(value.recipe_ref, `${path}.recipe_ref`, errors);
    validateOptionalText(value.note, `${path}.note`, errors, 1000);
    if (!Array.isArray(value.components)) {
      errors.push(issue("invalid_components", `${path}.components`, "components deve essere un array."));
    } else {
      value.components.forEach((component, index) => validateComponent(component, `${path}.components[${index}]`, errors));
    }
    if ((!Array.isArray(value.components) || value.components.length === 0) && !isPlainObject(value.recipe_ref)) {
      errors.push(issue("empty_meal", path, "Un pasto richiede almeno un componente oppure recipe_ref."));
    }
    if (value.alternatives !== undefined && !Array.isArray(value.alternatives)) {
      errors.push(issue("invalid_alternatives", `${path}.alternatives`, "alternatives deve essere un array."));
    } else {
      (value.alternatives || []).forEach((alternative, index) => validateAlternative(alternative, `${path}.alternatives[${index}]`, errors));
    }
  }

  function validateTraining(value, dayType, path, errors) {
    if (dayType === "rest") {
      if (value !== undefined && value !== null) errors.push(issue("rest_day_has_training", path, "Un giorno rest non può contenere un allenamento."));
      return;
    }
    if (value === undefined || value === null) {
      if (["miletto", "freeletics"].includes(dayType)) errors.push(issue("missing_training", path, "I giorni Miletto e Freeletics richiedono i dati dell'allenamento."));
      return;
    }
    if (!isPlainObject(value)) {
      errors.push(issue("invalid_training", path, "training deve essere un oggetto oppure null."));
      return;
    }
    validateAllowedFields(value, path, ["name", "start_time", "note"], errors);
    validateRequiredText(value.name, `${path}.name`, errors, 240);
    if (value.start_time !== undefined && value.start_time !== null && !TIME_PATTERN.test(value.start_time)) {
      errors.push(issue("invalid_training_time", `${path}.start_time`, "L'orario deve usare HH:MM."));
    }
    validateOptionalText(value.note, `${path}.note`, errors, 1000);
  }

  function validateAlcohol(value, path, errors) {
    if (value === undefined || value === null) return;
    if (!isPlainObject(value)) {
      errors.push(issue("invalid_alcohol", path, "alcohol deve essere un oggetto oppure null."));
      return;
    }
    validateAllowedFields(value, path, ["label", "quantity", "unit", "note"], errors);
    validateRequiredText(value.label, `${path}.label`, errors, 240);
    validateQuantity(value, path, errors);
    validateOptionalText(value.note, `${path}.note`, errors, 500);
  }

  function validateShoppingList(value, errors, warnings) {
    if (!isPlainObject(value)) {
      errors.push(issue("missing_shopping_list", "shopping_list", "shopping_list è obbligatorio."));
      return;
    }
    validateAllowedFields(value, "shopping_list", ["categories"], errors);
    if (!Array.isArray(value.categories)) {
      errors.push(issue("invalid_shopping_categories", "shopping_list.categories", "categories deve essere un array."));
      return;
    }
    const seenCategories = new Set();
    const seenItems = new Map();
    value.categories.forEach((category, categoryIndex) => {
      const path = `shopping_list.categories[${categoryIndex}]`;
      if (!isPlainObject(category)) {
        errors.push(issue("invalid_shopping_category", path, "Ogni categoria deve essere un oggetto."));
        return;
      }
      validateAllowedFields(category, path, ["key", "label", "items"], errors);
      if (!SHOPPING_CATEGORIES.includes(category.key)) errors.push(issue("unsupported_shopping_category", `${path}.key`, "La categoria della spesa non è supportata."));
      if (seenCategories.has(category.key)) errors.push(issue("duplicate_shopping_category", `${path}.key`, `La categoria ${category.key} è duplicata.`));
      seenCategories.add(category.key);
      validateRequiredText(category.label, `${path}.label`, errors, 120);
      if (!Array.isArray(category.items)) {
        errors.push(issue("invalid_shopping_items", `${path}.items`, "items deve essere un array."));
        return;
      }
      category.items.forEach((item, itemIndex) => {
        const itemPath = `${path}.items[${itemIndex}]`;
        validateComponent(item, itemPath, errors);
        if (!isPlainObject(item) || !text(item.name)) return;
        const normalizedName = text(item.name).toLocaleLowerCase("it-IT");
        if (seenItems.has(normalizedName)) {
          warnings.push(issue("duplicate_shopping_item", itemPath, `${item.name} compare più volte nella lista della spesa.`, "warning"));
        } else {
          seenItems.set(normalizedName, itemPath);
        }
      });
    });
  }

  function normalizeUnit(value) {
    const normalized = text(value);
    if (!normalized) return normalized;
    return STANDARD_UNITS[normalized.toLocaleLowerCase("it-IT")] ?? normalized;
  }

  function normalizePacket(packet) {
    if (!isPlainObject(packet)) return packet;
    const normalized = JSON.parse(JSON.stringify(packet));
    (Array.isArray(normalized.days) ? normalized.days : []).forEach(day => {
      (Array.isArray(day?.meals) ? day.meals : []).forEach(meal => {
        (Array.isArray(meal?.components) ? meal.components : []).forEach(component => {
          if (hasOwn(component, "unit") && component.unit !== null) component.unit = normalizeUnit(component.unit);
        });
        (Array.isArray(meal?.alternatives) ? meal.alternatives : []).forEach(alternative => {
          (Array.isArray(alternative?.components) ? alternative.components : []).forEach(component => {
            if (hasOwn(component, "unit") && component.unit !== null) component.unit = normalizeUnit(component.unit);
          });
        });
      });
      if (isPlainObject(day.alcohol) && hasOwn(day.alcohol, "unit") && day.alcohol.unit !== null) {
        day.alcohol.unit = normalizeUnit(day.alcohol.unit);
      }
    });
    (Array.isArray(normalized.shopping_list?.categories) ? normalized.shopping_list.categories : []).forEach(category => {
      (Array.isArray(category?.items) ? category.items : []).forEach(item => {
        if (hasOwn(item, "unit") && item.unit !== null) item.unit = normalizeUnit(item.unit);
      });
    });
    return normalized;
  }

  function summarize(packet) {
    const summary = { days: 0, workouts: 0, meals: 0, recipe_references: 0, components: 0, alternatives: 0, shopping_items: 0 };
    const days = Array.isArray(packet?.days) ? packet.days : [];
    summary.days = days.length;
    days.forEach(day => {
      if (isPlainObject(day?.training)) summary.workouts += 1;
      (Array.isArray(day?.meals) ? day.meals : []).forEach(meal => {
        summary.meals += 1;
        if (isPlainObject(meal?.recipe_ref)) summary.recipe_references += 1;
        summary.components += Array.isArray(meal?.components) ? meal.components.length : 0;
        summary.alternatives += Array.isArray(meal?.alternatives) ? meal.alternatives.length : 0;
      });
    });
    (Array.isArray(packet?.shopping_list?.categories) ? packet.shopping_list.categories : []).forEach(category => {
      summary.shopping_items += Array.isArray(category?.items) ? category.items.length : 0;
    });
    return summary;
  }

  function sortJsonValue(value) {
    if (Array.isArray(value)) return value.map(sortJsonValue);
    if (!isPlainObject(value)) return value;
    return Object.keys(value).sort().reduce((sorted, key) => {
      sorted[key] = sortJsonValue(value[key]);
      return sorted;
    }, Object.create(null));
  }

  function canonicalStringify(value) {
    return JSON.stringify(sortJsonValue(JSON.parse(JSON.stringify(value))));
  }

  async function computePayloadHash(packet) {
    const canonicalPayload = canonicalStringify(normalizePacket(packet));
    if (globalThis.crypto?.subtle && typeof globalThis.TextEncoder === "function") {
      const digest = await globalThis.crypto.subtle.digest("SHA-256", new globalThis.TextEncoder().encode(canonicalPayload));
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    }
    if (typeof require === "function") {
      const { createHash } = require("node:crypto");
      return createHash("sha256").update(canonicalPayload, "utf8").digest("hex");
    }
    throw issue("hash_unavailable", "$", "SHA-256 non è disponibile in questo ambiente.");
  }

  function validatePacket(packet) {
    const errors = [];
    const warnings = [];
    if (!isPlainObject(packet)) {
      return { valid: false, errors: [issue("invalid_root", "$", "Il pacchetto deve essere un oggetto JSON.")], warnings };
    }
    validateAllowedFields(packet, "$", ["contract", "version", "plan", "check_in", "goal", "days", "shopping_list", "publication"], errors);
    if (packet.contract !== CONTRACT) errors.push(issue("unsupported_contract", "contract", `Il contratto richiesto è ${CONTRACT}.`));
    if (packet.version !== VERSION) errors.push(issue("unsupported_version", "version", `La versione supportata è ${VERSION}.`));

    let weekStart = null;
    let weekEnd = null;
    if (!isPlainObject(packet.plan)) {
      errors.push(issue("missing_plan", "plan", "L'oggetto plan è obbligatorio."));
    } else {
      validateAllowedFields(packet.plan, "plan", ["external_id", "revision", "title", "week_start", "week_end", "timezone", "source"], errors);
      validateRequiredText(packet.plan.external_id, "plan.external_id", errors, 160);
      if (!Number.isInteger(packet.plan.revision) || packet.plan.revision < 1) errors.push(issue("invalid_revision", "plan.revision", "revision deve essere un intero positivo."));
      validateOptionalText(packet.plan.title, "plan.title", errors, 240);
      if (!isRealDate(packet.plan.week_start)) errors.push(issue("invalid_week_start", "plan.week_start", "week_start deve essere una data reale YYYY-MM-DD."));
      else {
        weekStart = packet.plan.week_start;
        if (!isMonday(weekStart)) errors.push(issue("week_start_not_monday", "plan.week_start", "week_start deve essere un lunedì."));
      }
      if (!isRealDate(packet.plan.week_end)) errors.push(issue("invalid_week_end", "plan.week_end", "week_end deve essere una data reale YYYY-MM-DD."));
      else weekEnd = packet.plan.week_end;
      if (weekStart && weekEnd && weekEnd !== addDays(weekStart, 6)) errors.push(issue("invalid_week_range", "plan.week_end", "week_end deve essere la domenica successiva a week_start."));
      if (packet.plan.timezone !== "Europe/Rome") errors.push(issue("unsupported_timezone", "plan.timezone", "La versione 1 richiede timezone Europe/Rome."));
      if (!isPlainObject(packet.plan.source)) {
        errors.push(issue("missing_source", "plan.source", "La provenienza del piano è obbligatoria."));
      } else {
        validateAllowedFields(packet.plan.source, "plan.source", ["type", "label", "generated_at"], errors);
        if (!SOURCE_TYPES.includes(packet.plan.source.type)) errors.push(issue("unsupported_source_type", "plan.source.type", "source.type non è supportato."));
        validateRequiredText(packet.plan.source.label, "plan.source.label", errors, 200);
        if (!isRfc3339(packet.plan.source.generated_at)) errors.push(issue("invalid_generated_at", "plan.source.generated_at", "generated_at deve essere un timestamp RFC 3339."));
      }
    }

    if (!isPlainObject(packet.check_in)) {
      errors.push(issue("missing_check_in", "check_in", "check_in è obbligatorio."));
    } else {
      validateAllowedFields(packet.check_in, "check_in", ["measured_at", "weight_kg", "waist_cm", "body_fat_percent", "note"], errors);
      if (!isRealDate(packet.check_in.measured_at)) errors.push(issue("invalid_measurement_date", "check_in.measured_at", "measured_at deve essere una data reale YYYY-MM-DD."));
      validateNumber(packet.check_in.weight_kg, "check_in.weight_kg", errors, { minimum: 20, maximum: 400 });
      validateNumber(packet.check_in.waist_cm, "check_in.waist_cm", errors, { minimum: 30, maximum: 300 });
      validateNumber(packet.check_in.body_fat_percent, "check_in.body_fat_percent", errors, { minimum: 1, maximum: 75, optional: true });
      validateOptionalText(packet.check_in.note, "check_in.note", errors, 1000);
    }

    if (!isPlainObject(packet.goal)) {
      errors.push(issue("missing_goal", "goal", "goal è obbligatorio."));
    } else {
      validateAllowedFields(packet.goal, "goal", ["summary", "protein_target_g", "strategy"], errors);
      validateRequiredText(packet.goal.summary, "goal.summary", errors, 500);
      validateRequiredText(packet.goal.strategy, "goal.strategy", errors, 2000);
      if (!isPlainObject(packet.goal.protein_target_g)) {
        errors.push(issue("invalid_protein_target", "goal.protein_target_g", "protein_target_g deve essere un oggetto min/max."));
      } else {
        validateAllowedFields(packet.goal.protein_target_g, "goal.protein_target_g", ["min", "max"], errors);
        validateNumber(packet.goal.protein_target_g.min, "goal.protein_target_g.min", errors, { minimum: 1, maximum: 500 });
        validateNumber(packet.goal.protein_target_g.max, "goal.protein_target_g.max", errors, { minimum: 1, maximum: 500 });
        if (Number.isFinite(packet.goal.protein_target_g.min) && Number.isFinite(packet.goal.protein_target_g.max)
          && packet.goal.protein_target_g.max < packet.goal.protein_target_g.min) {
          errors.push(issue("invalid_protein_range", "goal.protein_target_g.max", "Il massimo proteico non può essere inferiore al minimo."));
        }
      }
    }

    if (!Array.isArray(packet.days)) {
      errors.push(issue("invalid_days", "days", "days deve essere un array."));
    } else {
      if (packet.days.length !== 7) errors.push(issue("invalid_day_count", "days", "Un piano settimanale deve contenere esattamente 7 giorni."));
      const seenDates = new Set();
      const seenMealKeys = new Set();
      packet.days.forEach((day, dayIndex) => {
        const path = `days[${dayIndex}]`;
        if (!isPlainObject(day)) {
          errors.push(issue("invalid_day", path, "Ogni giorno deve essere un oggetto."));
          return;
        }
        validateAllowedFields(day, path, ["date", "day_type", "training", "meals", "alcohol", "note"], errors);
        if (!isRealDate(day.date)) errors.push(issue("invalid_day_date", `${path}.date`, "La data del giorno deve essere reale e usare YYYY-MM-DD."));
        else {
          if (seenDates.has(day.date)) errors.push(issue("duplicate_day_date", `${path}.date`, `La data ${day.date} è duplicata.`));
          seenDates.add(day.date);
          if (weekStart && weekEnd && (day.date < weekStart || day.date > weekEnd)) errors.push(issue("day_outside_week", `${path}.date`, `La data ${day.date} è fuori dalla settimana dichiarata.`));
        }
        if (!DAY_TYPES.includes(day.day_type)) errors.push(issue("unsupported_day_type", `${path}.day_type`, "day_type non è supportato."));
        validateTraining(day.training, day.day_type, `${path}.training`, errors);
        validateAlcohol(day.alcohol, `${path}.alcohol`, errors);
        validateOptionalText(day.note, `${path}.note`, errors, 2000);
        if (!Array.isArray(day.meals) || day.meals.length === 0) {
          errors.push(issue("empty_day_meals", `${path}.meals`, "Ogni giorno deve contenere almeno un pasto."));
        } else {
          day.meals.forEach((meal, mealIndex) => validateMeal(meal, `${path}.meals[${mealIndex}]`, errors, seenMealKeys));
        }
      });
      if (weekStart && weekEnd) {
        for (let offset = 0; offset < 7; offset += 1) {
          const expectedDate = addDays(weekStart, offset);
          if (!seenDates.has(expectedDate)) errors.push(issue("missing_week_day", "days", `Manca il giorno ${expectedDate}.`));
        }
      }
    }

    validateShoppingList(packet.shopping_list, errors, warnings);

    if (!isPlainObject(packet.publication)) {
      errors.push(issue("missing_publication_policy", "publication", "La policy di pubblicazione è obbligatoria."));
    } else {
      validateAllowedFields(packet.publication, "publication", ["mode", "on_conflict", "preserve_current_on_error"], errors);
      if (packet.publication.mode !== "auto_if_conflict_free") errors.push(issue("invalid_publication_mode", "publication.mode", "mode deve essere auto_if_conflict_free."));
      if (packet.publication.on_conflict !== "require_confirmation") errors.push(issue("invalid_conflict_policy", "publication.on_conflict", "on_conflict deve essere require_confirmation."));
      if (packet.publication.preserve_current_on_error !== true) errors.push(issue("invalid_error_policy", "publication.preserve_current_on_error", "preserve_current_on_error deve essere true."));
    }

    const normalizedPacket = normalizePacket(packet);
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      normalizedPacket,
      summary: summarize(normalizedPacket)
    };
  }

  return Object.freeze({
    CONTRACT,
    VERSION,
    DAY_TYPES,
    MEAL_SLOTS,
    SHOPPING_CATEGORIES,
    canonicalStringify,
    computePayloadHash,
    normalizePacket,
    normalizeUnit,
    summarize,
    validatePacket
  });
});
