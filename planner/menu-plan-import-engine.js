"use strict";

(() => {
  const CONTRACT = "cucina-hub.menu-plan";
  const VERSION = 1;
  const MEAL_SLOTS = Object.freeze([
    "breakfast",
    "morning_snack",
    "lunch",
    "afternoon_snack",
    "dinner",
    "other"
  ]);
  const ITEM_TYPES = Object.freeze(["recipe", "food", "preparation"]);
  const SOURCE_TYPES = Object.freeze(["chatgpt_project", "manual", "other"]);
  const HUROM_STABLE_CODES = Object.freeze([
    "RC-001",
    "RC-002A",
    "RC-002B",
    "RC-003",
    "RC-004",
    "EXP-004",
    "EXP-007",
    "EXP-008"
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
  const MARKDOWN_JSON_BLOCK = /^\s*```json\s*\r?\n([\s\S]*?)\r?\n```\s*$/i;
  const ANY_CODE_FENCE = /```/;

  function issue(code, path, message, severity = "error", details = null) {
    return { code, path, message, severity, details };
  }

  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function validateAllowedFields(value, path, allowedFields, errors) {
    if (!isPlainObject(value)) return;
    const allowed = new Set(allowedFields);
    Object.keys(value).forEach(field => {
      if (allowed.has(field)) return;
      if (field === "owner_user_id") {
        errors.push(issue(
          "owner_user_id_forbidden",
          path === "$" ? field : `${path}.${field}`,
          "owner_user_id non deve essere fornito dal pacchetto."
        ));
        return;
      }
      errors.push(issue(
        "unexpected_field",
        path === "$" ? field : `${path}.${field}`,
        `Il campo ${field} non appartiene al contratto versione 1.`
      ));
    });
  }

  function normalizeUnit(value) {
    const normalized = text(value);
    if (!normalized) return normalized;
    return STANDARD_UNITS[normalized.toLocaleLowerCase("it-IT")] ?? normalized;
  }

  function normalizePacketUnits(packet) {
    if (!isPlainObject(packet)) return packet;
    const normalized = JSON.parse(JSON.stringify(packet));
    (Array.isArray(normalized.days) ? normalized.days : []).forEach(day => {
      (Array.isArray(day?.meals) ? day.meals : []).forEach(meal => {
        (Array.isArray(meal?.items) ? meal.items : []).forEach(item => {
          if (Object.prototype.hasOwnProperty.call(item ?? {}, "unit") && item.unit !== null) {
            item.unit = normalizeUnit(item.unit);
          }
          (Array.isArray(item?.ingredients) ? item.ingredients : []).forEach(ingredient => {
            if (Object.prototype.hasOwnProperty.call(ingredient ?? {}, "unit") && ingredient.unit !== null) {
              ingredient.unit = normalizeUnit(ingredient.unit);
            }
          });
        });
      });
    });
    return normalized;
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
    if (!isRealDate(value.slice(0, 10))) return false;
    return !Number.isNaN(Date.parse(value));
  }

  function parse(input) {
    if (isPlainObject(input)) return { packet: input, sourceFormat: "object" };
    if (typeof input !== "string") {
      throw issue("invalid_input", "$", "Incolla un JSON oppure seleziona un file JSON.");
    }

    const raw = input.replace(/^\uFEFF/, "").trim();
    if (!raw) throw issue("empty_input", "$", "Incolla il pacchetto menu da analizzare.");

    let jsonText = raw;
    let sourceFormat = "json";
    if (raw.startsWith("```")) {
      const fences = raw.match(/```/g) ?? [];
      const markdownMatch = raw.match(MARKDOWN_JSON_BLOCK);
      if (fences.length !== 2 || !markdownMatch) {
        throw issue(
          "invalid_markdown_wrapper",
          "$",
          "È ammesso soltanto JSON puro oppure un singolo blocco Markdown ```json … ``` senza testo esterno."
        );
      }
      jsonText = markdownMatch[1].trim();
      sourceFormat = "markdown_json";
    }

    try {
      const packet = JSON.parse(jsonText);
      if (!isPlainObject(packet)) {
        throw issue("invalid_root", "$", "Il pacchetto deve essere un oggetto JSON.");
      }
      return { packet, sourceFormat };
    } catch (error) {
      if (error?.code) throw error;
      if (ANY_CODE_FENCE.test(raw)) {
        throw issue(
          "invalid_markdown_wrapper",
          "$",
          "È ammesso soltanto JSON puro oppure un singolo blocco Markdown ```json … ``` senza testo esterno."
        );
      }
      throw issue("invalid_json", "$", "Il contenuto non è un JSON valido.", "error", {
        parser_message: error.message
      });
    }
  }

  function validateQuantityAndUnit(value, path, errors, { quantityOptional = true } = {}) {
    const hasQuantity = value.quantity !== undefined && value.quantity !== null;
    const unitProvided = value.unit !== undefined && value.unit !== null;
    const hasUnit = unitProvided && typeof value.unit === "string" && text(value.unit) !== "";

    if (!quantityOptional && !hasQuantity) {
      errors.push(issue("required_quantity", `${path}.quantity`, "La quantità è obbligatoria."));
    }
    if (hasQuantity && (typeof value.quantity !== "number" || !Number.isFinite(value.quantity) || value.quantity <= 0)) {
      errors.push(issue("invalid_quantity", `${path}.quantity`, "La quantità deve essere un numero positivo."));
    }
    if (hasQuantity && !hasUnit) {
      errors.push(issue("missing_unit", `${path}.unit`, "L'unità è obbligatoria quando è presente una quantità."));
    }
    if (unitProvided && (!hasUnit || text(value.unit).length > 40)) {
      errors.push(issue("invalid_unit", `${path}.unit`, "L'unità deve essere un testo non vuoto di massimo 40 caratteri."));
    }
  }

  function validateOptionalText(value, path, errors, maxLength) {
    if (value === undefined || value === null) return;
    if (typeof value !== "string" || value.trim().length > maxLength) {
      errors.push(issue("invalid_text", path, `Il testo deve avere al massimo ${maxLength} caratteri.`));
    }
  }

  function validateItem(item, path, errors, warnings) {
    if (!isPlainObject(item)) {
      errors.push(issue("invalid_item", path, "Ogni elemento del pasto deve essere un oggetto."));
      return;
    }

    const itemKey = text(item.key);
    const itemType = text(item.type);
    if (!itemKey) errors.push(issue("missing_item_key", `${path}.key`, "item.key è obbligatorio."));
    else if (itemKey.length > 200) errors.push(issue("invalid_item_key", `${path}.key`, "item.key può contenere al massimo 200 caratteri."));
    if (!ITEM_TYPES.includes(itemType)) {
      errors.push(issue("unsupported_item_type", `${path}.type`, "Il tipo deve essere recipe, food oppure preparation."));
      return;
    }

    const allowedByType = {
      recipe: ["key", "type", "recipe_code", "label", "quantity", "unit", "ingredients", "procedure"],
      food: ["key", "type", "label", "quantity", "unit", "note"],
      preparation: ["key", "type", "label", "quantity", "unit", "ingredients", "procedure", "note"]
    };
    validateAllowedFields(item, path, allowedByType[itemType], errors);

    validateOptionalText(item.note, `${path}.note`, errors, 2000);

    if (itemType === "recipe") {
      if (!text(item.recipe_code)) {
        errors.push(issue("missing_recipe_code", `${path}.recipe_code`, "Gli item recipe richiedono recipe_code."));
      } else if (item.recipe_code.trim().length > 120) {
        errors.push(issue("invalid_recipe_code", `${path}.recipe_code`, "recipe_code può contenere al massimo 120 caratteri."));
      }
      if (Object.prototype.hasOwnProperty.call(item, "ingredients")) {
        errors.push(issue(
          "recipe_embeds_ingredients",
          `${path}.ingredients`,
          "Una ricetta della Biblioteca non può duplicare gli ingredienti nel menu."
        ));
      }
      if (Object.prototype.hasOwnProperty.call(item, "procedure")) {
        errors.push(issue(
          "recipe_embeds_procedure",
          `${path}.procedure`,
          "Una ricetta della Biblioteca non può duplicare il procedimento nel menu."
        ));
      }
      if (Object.prototype.hasOwnProperty.call(item, "quantity") || Object.prototype.hasOwnProperty.call(item, "unit")) {
        errors.push(issue(
          "recipe_embeds_quantity",
          path,
          "Le quantità degli ingredienti non appartengono a un item recipe: restano nella Biblioteca."
        ));
      }
      validateOptionalText(item.label, `${path}.label`, errors, 240);
      return;
    }

    if (!text(item.label)) {
      errors.push(issue("missing_item_label", `${path}.label`, `Gli item ${itemType} richiedono label.`));
    } else if (item.label.trim().length > 240) {
      errors.push(issue("invalid_item_label", `${path}.label`, "La label può contenere al massimo 240 caratteri."));
    }
    validateQuantityAndUnit(item, path, errors);

    if (itemType === "food") {
      return;
    }

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
          if (!text(ingredient.name)) {
            errors.push(issue("missing_ingredient_name", `${ingredientPath}.name`, "Il nome dell'ingrediente è obbligatorio."));
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
      warnings.push(issue(
        "empty_preparation_details",
        path,
        "La preparazione non contiene ingredienti né procedimento.",
        "warning"
      ));
    }
  }

  function validatePacket(packet) {
    const errors = [];
    const warnings = [];

    if (!isPlainObject(packet)) {
      return {
        valid: false,
        packet,
        errors: [issue("invalid_root", "$", "Il pacchetto deve essere un oggetto JSON.")],
        warnings
      };
    }

    validateAllowedFields(packet, "$", ["contract", "version", "menu", "days", "guardrails"], errors);

    if (packet.contract !== CONTRACT) {
      errors.push(issue("unsupported_contract", "contract", `Il contratto richiesto è ${CONTRACT}.`));
    }
    if (packet.version !== VERSION) {
      errors.push(issue("unsupported_version", "version", `La versione supportata è ${VERSION}.`));
    }
    const guardrails = packet.guardrails;
    if (!isPlainObject(guardrails)) {
      errors.push(issue("missing_guardrails", "guardrails", "I guardrail obbligatori non sono presenti."));
    } else {
      validateAllowedFields(
        guardrails,
        "guardrails",
        ["preview_only", "automatic_save", "requires_user_confirmation"],
        errors
      );
      if (guardrails.preview_only !== true) {
        errors.push(issue("guardrail_preview_only", "guardrails.preview_only", "preview_only deve essere true."));
      }
      if (guardrails.automatic_save !== false) {
        errors.push(issue("guardrail_automatic_save", "guardrails.automatic_save", "automatic_save deve essere false."));
      }
      if (guardrails.requires_user_confirmation !== true) {
        errors.push(issue(
          "guardrail_user_confirmation",
          "guardrails.requires_user_confirmation",
          "requires_user_confirmation deve essere true."
        ));
      }
    }

    const menu = packet.menu;
    let periodStart = null;
    let periodEnd = null;
    if (!isPlainObject(menu)) {
      errors.push(issue("missing_menu", "menu", "L'oggetto menu è obbligatorio."));
    } else {
      validateAllowedFields(
        menu,
        "menu",
        ["external_id", "revision", "title", "period_start", "period_end", "source"],
        errors
      );
      if (!text(menu.external_id)) {
        errors.push(issue("missing_external_id", "menu.external_id", "menu.external_id è obbligatorio."));
      } else if (menu.external_id.trim().length > 160) {
        errors.push(issue("invalid_external_id", "menu.external_id", "external_id può contenere al massimo 160 caratteri."));
      }
      if (!Number.isInteger(menu.revision) || menu.revision < 1) {
        errors.push(issue("invalid_revision", "menu.revision", "menu.revision deve essere un intero maggiore o uguale a 1."));
      }
      validateOptionalText(menu.title, "menu.title", errors, 240);

      if (!isRealDate(menu.period_start)) {
        errors.push(issue("invalid_period_start", "menu.period_start", "period_start deve essere una data reale YYYY-MM-DD."));
      } else {
        periodStart = menu.period_start;
      }
      if (!isRealDate(menu.period_end)) {
        errors.push(issue("invalid_period_end", "menu.period_end", "period_end deve essere una data reale YYYY-MM-DD."));
      } else {
        periodEnd = menu.period_end;
      }
      if (periodStart && periodEnd && periodEnd < periodStart) {
        errors.push(issue("invalid_period", "menu.period_end", "period_end non può precedere period_start."));
      }

      if (!isPlainObject(menu.source)) {
        errors.push(issue("missing_source", "menu.source", "La provenienza del menu è obbligatoria."));
      } else {
        validateAllowedFields(menu.source, "menu.source", ["type", "label", "generated_at"], errors);
        if (!SOURCE_TYPES.includes(menu.source.type)) {
          errors.push(issue("unsupported_source_type", "menu.source.type", "source.type non è supportato."));
        }
        if (!text(menu.source.label)) {
          errors.push(issue("missing_source_label", "menu.source.label", "source.label è obbligatorio."));
        } else if (menu.source.label.trim().length > 200) {
          errors.push(issue("invalid_source_label", "menu.source.label", "source.label può contenere al massimo 200 caratteri."));
        }
        if (menu.source.generated_at !== undefined
          && menu.source.generated_at !== null
          && !isRfc3339(menu.source.generated_at)) {
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

        if (!isRealDate(day.date)) {
          errors.push(issue("invalid_day_date", `${dayPath}.date`, "La data del giorno deve essere YYYY-MM-DD ed esistere."));
        } else {
          if (seenDates.has(day.date)) {
            errors.push(issue("duplicate_day_date", `${dayPath}.date`, `La data ${day.date} è duplicata.`));
          }
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

          const mealKey = text(meal.key);
          if (!mealKey) {
            errors.push(issue("missing_meal_key", `${mealPath}.key`, "meal.key è obbligatorio."));
          } else if (mealKey.length > 200) {
            errors.push(issue("invalid_meal_key", `${mealPath}.key`, "meal.key può contenere al massimo 200 caratteri."));
          } else if (seenMealKeys.has(mealKey)) {
            errors.push(issue("duplicate_meal_key", `${mealPath}.key`, `meal.key ${mealKey} è duplicato nel pacchetto.`));
          } else {
            seenMealKeys.add(mealKey);
          }

          if (!MEAL_SLOTS.includes(meal.slot)) {
            errors.push(issue("unsupported_meal_slot", `${mealPath}.slot`, "La fascia del pasto non è supportata."));
          }
          if (meal.time !== undefined && meal.time !== null && !TIME_PATTERN.test(meal.time)) {
            errors.push(issue("invalid_meal_time", `${mealPath}.time`, "L'orario deve usare il formato HH:MM a 24 ore."));
          }
          if (meal.servings !== undefined
            && meal.servings !== null
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
            const itemKey = isPlainObject(item) ? text(item.key) : "";
            if (itemKey && seenItemKeys.has(itemKey)) {
              errors.push(issue("duplicate_item_key", `${itemPath}.key`, `item.key ${itemKey} è duplicato nello stesso pasto.`));
            }
            if (itemKey) seenItemKeys.add(itemKey);
            validateItem(item, itemPath, errors, warnings);
          });
        });
      });
    }

    return {
      valid: errors.length === 0,
      packet,
      errors,
      warnings,
      summary: summarize(packet),
      normalizedPacket: normalizePacketUnits(packet)
    };
  }

  function summarize(packet) {
    const days = Array.isArray(packet?.days) ? packet.days : [];
    let mealCount = 0;
    let itemCount = 0;
    let recipeCount = 0;
    let foodCount = 0;
    let preparationCount = 0;

    days.forEach(day => {
      const meals = Array.isArray(day?.meals) ? day.meals : [];
      mealCount += meals.length;
      meals.forEach(meal => {
        const items = Array.isArray(meal?.items) ? meal.items : [];
        itemCount += items.length;
        items.forEach(item => {
          if (item?.type === "recipe") recipeCount += 1;
          if (item?.type === "food") foodCount += 1;
          if (item?.type === "preparation") preparationCount += 1;
        });
      });
    });

    return { days: days.length, meals: mealCount, items: itemCount, recipes: recipeCount, foods: foodCount, preparations: preparationCount };
  }

  function normalizeRecipeCode(value) {
    return text(value).toLocaleUpperCase("it-IT");
  }

  function isHuromRecipeCode(value) {
    return HUROM_STABLE_CODES.includes(normalizeRecipeCode(value));
  }

  function recipeReferences(packet) {
    const references = [];
    (Array.isArray(packet?.days) ? packet.days : []).forEach((day, dayIndex) => {
      (Array.isArray(day?.meals) ? day.meals : []).forEach((meal, mealIndex) => {
        (Array.isArray(meal?.items) ? meal.items : []).forEach((item, itemIndex) => {
          if (item?.type !== "recipe") return;
          references.push({
            day_index: dayIndex,
            meal_index: mealIndex,
            item_index: itemIndex,
            day_date: day.date ?? null,
            meal_key: meal.key ?? null,
            item_key: item.key ?? null,
            recipe_code: text(item.recipe_code),
            normalized_recipe_code: normalizeRecipeCode(item.recipe_code),
            label: text(item.label) || null,
            is_hurom_reference: isHuromRecipeCode(item.recipe_code),
            path: `days[${dayIndex}].meals[${mealIndex}].items[${itemIndex}].recipe_code`
          });
        });
      });
    });
    return references;
  }

  function resolveRecipeCodes(packet, recipes = []) {
    const catalog = Array.isArray(recipes) ? recipes : [];
    const recipesByCode = new Map();

    catalog.forEach(recipe => {
      const normalizedCode = normalizeRecipeCode(recipe?.code);
      if (!normalizedCode) return;
      const candidates = recipesByCode.get(normalizedCode) ?? [];
      candidates.push(recipe);
      recipesByCode.set(normalizedCode, candidates);
    });

    const references = recipeReferences(packet).map(reference => {
      const candidates = recipesByCode.get(reference.normalized_recipe_code) ?? [];
      if (candidates.length === 1) {
        return {
          ...reference,
          status: "resolved",
          recipe_id: candidates[0].id,
          recipe: candidates[0],
          conflict: null
        };
      }
      if (candidates.length === 0) {
        return {
          ...reference,
          status: "missing_library_reference",
          recipe_id: null,
          recipe: null,
          conflict: issue(
            "missing_library_reference",
            reference.path,
            `Nessuna ricetta della tua Biblioteca usa il codice ${reference.recipe_code}.`,
            "error",
            { recipe_code: reference.recipe_code, is_hurom_reference: reference.is_hurom_reference }
          )
        };
      }
      return {
        ...reference,
        status: "ambiguous_library_reference",
        recipe_id: null,
        recipe: null,
        candidates,
        conflict: issue(
          "ambiguous_library_reference",
          reference.path,
          `Il codice ${reference.recipe_code} corrisponde a ${candidates.length} ricette della tua Biblioteca.`,
          "error",
          { recipe_code: reference.recipe_code, candidate_ids: candidates.map(candidate => candidate.id) }
        )
      };
    });

    const conflicts = references.map(reference => reference.conflict).filter(Boolean);
    return {
      complete: conflicts.length === 0,
      references,
      resolved: references.filter(reference => reference.status === "resolved"),
      missing: references.filter(reference => reference.status === "missing_library_reference"),
      ambiguous: references.filter(reference => reference.status === "ambiguous_library_reference"),
      conflicts
    };
  }

  function analyze(input, recipes = []) {
    let parsed;
    try {
      parsed = parse(input);
    } catch (error) {
      const parseIssue = error?.code ? error : issue("invalid_json", "$", error.message || "JSON non valido.");
      return {
        valid: false,
        stage: "parsing",
        sourceFormat: null,
        packet: null,
        errors: [parseIssue],
        warnings: [],
        resolution: null
      };
    }

    const validation = validatePacket(parsed.packet);
    if (!validation.valid) {
      return {
        ...validation,
        stage: "validation",
        sourceFormat: parsed.sourceFormat,
        resolution: null
      };
    }

    const resolution = resolveRecipeCodes(validation.packet, recipes);
    return {
      ...validation,
      valid: resolution.complete,
      stage: "library_resolution",
      sourceFormat: parsed.sourceFormat,
      resolution,
      errors: [...validation.errors, ...resolution.conflicts]
    };
  }

  const api = Object.freeze({
    CONTRACT,
    VERSION,
    MEAL_SLOTS,
    ITEM_TYPES,
    SOURCE_TYPES,
    HUROM_STABLE_CODES,
    STANDARD_UNITS,
    analyze,
    isHuromRecipeCode,
    isRealDate,
    normalizeRecipeCode,
    normalizePacketUnits,
    normalizeUnit,
    parse,
    recipeReferences,
    resolveRecipeCodes,
    summarize,
    validatePacket
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.CucinaHubMenuPlanImportEngine = api;
})();
