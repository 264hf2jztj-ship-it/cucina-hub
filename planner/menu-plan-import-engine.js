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
  const RESOLUTION_ACTIONS_BY_CONFLICT = Object.freeze({
    missing_library_reference: Object.freeze(["map_recipe", "skip_incoming_item", "cancel_import"]),
    ambiguous_library_reference: Object.freeze(["map_recipe", "skip_incoming_item", "cancel_import"]),
    overlapping_menu_package: Object.freeze(["keep_existing", "use_incoming", "cancel_import"]),
    existing_manual_meal: Object.freeze(["keep_existing", "use_incoming", "skip_incoming_meal", "cancel_import"]),
    user_modified_imported_meal: Object.freeze(["keep_existing", "use_incoming", "skip_incoming_meal", "cancel_import"]),
    user_modified_imported_item: Object.freeze(["keep_existing", "use_incoming", "skip_incoming_item", "cancel_import"])
  });
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

  function sortJsonValue(value) {
    if (Array.isArray(value)) return value.map(sortJsonValue);
    if (!isPlainObject(value)) return value;

    return Object.keys(value)
      .sort()
      .reduce((sorted, key) => {
        sorted[key] = sortJsonValue(value[key]);
        return sorted;
      }, Object.create(null));
  }

  function canonicalStringify(value) {
    const json = JSON.stringify(value);
    if (json === undefined) {
      throw issue("invalid_hash_payload", "$", "Il contenuto non può essere convertito in JSON canonico.");
    }
    return JSON.stringify(sortJsonValue(JSON.parse(json)));
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  }

  async function computePayloadHash(packet) {
    const canonicalPayload = canonicalStringify(normalizePacketUnits(packet));

    if (globalThis.crypto?.subtle && typeof globalThis.TextEncoder === "function") {
      const digest = await globalThis.crypto.subtle.digest(
        "SHA-256",
        new globalThis.TextEncoder().encode(canonicalPayload)
      );
      return bytesToHex(new Uint8Array(digest));
    }

    if (typeof require === "function") {
      const { createHash } = require("node:crypto");
      return createHash("sha256").update(canonicalPayload, "utf8").digest("hex");
    }

    throw issue(
      "hash_unavailable",
      "$",
      "Il browser non rende disponibile SHA-256: impossibile verificare i retry in sicurezza."
    );
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

  function analyzeIdempotency(packet, payloadHash, existingPackages = []) {
    const sourceType = typeof packet?.menu?.source?.type === "string" ? packet.menu.source.type : "";
    const externalId = typeof packet?.menu?.external_id === "string" ? packet.menu.external_id : "";
    const revision = packet?.menu?.revision;
    const identity = {
      source_type: sourceType,
      source_external_id: externalId,
      source_revision: revision
    };

    if (!/^[0-9a-f]{64}$/.test(payloadHash ?? "")) {
      return {
        status: "invalid_payload_hash",
        can_continue: false,
        blocking: true,
        payload_hash: payloadHash ?? null,
        identity,
        existing_count: 0,
        match: null,
        latest: null,
        issue: issue(
          "invalid_payload_hash",
          "$",
          "L'hash del pacchetto non è uno SHA-256 valido."
        )
      };
    }

    const relevantPackages = (Array.isArray(existingPackages) ? existingPackages : [])
      .filter(menuPackage => menuPackage?.source_type === sourceType
        && menuPackage?.source_external_id === externalId
        && Number.isInteger(menuPackage?.source_revision))
      .sort((left, right) => right.source_revision - left.source_revision);
    const latest = relevantPackages[0] ?? null;
    const match = relevantPackages.find(menuPackage => menuPackage.source_revision === revision) ?? null;
    const base = {
      payload_hash: payloadHash,
      identity,
      existing_count: relevantPackages.length,
      match,
      latest
    };

    if (!latest) {
      return {
        ...base,
        status: "new_menu",
        can_continue: true,
        blocking: false,
        issue: null
      };
    }

    if (match) {
      if (match.payload_hash === payloadHash) {
        return {
          ...base,
          status: "already_imported",
          can_continue: false,
          blocking: false,
          issue: issue(
            "already_imported",
            "menu.revision",
            "Questo pacchetto è già noto: il retry è stato fermato senza creare duplicati.",
            "warning",
            { package_id: match.id ?? null, import_status: match.import_status ?? null }
          )
        };
      }

      if (!match.payload_hash) {
        return {
          ...base,
          status: "existing_revision_without_hash",
          can_continue: false,
          blocking: true,
          issue: issue(
            "existing_revision_without_hash",
            "menu.revision",
            "Questa revisione esiste già ma non ha un hash verificabile: controllo manuale necessario.",
            "error",
            { package_id: match.id ?? null }
          )
        };
      }

      return {
        ...base,
        status: "same_revision_payload_mismatch",
        can_continue: false,
        blocking: true,
        issue: issue(
          "same_revision_payload_mismatch",
          "menu.revision",
          "La stessa revisione esiste già con contenuto diverso. Incrementa menu.revision oppure ripristina il contenuto originale.",
          "error",
          { package_id: match.id ?? null, existing_payload_hash: match.payload_hash }
        )
      };
    }

    if (revision < latest.source_revision) {
      return {
        ...base,
        status: "stale_revision",
        can_continue: false,
        blocking: true,
        issue: issue(
          "stale_menu_revision",
          "menu.revision",
          `La revisione ${revision} è superata: la revisione più recente è ${latest.source_revision}.`,
          "error",
          { latest_package_id: latest.id ?? null, latest_revision: latest.source_revision }
        )
      };
    }

    return {
      ...base,
      status: "new_revision",
      can_continue: true,
      blocking: false,
      issue: null
    };
  }

  function dateRangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
    return isRealDate(leftStart)
      && isRealDate(leftEnd)
      && isRealDate(rightStart)
      && isRealDate(rightEnd)
      && leftStart <= rightEnd
      && leftEnd >= rightStart;
  }

  function incomingMealEntries(packet) {
    const entries = [];
    (Array.isArray(packet?.days) ? packet.days : []).forEach((day, dayIndex) => {
      (Array.isArray(day?.meals) ? day.meals : []).forEach((meal, mealIndex) => {
        entries.push({
          key: meal?.key ?? null,
          date: day?.date ?? null,
          slot: meal?.slot ?? null,
          time: meal?.time ?? null,
          items: Array.isArray(meal?.items) ? meal.items : [],
          path: `days[${dayIndex}].meals[${mealIndex}]`
        });
      });
    });
    return entries;
  }

  function analyzeConflicts(packet, context = {}) {
    const menu = packet?.menu ?? {};
    const packages = Array.isArray(context.packages) ? context.packages : [];
    const meals = Array.isArray(context.meals) ? context.meals : [];
    const items = Array.isArray(context.items) ? context.items : [];
    const incomingMeals = incomingMealEntries(packet);
    const packageById = new Map(packages.map(menuPackage => [menuPackage?.id, menuPackage]));
    const mealById = new Map(meals.map(meal => [meal?.id, meal]));
    const activePackages = packages.filter(menuPackage =>
      !["cancelled", "superseded"].includes(menuPackage?.import_status)
    );
    const activePackageIds = new Set(activePackages.map(menuPackage => menuPackage?.id).filter(Boolean));
    const incomingByPosition = new Map();
    incomingMeals.forEach(meal => {
      const position = `${meal.date}\u0000${meal.slot}`;
      const matches = incomingByPosition.get(position) ?? [];
      matches.push(meal);
      incomingByPosition.set(position, matches);
    });

    const conflicts = [];
    const affectedIncomingMeals = new Set();
    const addConflict = (code, path, message, details = {}) => {
      conflicts.push(issue(code, path, message, "error", details));
      if (details.incoming_meal_key) affectedIncomingMeals.add(details.incoming_meal_key);
    };

    activePackages.forEach(menuPackage => {
      if (!dateRangesOverlap(
        menu.period_start,
        menu.period_end,
        menuPackage?.period_start,
        menuPackage?.period_end
      )) return;

      const label = text(menuPackage.title) || text(menuPackage.source_external_id) || "Menu esistente";
      addConflict(
        "overlapping_menu_package",
        "menu.period_start",
        `${label} occupa già parte del periodo ${menuPackage.period_start}–${menuPackage.period_end}.`,
        {
          package_id: menuPackage.id ?? null,
          title: label,
          period_start: menuPackage.period_start ?? null,
          period_end: menuPackage.period_end ?? null,
          source_type: menuPackage.source_type ?? null,
          source_external_id: menuPackage.source_external_id ?? null,
          source_revision: menuPackage.source_revision ?? null,
          import_status: menuPackage.import_status ?? null,
          same_menu_source: menuPackage.source_type === menu?.source?.type
            && menuPackage.source_external_id === menu.external_id
        }
      );
    });

    meals.forEach(meal => {
      const position = `${meal?.planned_date}\u0000${meal?.meal_slot}`;
      const collidingIncomingMeals = incomingByPosition.get(position) ?? [];
      if (meal?.menu_package_id !== null && meal?.menu_package_id !== undefined) return;

      collidingIncomingMeals.forEach(incomingMeal => {
        addConflict(
          "existing_manual_meal",
          incomingMeal.path,
          `Esiste già un pasto manuale il ${meal.planned_date} nella fascia ${meal.meal_slot}.`,
          {
            existing_meal_id: meal.id ?? null,
            planned_date: meal.planned_date ?? null,
            meal_slot: meal.meal_slot ?? null,
            planned_time: meal.planned_time ?? null,
            incoming_meal_key: incomingMeal.key
          }
        );
      });
    });

    const importedMealIsAffected = meal => {
      if (!meal?.menu_package_id) return false;
      const menuPackage = packageById.get(meal.menu_package_id);
      if (menuPackage && !activePackageIds.has(menuPackage.id)) return false;
      const sameMenuSource = menuPackage?.source_type === menu?.source?.type
        && menuPackage?.source_external_id === menu.external_id;
      const collision = incomingByPosition.has(`${meal.planned_date}\u0000${meal.meal_slot}`);
      return sameMenuSource || collision;
    };

    meals.forEach(meal => {
      if (!meal?.is_user_modified || !importedMealIsAffected(meal)) return;
      const menuPackage = packageById.get(meal.menu_package_id);
      const incomingMatch = incomingMeals.find(incomingMeal => incomingMeal.key === meal.source_meal_key)
        ?? incomingByPosition.get(`${meal.planned_date}\u0000${meal.meal_slot}`)?.[0]
        ?? null;
      addConflict(
        "user_modified_imported_meal",
        incomingMatch?.path ?? "menu",
        `Il pasto importato del ${meal.planned_date} (${meal.meal_slot}) è stato modificato manualmente.`,
        {
          existing_meal_id: meal.id ?? null,
          package_id: meal.menu_package_id,
          source_meal_key: meal.source_meal_key ?? null,
          planned_date: meal.planned_date ?? null,
          meal_slot: meal.meal_slot ?? null,
          incoming_meal_key: incomingMatch?.key ?? null,
          source_external_id: menuPackage?.source_external_id ?? null,
          source_revision: menuPackage?.source_revision ?? null
        }
      );
    });

    items.forEach(item => {
      if (!item?.is_user_modified) return;
      const parentMeal = mealById.get(item.planned_meal_id);
      if (!parentMeal || !importedMealIsAffected(parentMeal)) return;
      const menuPackage = packageById.get(parentMeal.menu_package_id);
      const incomingMeal = incomingMeals.find(meal => meal.key === parentMeal.source_meal_key)
        ?? incomingByPosition.get(`${parentMeal.planned_date}\u0000${parentMeal.meal_slot}`)?.[0]
        ?? null;
      const incomingItemIndex = incomingMeal?.items.findIndex(candidate => candidate?.key === item.source_item_key) ?? -1;
      const itemPath = incomingMeal && incomingItemIndex >= 0
        ? `${incomingMeal.path}.items[${incomingItemIndex}]`
        : incomingMeal?.path ?? "menu";
      const itemLabel = text(item.label) || text(item.recipe_code) || text(item.source_item_key) || "Elemento importato";
      addConflict(
        "user_modified_imported_item",
        itemPath,
        `${itemLabel} è stato modificato manualmente dopo l'importazione.`,
        {
          existing_item_id: item.id ?? null,
          existing_meal_id: parentMeal.id ?? null,
          package_id: parentMeal.menu_package_id,
          source_meal_key: parentMeal.source_meal_key ?? null,
          source_item_key: item.source_item_key ?? null,
          item_type: item.item_type ?? null,
          label: itemLabel,
          planned_date: parentMeal.planned_date ?? null,
          meal_slot: parentMeal.meal_slot ?? null,
          incoming_meal_key: incomingMeal?.key ?? null,
          source_external_id: menuPackage?.source_external_id ?? null,
          source_revision: menuPackage?.source_revision ?? null
        }
      );
    });

    const countByType = conflicts.reduce((counts, conflict) => {
      counts[conflict.code] = (counts[conflict.code] ?? 0) + 1;
      return counts;
    }, {});

    return {
      status: conflicts.length ? "conflicts_found" : "clear",
      complete: conflicts.length === 0,
      has_conflicts: conflicts.length > 0,
      can_commit: false,
      conflicts,
      count_by_type: countByType,
      affected_incoming_meals: affectedIncomingMeals.size,
      scanned: {
        incoming_meals: incomingMeals.length,
        menu_packages: packages.length,
        planned_meals: meals.length,
        planned_meal_items: items.length
      }
    };
  }

  function conflictIdentifier(conflict, index = 0) {
    const details = conflict?.details ?? {};
    const target = [
      details.package_id,
      details.existing_meal_id,
      details.existing_item_id,
      details.incoming_meal_key,
      details.source_item_key,
      details.recipe_code
    ].find(value => typeof value === "string" && value.trim()) ?? String(index);
    return [conflict?.code ?? "conflict", conflict?.path ?? "$", target].join("::");
  }

  function resolutionActionsForConflict(conflict) {
    return [...(RESOLUTION_ACTIONS_BY_CONFLICT[conflict?.code] ?? ["cancel_import"])];
  }

  function resolvableConflicts(libraryResolution = null, conflictAnalysis = null) {
    const libraryConflicts = Array.isArray(libraryResolution?.conflicts)
      ? libraryResolution.conflicts.map(conflict => ({ conflict, category: "library" }))
      : [];
    const plannerConflicts = Array.isArray(conflictAnalysis?.conflicts)
      ? conflictAnalysis.conflicts.map(conflict => ({ conflict, category: "planner" }))
      : [];

    return [...libraryConflicts, ...plannerConflicts].map(({ conflict, category }, index) => ({
      ...conflict,
      conflict_id: conflictIdentifier(conflict, index),
      category,
      allowed_actions: resolutionActionsForConflict(conflict)
    }));
  }

  function buildResolutionPlan(libraryResolution, conflictAnalysis, selections = {}, recipes = []) {
    const available = Boolean(conflictAnalysis) && conflictAnalysis?.status !== "check_unavailable";
    const recipeById = new Map(
      (Array.isArray(recipes) ? recipes : [])
        .filter(recipe => recipe?.id)
        .map(recipe => [recipe.id, recipe])
    );
    const conflicts = resolvableConflicts(libraryResolution, conflictAnalysis);
    const selectionFor = conflictId => selections instanceof Map
      ? selections.get(conflictId)
      : selections?.[conflictId];

    const decisions = conflicts.map(conflict => {
      const selected = selectionFor(conflict.conflict_id);
      const choice = typeof selected === "string" ? { action: selected } : selected;
      const allowed = conflict.allowed_actions.includes(choice?.action);
      const mappedRecipe = choice?.action === "map_recipe"
        ? recipeById.get(choice.recipe_id) ?? null
        : null;
      const resolved = Boolean(allowed && (choice?.action !== "map_recipe" || mappedRecipe));

      return {
        conflict_id: conflict.conflict_id,
        code: conflict.code,
        path: conflict.path,
        category: conflict.category,
        allowed_actions: conflict.allowed_actions,
        choice: resolved
          ? {
              action: choice.action,
              recipe_id: mappedRecipe?.id ?? null,
              recipe_code: mappedRecipe?.code ?? null,
              recipe_title: mappedRecipe?.title ?? null
            }
          : null,
        resolved
      };
    });
    const cancelled = decisions.some(decision => decision.choice?.action === "cancel_import");
    const unresolved = decisions.filter(decision => !decision.resolved);
    const complete = available && (cancelled || unresolved.length === 0);
    const readyForConfirmation = complete && !cancelled;
    const decisionById = new Map(decisions.map(decision => [decision.conflict_id, decision]));

    return {
      available,
      complete,
      cancelled,
      ready_for_confirmation: readyForConfirmation,
      can_commit: readyForConfirmation,
      total_conflicts: conflicts.length,
      resolved_conflicts: cancelled ? conflicts.length : decisions.length - unresolved.length,
      unresolved_conflicts: cancelled ? 0 : unresolved.length,
      conflicts: conflicts.map(conflict => ({
        ...conflict,
        decision: decisionById.get(conflict.conflict_id) ?? null
      })),
      decisions
    };
  }

  function buildMenuPreview(packet, libraryResolution = null, resolutionPlan = null, recipes = []) {
    const referenceByPath = new Map(
      (Array.isArray(libraryResolution?.references) ? libraryResolution.references : [])
        .map(reference => [reference.path, reference])
    );
    const recipeById = new Map(
      (Array.isArray(recipes) ? recipes : [])
        .filter(recipe => recipe?.id)
        .map(recipe => [recipe.id, recipe])
    );
    const decisionByPath = new Map(
      (Array.isArray(resolutionPlan?.conflicts) ? resolutionPlan.conflicts : [])
        .filter(conflict => conflict?.decision?.choice)
        .map(conflict => [conflict.path, conflict.decision.choice])
    );
    const conflicts = Array.isArray(resolutionPlan?.conflicts) ? resolutionPlan.conflicts : [];
    let huromReferences = 0;
    let autonomousItems = 0;

    const days = (Array.isArray(packet?.days) ? packet.days : []).map((day, dayIndex) => ({
      date: day.date,
      meals: (Array.isArray(day?.meals) ? day.meals : []).map((meal, mealIndex) => {
        const mealPath = `days[${dayIndex}].meals[${mealIndex}]`;
        const mealConflicts = conflicts.filter(conflict =>
          conflict.details?.incoming_meal_key === meal.key
          || conflict.path === mealPath
          || conflict.path.startsWith(`${mealPath}.`)
        );

        return {
          key: meal.key,
          slot: meal.slot,
          time: meal.time ?? null,
          servings: meal.servings ?? null,
          note: meal.note ?? null,
          path: mealPath,
          conflict_count: mealConflicts.length,
          items: (Array.isArray(meal?.items) ? meal.items : []).map((item, itemIndex) => {
            const itemPath = `${mealPath}.items[${itemIndex}]`;
            const reference = referenceByPath.get(`${itemPath}.recipe_code`) ?? null;
            const mappingChoice = decisionByPath.get(`${itemPath}.recipe_code`);
            const mappedRecipe = mappingChoice?.action === "map_recipe"
              ? recipeById.get(mappingChoice.recipe_id) ?? null
              : null;
            const resolvedRecipe = mappedRecipe ?? reference?.recipe ?? null;
            if (reference?.is_hurom_reference) huromReferences += 1;
            if (item.type !== "recipe") autonomousItems += 1;

            return {
              key: item.key,
              type: item.type,
              label: text(item.label) || text(resolvedRecipe?.title) || text(item.recipe_code) || "Elemento senza nome",
              quantity: item.quantity ?? null,
              unit: item.unit ?? null,
              note: item.note ?? null,
              ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
              procedure: Array.isArray(item.procedure) ? item.procedure : [],
              path: itemPath,
              conflict_count: conflicts.filter(conflict => conflict.path === itemPath || conflict.path === `${itemPath}.recipe_code`).length,
              recipe_reference: item.type === "recipe"
                ? {
                    recipe_code: item.recipe_code,
                    status: mappedRecipe ? "mapped" : reference?.status ?? "unresolved",
                    recipe_id: resolvedRecipe?.id ?? null,
                    recipe_title: resolvedRecipe?.title ?? null,
                    is_hurom_reference: reference?.is_hurom_reference === true
                  }
                : null
            };
          })
        };
      })
    }));

    return {
      menu: {
        external_id: packet?.menu?.external_id ?? null,
        revision: packet?.menu?.revision ?? null,
        title: packet?.menu?.title ?? null,
        period_start: packet?.menu?.period_start ?? null,
        period_end: packet?.menu?.period_end ?? null,
        source_type: packet?.menu?.source?.type ?? null,
        source_label: packet?.menu?.source?.label ?? null
      },
      summary: summarize(packet),
      hurom_references: huromReferences,
      autonomous_items: autonomousItems,
      days,
      can_commit: resolutionPlan?.can_commit === true
    };
  }

  function summarizeCommitPlan(packet, resolutionPlan) {
    const decisions = Array.isArray(resolutionPlan?.conflicts)
      ? resolutionPlan.conflicts.filter(conflict => conflict?.decision?.choice)
      : [];
    const skippedMealKeys = new Set();
    const skippedItemPaths = new Set();

    decisions.forEach(conflict => {
      const action = conflict.decision.choice.action;
      const incomingMealKey = conflict.details?.incoming_meal_key;
      if (
        (conflict.code === "existing_manual_meal" && action === "skip_incoming_meal")
        || (conflict.code === "user_modified_imported_meal" && action !== "use_incoming")
      ) {
        if (incomingMealKey) skippedMealKeys.add(incomingMealKey);
      }
      if (action === "skip_incoming_item") {
        skippedItemPaths.add(conflict.path.replace(/\.recipe_code$/, ""));
      }
    });

    let meals = 0;
    let items = 0;
    let skippedMeals = 0;
    let skippedItems = 0;
    (Array.isArray(packet?.days) ? packet.days : []).forEach((day, dayIndex) => {
      (Array.isArray(day?.meals) ? day.meals : []).forEach((meal, mealIndex) => {
        if (skippedMealKeys.has(meal?.key)) {
          skippedMeals += 1;
          return;
        }
        const includedItems = (Array.isArray(meal?.items) ? meal.items : []).filter((item, itemIndex) => {
          const path = `days[${dayIndex}].meals[${mealIndex}].items[${itemIndex}]`;
          if (!skippedItemPaths.has(path)) return true;
          skippedItems += 1;
          return false;
        });
        if (!includedItems.length) {
          skippedMeals += 1;
          return;
        }
        meals += 1;
        items += includedItems.length;
      });
    });

    return {
      days: Array.isArray(packet?.days) ? packet.days.length : 0,
      meals,
      items,
      skipped_meals: skippedMeals,
      skipped_items: skippedItems
    };
  }

  function buildCommitRequest(packet, idempotency, resolutionPlan) {
    const payloadHash = idempotency?.payload_hash ?? null;
    const ready = Boolean(
      isPlainObject(packet)
      && idempotency?.can_continue === true
      && /^[0-9a-f]{64}$/.test(payloadHash)
      && resolutionPlan?.ready_for_confirmation === true
      && resolutionPlan?.can_commit === true
      && !resolutionPlan?.cancelled
      && resolutionPlan?.unresolved_conflicts === 0
    );

    if (!ready) {
      return {
        ready: false,
        packet: null,
        canonical_payload: null,
        payload_hash: payloadHash,
        resolutions: [],
        expected_summary: null
      };
    }

    const resolutions = resolutionPlan.conflicts.map(conflict => {
      const choice = conflict.decision?.choice;
      const details = isPlainObject(conflict.details) ? conflict.details : {};
      return {
        conflict_id: conflict.conflict_id,
        code: conflict.code,
        path: conflict.path,
        action: choice.action,
        recipe_id: choice.recipe_id ?? null,
        package_id: details.package_id ?? null,
        existing_meal_id: details.existing_meal_id ?? null,
        existing_item_id: details.existing_item_id ?? null,
        incoming_meal_key: details.incoming_meal_key ?? null,
        source_item_key: details.source_item_key ?? null,
        recipe_code: details.recipe_code ?? null
      };
    });

    return {
      ready: true,
      packet,
      canonical_payload: canonicalStringify(packet),
      payload_hash: payloadHash,
      resolutions,
      expected_summary: summarizeCommitPlan(packet, resolutionPlan)
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
        resolution: null,
        contractValid: false
      };
    }

    const validation = validatePacket(parsed.packet);
    if (!validation.valid) {
      return {
        ...validation,
        stage: "validation",
        sourceFormat: parsed.sourceFormat,
        resolution: null,
        contractValid: false
      };
    }

    const resolution = resolveRecipeCodes(validation.packet, recipes);
    return {
      ...validation,
      valid: resolution.complete,
      contractValid: true,
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
    RESOLUTION_ACTIONS_BY_CONFLICT,
    HUROM_STABLE_CODES,
    STANDARD_UNITS,
    analyze,
    analyzeConflicts,
    analyzeIdempotency,
    buildCommitRequest,
    buildMenuPreview,
    buildResolutionPlan,
    canonicalStringify,
    computePayloadHash,
    dateRangesOverlap,
    conflictIdentifier,
    incomingMealEntries,
    isHuromRecipeCode,
    isRealDate,
    normalizeRecipeCode,
    normalizePacketUnits,
    normalizeUnit,
    parse,
    recipeReferences,
    resolvableConflicts,
    resolutionActionsForConflict,
    resolveRecipeCodes,
    summarize,
    summarizeCommitPlan,
    validatePacket
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.CucinaHubMenuPlanImportEngine = api;
})();
