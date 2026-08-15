const CONTRACT = "cucina-hub.menu-plan";
const VERSION = 1;
const MEAL_SLOTS = new Set([
  "breakfast",
  "morning_snack",
  "lunch",
  "afternoon_snack",
  "dinner",
  "other",
]);
const ITEM_TYPES = new Set(["recipe", "food", "preparation"]);
const SOURCE_TYPES = new Set(["chatgpt_project", "manual", "other"]);
const STANDARD_UNITS = Object.freeze({
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "l",
  piece: "piece",
  slice: "slice",
  portion: "portion",
});
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function issue(code, path, message) {
  return { code, path, message };
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validateAllowedFields(value, path, allowedFields, errors) {
  if (!isPlainObject(value)) return;
  const allowed = new Set(allowedFields);
  for (const field of Object.keys(value)) {
    if (allowed.has(field)) continue;
    errors.push(issue(
      field === "owner_user_id" ? "owner_user_id_forbidden" : "unexpected_field",
      path === "$" ? field : `${path}.${field}`,
      field === "owner_user_id"
        ? "owner_user_id viene derivato dal JWT e non deve essere presente nel payload."
        : `Il campo ${field} non appartiene al contratto versione 1.`,
    ));
  }
}

function validateOptionalText(value, path, errors, maxLength) {
  if (value === undefined || value === null) return;
  if (typeof value !== "string" || value.trim().length > maxLength) {
    errors.push(issue("invalid_text", path, `Il testo deve avere al massimo ${maxLength} caratteri.`));
  }
}

function validateQuantityAndUnit(value, path, errors) {
  const hasQuantity = value.quantity !== undefined && value.quantity !== null;
  const unitProvided = value.unit !== undefined && value.unit !== null;
  const hasUnit = unitProvided && typeof value.unit === "string" && cleanText(value.unit) !== "";

  if (hasQuantity && (typeof value.quantity !== "number" || !Number.isFinite(value.quantity) || value.quantity <= 0)) {
    errors.push(issue("invalid_quantity", `${path}.quantity`, "La quantità deve essere un numero positivo."));
  }
  if (hasQuantity && !hasUnit) {
    errors.push(issue("missing_unit", `${path}.unit`, "L’unità è obbligatoria quando è presente una quantità."));
  }
  if (unitProvided && (!hasUnit || cleanText(value.unit).length > 40)) {
    errors.push(issue("invalid_unit", `${path}.unit`, "L’unità deve essere un testo non vuoto di massimo 40 caratteri."));
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

function isRfc3339(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  return isRealDate(value.slice(0, 10)) && !Number.isNaN(Date.parse(value));
}

function validateItem(item, path, errors, warnings) {
  if (!isPlainObject(item)) {
    errors.push(issue("invalid_item", path, "Ogni elemento del pasto deve essere un oggetto."));
    return;
  }

  const itemKey = cleanText(item.key);
  const itemType = cleanText(item.type);
  if (!itemKey) errors.push(issue("missing_item_key", `${path}.key`, "item.key è obbligatorio."));
  else if (itemKey.length > 200) errors.push(issue("invalid_item_key", `${path}.key`, "item.key può contenere al massimo 200 caratteri."));

  if (!ITEM_TYPES.has(itemType)) {
    errors.push(issue("unsupported_item_type", `${path}.type`, "Il tipo deve essere recipe, food oppure preparation."));
    return;
  }

  const allowedByType = {
    recipe: ["key", "type", "recipe_code", "label", "quantity", "unit", "ingredients", "procedure"],
    food: ["key", "type", "label", "quantity", "unit", "note"],
    preparation: ["key", "type", "label", "quantity", "unit", "ingredients", "procedure", "note"],
  };
  validateAllowedFields(item, path, allowedByType[itemType], errors);
  validateOptionalText(item.note, `${path}.note`, errors, 2000);

  if (itemType === "recipe") {
    if (!cleanText(item.recipe_code)) {
      errors.push(issue("missing_recipe_code", `${path}.recipe_code`, "Gli item recipe richiedono recipe_code."));
    } else if (item.recipe_code.trim().length > 120) {
      errors.push(issue("invalid_recipe_code", `${path}.recipe_code`, "recipe_code può contenere al massimo 120 caratteri."));
    }
    if (Object.prototype.hasOwnProperty.call(item, "ingredients")) {
      errors.push(issue("recipe_embeds_ingredients", `${path}.ingredients`, "Un item recipe non può duplicare gli ingredienti della Biblioteca."));
    }
    if (Object.prototype.hasOwnProperty.call(item, "procedure")) {
      errors.push(issue("recipe_embeds_procedure", `${path}.procedure`, "Un item recipe non può duplicare il procedimento della Biblioteca."));
    }
    if (Object.prototype.hasOwnProperty.call(item, "quantity") || Object.prototype.hasOwnProperty.call(item, "unit")) {
      errors.push(issue("recipe_embeds_quantity", path, "Le quantità degli ingredienti restano nella Biblioteca."));
    }
    validateOptionalText(item.label, `${path}.label`, errors, 240);
    return;
  }

  if (!cleanText(item.label)) {
    errors.push(issue("missing_item_label", `${path}.label`, `Gli item ${itemType} richiedono label.`));
  } else if (item.label.trim().length > 240) {
    errors.push(issue("invalid_item_label", `${path}.label`, "La label può contenere al massimo 240 caratteri."));
  }
  validateQuantityAndUnit(item, path, errors);

  if (itemType === "food") return;

  if (item.ingredients !== undefined && item.ingredients !== null) {
    if (!Array.isArray(item.ingredients)) {
      errors.push(issue("invalid_ingredients", `${path}.ingredients`, "ingredients deve essere un array."));
    } else {
      item.ingredients.forEach((ingredient, ingredientIndex) => {
        const ingredientPath = `${path}.ingredients[${ingredientIndex}]`;
        if (!isPlainObject(ingredient)) {
          errors.push(issue("invalid_ingredient", ingredientPath, "Ogni ingrediente deve essere un oggetto."));
          return;
        }
        validateAllowedFields(ingredient, ingredientPath, ["name", "quantity", "unit"], errors);
        if (!cleanText(ingredient.name)) {
          errors.push(issue("missing_ingredient_name", `${ingredientPath}.name`, "Il nome dell’ingrediente è obbligatorio."));
        } else if (ingredient.name.trim().length > 240) {
          errors.push(issue("invalid_ingredient_name", `${ingredientPath}.name`, "Il nome può contenere al massimo 240 caratteri."));
        }
        validateQuantityAndUnit(ingredient, ingredientPath, errors);
      });
    }
  }

  if (item.procedure !== undefined && item.procedure !== null) {
    if (!Array.isArray(item.procedure)) {
      errors.push(issue("invalid_procedure", `${path}.procedure`, "procedure deve essere un array ordinato di stringhe."));
    } else {
      item.procedure.forEach((step, stepIndex) => {
        if (typeof step !== "string" || !step.trim()) {
          errors.push(issue("invalid_procedure_step", `${path}.procedure[${stepIndex}]`, "Ogni passaggio deve essere una stringa non vuota."));
        }
      });
    }
  }

  if ((!Array.isArray(item.ingredients) || item.ingredients.length === 0)
    && (!Array.isArray(item.procedure) || item.procedure.length === 0)) {
    warnings.push(issue("empty_preparation_details", path, "La preparazione non contiene ingredienti né procedimento."));
  }
}

function summarize(packet) {
  const summary = { days: 0, meals: 0, items: 0, recipes: 0, foods: 0, preparations: 0 };
  const days = Array.isArray(packet?.days) ? packet.days : [];
  summary.days = days.length;
  for (const day of days) {
    const meals = Array.isArray(day?.meals) ? day.meals : [];
    summary.meals += meals.length;
    for (const meal of meals) {
      const items = Array.isArray(meal?.items) ? meal.items : [];
      summary.items += items.length;
      for (const item of items) {
        if (item?.type === "recipe") summary.recipes += 1;
        if (item?.type === "food") summary.foods += 1;
        if (item?.type === "preparation") summary.preparations += 1;
      }
    }
  }
  return summary;
}

function normalizeUnit(value) {
  const normalized = cleanText(value);
  if (!normalized) return normalized;
  return STANDARD_UNITS[normalized.toLocaleLowerCase("it-IT")] ?? normalized;
}

function normalizePacketUnits(packet) {
  if (!isPlainObject(packet)) return packet;
  const normalized = JSON.parse(JSON.stringify(packet));
  for (const day of Array.isArray(normalized.days) ? normalized.days : []) {
    for (const meal of Array.isArray(day?.meals) ? day.meals : []) {
      for (const item of Array.isArray(meal?.items) ? meal.items : []) {
        if (Object.prototype.hasOwnProperty.call(item ?? {}, "unit") && item.unit !== null) {
          item.unit = normalizeUnit(item.unit);
        }
        for (const ingredient of Array.isArray(item?.ingredients) ? item.ingredients : []) {
          if (Object.prototype.hasOwnProperty.call(ingredient ?? {}, "unit") && ingredient.unit !== null) {
            ingredient.unit = normalizeUnit(ingredient.unit);
          }
        }
      }
    }
  }
  return normalized;
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
  const canonicalPayload = canonicalStringify(normalizePacketUnits(packet));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalPayload));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validatePacket(packet) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(packet)) {
    return { valid: false, errors: [issue("invalid_root", "$", "Il pacchetto deve essere un oggetto JSON.")], warnings };
  }

  validateAllowedFields(packet, "$", ["contract", "version", "menu", "days", "guardrails"], errors);
  if (packet.contract !== CONTRACT) errors.push(issue("unsupported_contract", "contract", `Il contratto richiesto è ${CONTRACT}.`));
  if (packet.version !== VERSION) errors.push(issue("unsupported_version", "version", `La versione supportata è ${VERSION}.`));

  if (!isPlainObject(packet.guardrails)) {
    errors.push(issue("missing_guardrails", "guardrails", "I guardrail obbligatori non sono presenti."));
  } else {
    validateAllowedFields(packet.guardrails, "guardrails", ["preview_only", "automatic_save", "requires_user_confirmation"], errors);
    if (packet.guardrails.preview_only !== true) errors.push(issue("guardrail_preview_only", "guardrails.preview_only", "preview_only deve essere true."));
    if (packet.guardrails.automatic_save !== false) errors.push(issue("guardrail_automatic_save", "guardrails.automatic_save", "automatic_save deve essere false."));
    if (packet.guardrails.requires_user_confirmation !== true) {
      errors.push(issue("guardrail_user_confirmation", "guardrails.requires_user_confirmation", "requires_user_confirmation deve essere true."));
    }
  }

  let periodStart = null;
  let periodEnd = null;
  if (!isPlainObject(packet.menu)) {
    errors.push(issue("missing_menu", "menu", "L’oggetto menu è obbligatorio."));
  } else {
    const menu = packet.menu;
    validateAllowedFields(menu, "menu", ["external_id", "revision", "title", "period_start", "period_end", "source"], errors);
    if (!cleanText(menu.external_id)) errors.push(issue("missing_external_id", "menu.external_id", "menu.external_id è obbligatorio."));
    else if (menu.external_id.trim().length > 160) errors.push(issue("invalid_external_id", "menu.external_id", "external_id può contenere al massimo 160 caratteri."));
    if (!Number.isInteger(menu.revision) || menu.revision < 1) errors.push(issue("invalid_revision", "menu.revision", "menu.revision deve essere un intero positivo."));
    validateOptionalText(menu.title, "menu.title", errors, 240);

    if (!isRealDate(menu.period_start)) errors.push(issue("invalid_period_start", "menu.period_start", "period_start deve essere una data reale YYYY-MM-DD."));
    else periodStart = menu.period_start;
    if (!isRealDate(menu.period_end)) errors.push(issue("invalid_period_end", "menu.period_end", "period_end deve essere una data reale YYYY-MM-DD."));
    else periodEnd = menu.period_end;
    if (periodStart && periodEnd && periodEnd < periodStart) errors.push(issue("invalid_period", "menu.period_end", "period_end non può precedere period_start."));

    if (!isPlainObject(menu.source)) {
      errors.push(issue("missing_source", "menu.source", "La provenienza del menu è obbligatoria."));
    } else {
      validateAllowedFields(menu.source, "menu.source", ["type", "label", "generated_at"], errors);
      if (!SOURCE_TYPES.has(menu.source.type)) errors.push(issue("unsupported_source_type", "menu.source.type", "source.type non è supportato."));
      if (!cleanText(menu.source.label)) errors.push(issue("missing_source_label", "menu.source.label", "source.label è obbligatorio."));
      else if (menu.source.label.trim().length > 200) errors.push(issue("invalid_source_label", "menu.source.label", "source.label può contenere al massimo 200 caratteri."));
      if (menu.source.generated_at !== undefined && menu.source.generated_at !== null && !isRfc3339(menu.source.generated_at)) {
        errors.push(issue("invalid_generated_at", "menu.source.generated_at", "generated_at deve essere un timestamp RFC 3339."));
      }
    }
  }

  if (!Array.isArray(packet.days)) {
    errors.push(issue("invalid_days", "days", "days deve essere un array."));
  } else {
    const seenDates = new Set();
    const seenMealKeys = new Set();
    packet.days.forEach((day, dayIndex) => {
      const dayPath = `days[${dayIndex}]`;
      if (!isPlainObject(day)) {
        errors.push(issue("invalid_day", dayPath, "Ogni giorno deve essere un oggetto."));
        return;
      }
      validateAllowedFields(day, dayPath, ["date", "meals"], errors);
      if (!isRealDate(day.date)) errors.push(issue("invalid_day_date", `${dayPath}.date`, "La data del giorno deve essere reale e usare YYYY-MM-DD."));
      else {
        if (seenDates.has(day.date)) errors.push(issue("duplicate_day_date", `${dayPath}.date`, `La data ${day.date} è duplicata.`));
        seenDates.add(day.date);
        if (periodStart && periodEnd && (day.date < periodStart || day.date > periodEnd)) {
          errors.push(issue("day_outside_period", `${dayPath}.date`, `La data ${day.date} è fuori dal periodo dichiarato.`));
        }
      }

      if (!Array.isArray(day.meals)) {
        errors.push(issue("invalid_meals", `${dayPath}.meals`, "meals deve essere un array."));
        return;
      }
      day.meals.forEach((meal, mealIndex) => {
        const mealPath = `${dayPath}.meals[${mealIndex}]`;
        if (!isPlainObject(meal)) {
          errors.push(issue("invalid_meal", mealPath, "Ogni pasto deve essere un oggetto."));
          return;
        }
        validateAllowedFields(meal, mealPath, ["key", "slot", "time", "servings", "note", "items"], errors);
        const mealKey = cleanText(meal.key);
        if (!mealKey) errors.push(issue("missing_meal_key", `${mealPath}.key`, "meal.key è obbligatorio."));
        else if (mealKey.length > 200) errors.push(issue("invalid_meal_key", `${mealPath}.key`, "meal.key può contenere al massimo 200 caratteri."));
        else if (seenMealKeys.has(mealKey)) errors.push(issue("duplicate_meal_key", `${mealPath}.key`, `meal.key ${mealKey} è duplicato nel pacchetto.`));
        else seenMealKeys.add(mealKey);

        if (!MEAL_SLOTS.has(meal.slot)) errors.push(issue("unsupported_meal_slot", `${mealPath}.slot`, "La fascia del pasto non è supportata."));
        if (meal.time !== undefined && meal.time !== null && !TIME_PATTERN.test(meal.time)) errors.push(issue("invalid_meal_time", `${mealPath}.time`, "L’orario deve usare HH:MM."));
        if (meal.servings !== undefined && meal.servings !== null
          && (!Number.isInteger(meal.servings) || meal.servings < 1 || meal.servings > 50)) {
          errors.push(issue("invalid_servings", `${mealPath}.servings`, "Le porzioni devono essere un intero tra 1 e 50."));
        }
        validateOptionalText(meal.note, `${mealPath}.note`, errors, 1000);

        if (!Array.isArray(meal.items) || meal.items.length === 0) {
          errors.push(issue("empty_meal_items", `${mealPath}.items`, "items deve essere un array non vuoto."));
          return;
        }
        const seenItemKeys = new Set();
        meal.items.forEach((item, itemIndex) => {
          const itemPath = `${mealPath}.items[${itemIndex}]`;
          const itemKey = isPlainObject(item) ? cleanText(item.key) : "";
          if (itemKey && seenItemKeys.has(itemKey)) errors.push(issue("duplicate_item_key", `${itemPath}.key`, `item.key ${itemKey} è duplicato nello stesso pasto.`));
          if (itemKey) seenItemKeys.add(itemKey);
          validateItem(item, itemPath, errors, warnings);
        });
      });
    });
  }

  const normalizedPacket = normalizePacketUnits(packet);
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalizedPacket,
    summary: summarize(normalizedPacket),
  };
}

export {
  CONTRACT,
  VERSION,
  canonicalStringify,
  computePayloadHash,
  normalizePacketUnits,
  summarize,
  validatePacket,
};
