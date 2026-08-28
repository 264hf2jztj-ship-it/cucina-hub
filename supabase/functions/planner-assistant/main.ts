const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6-terra";
const MAX_PROMPT_LENGTH = 800;
const MAX_PERIOD_DAYS = 14;
const MAX_RECIPES = 160;
const MAX_RAG_SOURCES = 4;
const MAX_RAG_CHARACTERS = 1800;
const MAX_EXISTING_MEALS = 120;

const MEAL_SLOTS = new Set([
  "breakfast",
  "morning_snack",
  "lunch",
  "afternoon_snack",
  "dinner",
  "other",
]);
const ITEM_TYPES = new Set(["recipe", "food", "preparation"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const MENU_DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "days"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 240 },
    days: {
      type: "array",
      minItems: 1,
      maxItems: 14,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "meals"],
        properties: {
          date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          meals: {
            type: "array",
            minItems: 1,
            maxItems: 12,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["slot", "time", "servings", "note", "items"],
              properties: {
                slot: {
                  type: "string",
                  enum: ["breakfast", "morning_snack", "lunch", "afternoon_snack", "dinner", "other"],
                },
                time: { type: ["string", "null"], pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
                servings: { type: ["integer", "null"], minimum: 1, maximum: 50 },
                note: { type: ["string", "null"], maxLength: 1000 },
                items: {
                  type: "array",
                  minItems: 1,
                  maxItems: 8,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                      "type", "recipe_code", "label", "quantity", "unit", "note", "ingredients", "procedure",
                    ],
                    properties: {
                      type: { type: "string", enum: ["recipe", "food", "preparation"] },
                      recipe_code: { type: ["string", "null"], maxLength: 120 },
                      label: { type: ["string", "null"], maxLength: 240 },
                      quantity: { type: ["number", "null"], exclusiveMinimum: 0 },
                      unit: { type: ["string", "null"], maxLength: 40 },
                      note: { type: ["string", "null"], maxLength: 2000 },
                      ingredients: {
                        type: "array",
                        maxItems: 30,
                        items: {
                          type: "object",
                          additionalProperties: false,
                          required: ["name", "quantity", "unit"],
                          properties: {
                            name: { type: "string", minLength: 1, maxLength: 240 },
                            quantity: { type: ["number", "null"], exclusiveMinimum: 0 },
                            unit: { type: ["string", "null"], maxLength: 40 },
                          },
                        },
                      },
                      procedure: {
                        type: "array",
                        maxItems: 20,
                        items: { type: "string", minLength: 1, maxLength: 600 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

function configuredOrigins() {
  const raw = Deno.env.get("PLANNER_ASSISTANT_ALLOWED_ORIGINS")
    || "https://264hf2jztj-ship-it.github.io";
  return raw.split(",").map(item => item.trim()).filter(Boolean);
}

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  const allowed = configuredOrigins();
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(request, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function outputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string" && content.text.trim()) {
        return content.text.trim();
      }
    }
  }
  return null;
}

function safeModel() {
  return (Deno.env.get("PLANNER_AI_MODEL") || Deno.env.get("OPENAI_MODEL") || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

function cleanText(value, maxLength = 10_000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isRealDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function inclusiveDays(start, end) {
  if (!isRealDate(start) || !isRealDate(end) || end < start) return null;
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  return Math.floor((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000) + 1;
}

function requestValidation(body) {
  const prompt = cleanText(body?.prompt, MAX_PROMPT_LENGTH + 1);
  const periodStart = cleanText(body?.period_start, 10);
  const periodEnd = cleanText(body?.period_end, 10);
  const servings = Number(body?.servings);
  const days = inclusiveDays(periodStart, periodEnd);

  if (prompt.length < 3 || prompt.length > MAX_PROMPT_LENGTH) {
    return { valid: false, message: `La richiesta deve contenere tra 3 e ${MAX_PROMPT_LENGTH} caratteri.` };
  }
  if (days === null || days < 1 || days > MAX_PERIOD_DAYS) {
    return { valid: false, message: `Il periodo deve essere compreso tra 1 e ${MAX_PERIOD_DAYS} giorni.` };
  }
  if (!Number.isInteger(servings) || servings < 1 || servings > 20) {
    return { valid: false, message: "Le porzioni devono essere un intero tra 1 e 20." };
  }
  return {
    valid: true,
    request: { prompt, period_start: periodStart, period_end: periodEnd, servings },
  };
}

function supabaseHeaders(request) {
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = request.headers.get("authorization");
  if (!anonKey || !authorization) throw new Error("planner_context_configuration_missing");
  return {
    "Authorization": authorization,
    "apikey": anonKey,
    "Content-Type": "application/json",
  };
}

function supabaseUrl() {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) throw new Error("planner_context_configuration_missing");
  return url;
}

async function retrieveRecipes(request) {
  const url = new URL(`${supabaseUrl()}/rest/v1/recipes`);
  url.searchParams.set("select", "code,title");
  url.searchParams.set("order", "title.asc");
  url.searchParams.set("limit", String(MAX_RECIPES));
  const response = await fetch(url, { headers: supabaseHeaders(request) });
  if (!response.ok) throw new Error(`recipe_catalog_failed_${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) return [];
  return rows
    .map(row => ({ code: cleanText(row?.code, 120), title: cleanText(row?.title, 240) }))
    .filter(row => row.code && row.title);
}

async function retrieveExistingMeals(request, periodStart, periodEnd) {
  const url = new URL(`${supabaseUrl()}/rest/v1/planned_meals`);
  url.searchParams.set("select", "planned_date,meal_slot,planned_time,note");
  url.searchParams.append("planned_date", `gte.${periodStart}`);
  url.searchParams.append("planned_date", `lte.${periodEnd}`);
  url.searchParams.set("order", "planned_date.asc");
  url.searchParams.set("limit", String(MAX_EXISTING_MEALS));
  const response = await fetch(url, { headers: supabaseHeaders(request) });
  if (!response.ok) throw new Error(`planner_context_failed_${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows)
    ? rows.map(row => ({
        date: cleanText(row?.planned_date, 10),
        slot: cleanText(row?.meal_slot, 40),
        time: cleanText(row?.planned_time, 5) || null,
        note: cleanText(row?.note, 220) || null,
      }))
    : [];
}

async function retrieveRag(request, prompt) {
  try {
    const response = await fetch(`${supabaseUrl()}/rest/v1/rpc/search_rag_sources`, {
      method: "POST",
      headers: supabaseHeaders(request),
      body: JSON.stringify({ p_query: prompt, p_limit: MAX_RAG_SOURCES }),
    });
    if (!response.ok) return [];
    const rows = await response.json();
    if (!Array.isArray(rows)) return [];
    return rows.slice(0, MAX_RAG_SOURCES).map((row, index) => ({
      source_id: `SRC-${index + 1}`,
      display_name: cleanText(row?.display_name, 180) || "Fonte privata",
      heading: cleanText(row?.heading, 180) || null,
      locator: cleanText(row?.locator, 100) || null,
      content: cleanText(row?.content, MAX_RAG_CHARACTERS),
    })).filter(row => row.content);
  } catch {
    return [];
  }
}

function normalizeQuantity(target, quantity, unit) {
  const parsed = Number(quantity);
  const cleanUnit = cleanText(unit, 40);
  if (Number.isFinite(parsed) && parsed > 0 && cleanUnit) {
    target.quantity = parsed;
    target.unit = cleanUnit;
  }
}

function normalizeDraft(draft, request, recipes) {
  if (!draft || typeof draft !== "object" || !Array.isArray(draft.days)) {
    throw new Error("invalid_menu_draft");
  }
  const recipeByCode = new Map(recipes.map(recipe => [recipe.code, recipe]));
  const seenDates = new Set();
  const days = [];

  for (const rawDay of draft.days) {
    const date = cleanText(rawDay?.date, 10);
    if (!isRealDate(date) || date < request.period_start || date > request.period_end || seenDates.has(date)) {
      throw new Error("provider_day_outside_period");
    }
    seenDates.add(date);

    const rawMeals = Array.isArray(rawDay?.meals) ? rawDay.meals : [];
    if (!rawMeals.length || rawMeals.length > 12) throw new Error("provider_invalid_meals");
    const meals = rawMeals.map((rawMeal, mealIndex) => {
      const slot = cleanText(rawMeal?.slot, 40);
      if (!MEAL_SLOTS.has(slot)) throw new Error("provider_invalid_meal_slot");
      const time = rawMeal?.time === null ? null : cleanText(rawMeal?.time, 5);
      if (time && !TIME_PATTERN.test(time)) throw new Error("provider_invalid_meal_time");
      const servings = rawMeal?.servings === null ? request.servings : Number(rawMeal?.servings);
      if (!Number.isInteger(servings) || servings < 1 || servings > 50) throw new Error("provider_invalid_servings");
      const rawItems = Array.isArray(rawMeal?.items) ? rawMeal.items : [];
      if (!rawItems.length || rawItems.length > 8) throw new Error("provider_invalid_items");

      const mealKey = `planner-ai-${date}-${slot}-${mealIndex + 1}`;
      const items = rawItems.map((rawItem, itemIndex) => {
        const type = cleanText(rawItem?.type, 20);
        if (!ITEM_TYPES.has(type)) throw new Error("provider_invalid_item_type");
        const key = `${mealKey}-item-${itemIndex + 1}`;

        if (type === "recipe") {
          const recipeCode = cleanText(rawItem?.recipe_code, 120);
          if (!recipeByCode.has(recipeCode)) throw new Error(`provider_unknown_recipe_code:${recipeCode || "empty"}`);
          const item = { key, type, recipe_code: recipeCode };
          const label = cleanText(rawItem?.label, 240);
          if (label) item.label = label;
          return item;
        }

        const label = cleanText(rawItem?.label, 240);
        if (!label) throw new Error("provider_missing_item_label");
        const item = { key, type, label };
        normalizeQuantity(item, rawItem?.quantity, rawItem?.unit);
        const note = cleanText(rawItem?.note, 2000);
        if (note) item.note = note;
        if (type === "food") return item;

        const ingredients = [];
        for (const rawIngredient of Array.isArray(rawItem?.ingredients) ? rawItem.ingredients : []) {
          const name = cleanText(rawIngredient?.name, 240);
          if (!name) continue;
          const ingredient = { name };
          normalizeQuantity(ingredient, rawIngredient?.quantity, rawIngredient?.unit);
          ingredients.push(ingredient);
        }
        const procedure = (Array.isArray(rawItem?.procedure) ? rawItem.procedure : [])
          .map(step => cleanText(step, 600))
          .filter(Boolean);
        if (ingredients.length) item.ingredients = ingredients;
        if (procedure.length) item.procedure = procedure;
        return item;
      });

      const meal = { key: mealKey, slot, servings, items };
      if (time) meal.time = time;
      const note = cleanText(rawMeal?.note, 1000);
      if (note) meal.note = note;
      return meal;
    });
    days.push({ date, meals });
  }

  days.sort((left, right) => left.date.localeCompare(right.date));
  const title = cleanText(draft.title, 240) || `Menu ${request.period_start} – ${request.period_end}`;
  const generatedAt = new Date().toISOString();
  return {
    contract: "cucina-hub.menu-plan",
    version: 1,
    menu: {
      external_id: `planner-ai-${request.period_start}-${request.period_end}-${Date.now().toString(36)}`,
      revision: 1,
      title,
      period_start: request.period_start,
      period_end: request.period_end,
      source: {
        type: "chatgpt_project",
        label: "Planner AI",
        generated_at: generatedAt,
      },
    },
    days,
    guardrails: {
      preview_only: true,
      automatic_save: false,
      requires_user_confirmation: true,
    },
  };
}

const SYSTEM_INSTRUCTIONS = `Sei Planner AI di Cucina Hub.
Genera una proposta di menu pratica in italiano per il periodo richiesto.
La proposta NON salva dati: verrà trasformata in un pacchetto cucina-hub.menu-plan e dovrà passare da anteprima, conflitti e conferma esplicita.

Regole:
- usa prima le ricette personali presenti in AVAILABLE_RECIPES quando sono adatte;
- per un item type=recipe usa ESCLUSIVAMENTE un recipe_code esatto presente in AVAILABLE_RECIPES; non inventare mai codici;
- quando non esiste una ricetta adatta usa type=food o type=preparation;
- non duplicare ingredienti o procedimento per gli item recipe;
- rispetta periodo, porzioni e richiesta dell’utente;
- considera EXISTING_MEALS come contesto per evitare duplicati evidenti, ma non modificare né cancellare nulla;
- PRIVATE_SOURCES sono contesto personale aggiuntivo: usali solo se pertinenti e non inventare citazioni;
- non inferire diagnosi, allergie o condizioni mediche non dichiarate;
- mantieni il menu realistico, quotidiano e non inutilmente complicato;
- restituisci esclusivamente lo schema JSON richiesto.`;

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, 405, { error: "method_not_allowed", message: "Usa una richiesta POST." });
  if (!request.headers.get("authorization")) {
    return json(request, 401, { error: "authentication_required", message: "Accedi a Cucina Hub prima di usare Planner AI." });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(request, 400, { error: "invalid_json", message: "Corpo della richiesta non valido." });
  }

  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  const model = safeModel();
  if (body?.action === "health") {
    return json(request, 200, {
      ok: true,
      provider: "openai",
      model,
      configured: Boolean(openAiKey),
      contract: "cucina-hub.menu-plan",
      version: 1,
      automatic_writes: false,
      requires_preview: true,
      requires_user_confirmation: true,
    });
  }
  if (!openAiKey) {
    return json(request, 503, { error: "provider_not_configured", message: "OPENAI_API_KEY non configurata nei secret Supabase." });
  }

  const validation = requestValidation(body);
  if (!validation.valid) return json(request, 400, { error: "invalid_request", message: validation.message });
  const plannerRequest = validation.request;

  let recipes;
  let existingMeals;
  let ragSources;
  try {
    [recipes, existingMeals, ragSources] = await Promise.all([
      retrieveRecipes(request),
      retrieveExistingMeals(request, plannerRequest.period_start, plannerRequest.period_end),
      retrieveRag(request, plannerRequest.prompt),
    ]);
  } catch (error) {
    console.error("Planner AI context failure", error instanceof Error ? error.message : "unknown");
    return json(request, 502, {
      error: "planner_context_failed",
      message: "Non riesco a consultare Biblioteca o Planner. Riprova tra poco.",
    });
  }

  const inputPacket = {
    REQUEST: plannerRequest,
    AVAILABLE_RECIPES: recipes,
    EXISTING_MEALS: existingMeals,
    PRIVATE_SOURCES: ragSources.map(({ source_id, display_name, heading, locator, content }) => ({
      source_id, display_name, heading, locator, content,
    })),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const providerResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 4800,
        reasoning: { effort: "low" },
        text: {
          verbosity: "medium",
          format: {
            type: "json_schema",
            name: "cucina_hub_planner_ai_menu",
            strict: true,
            schema: MENU_DRAFT_SCHEMA,
          },
        },
        instructions: SYSTEM_INSTRUCTIONS,
        input: [{
          role: "user",
          content: [{ type: "input_text", text: JSON.stringify(inputPacket) }],
        }],
      }),
    });

    const providerPayload = await providerResponse.json().catch(() => null);
    if (!providerResponse.ok) {
      console.error("Planner AI provider error", providerResponse.status, providerPayload?.error?.type || "unknown");
      return json(request, providerResponse.status >= 500 ? 502 : 400, {
        error: "provider_error",
        message: providerPayload?.error?.message || "Il provider AI ha rifiutato la richiesta.",
      });
    }

    const raw = outputText(providerPayload);
    if (!raw) return json(request, 502, { error: "empty_provider_response", message: "Il provider non ha restituito un menu leggibile." });

    let draft;
    try {
      draft = JSON.parse(raw);
    } catch {
      return json(request, 502, { error: "invalid_provider_json", message: "La proposta AI non è un JSON valido." });
    }

    let packet;
    try {
      packet = normalizeDraft(draft, plannerRequest, recipes);
    } catch (error) {
      console.error("Planner AI guardrail failure", error instanceof Error ? error.message : "unknown");
      return json(request, 502, {
        error: "provider_guardrail_violation",
        message: "La proposta non rispetta il contratto o i riferimenti della Biblioteca. Riprova con una richiesta più semplice.",
      });
    }

    return json(request, 200, {
      packet,
      provenance: {
        recipe_catalog_count: recipes.length,
        existing_meal_count: existingMeals.length,
        rag_sources: ragSources.map(({ source_id, display_name, heading, locator }) => ({
          source_id, display_name, heading, locator,
        })),
      },
      provider: {
        name: "openai",
        model: providerPayload?.model || model,
        response_id: providerPayload?.id || null,
      },
      usage: providerPayload?.usage || null,
      guardrails: {
        automatic_writes: false,
        stored: false,
        requires_preview: true,
        requires_user_confirmation: true,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return json(request, 504, { error: "provider_timeout", message: "La generazione ha superato il tempo massimo. Riprova." });
    }
    console.error("Planner AI failure", error instanceof Error ? error.message : "unknown");
    return json(request, 500, { error: "internal_error", message: "Errore interno durante la generazione Planner AI." });
  } finally {
    clearTimeout(timeout);
  }
});
