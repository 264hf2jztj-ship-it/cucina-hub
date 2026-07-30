"use strict";

import { buildImportPreview } from "./import-preview.js";

const ALLOWED_RECIPE_SOURCE_TYPES = new Set([
  "personal", "chatgpt", "manual", "course", "book", "website", "other"
]);

const ALLOWED_TASTING_OUTCOMES = new Set([
  "pending", "repeat_as_is", "repeat_with_changes", "discard", "certified"
]);

function assertOk(error, context) {
  if (!error) return;
  const wrapped = new Error(`${context}: ${error.message}`);
  wrapped.code = error.code;
  wrapped.details = error.details;
  wrapped.hint = error.hint;
  throw wrapped;
}

async function findOne(client, table, filters) {
  let query = client.from(table).select("*").limit(1);
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const { data, error } = await query.maybeSingle();
  assertOk(error, `Lettura ${table}`);
  return data;
}

async function insertOne(client, table, row) {
  const { data, error } = await client.from(table).insert(row).select("*").single();
  assertOk(error, `Inserimento ${table}`);
  return data;
}

async function updateOne(client, table, id, row) {
  const { data, error } = await client.from(table).update(row).eq("id", id).select("*").single();
  assertOk(error, `Aggiornamento ${table}`);
  return data;
}

async function ensureAdministrator(client) {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  assertOk(sessionError, "Lettura sessione");
  const user = sessionData.session?.user;
  if (!user) throw new Error("Accedi prima a Cucina Hub con l’account amministratore.");

  const { data: profile, error: profileError } = await client
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  assertOk(profileError, "Verifica profilo");
  if (profile?.role !== "admin") throw new Error("L’account non ha ruolo amministratore.");
  return user.id;
}

function asJsonArray(value, objectMapper = null) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  if (typeof value === "object") {
    return Object.entries(value).map(([key, item]) =>
      objectMapper ? objectMapper(key, item) : { type: key, text: item }
    );
  }
  return [value];
}

function asJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return {};
}

function recipeDbRow(row, ownerUserId) {
  const sourceType = ALLOWED_RECIPE_SOURCE_TYPES.has(row.source_type)
    ? row.source_type
    : "chatgpt";

  return {
    owner_user_id: ownerUserId,
    code: row.code,
    title: row.title,
    status: row.status,
    description: row.description,
    method_summary: row.method_summary,
    yield_text: row.yield_text,
    instructions: asJsonArray(row.instructions),
    preparation_requirements: asJsonArray(
      row.preparation_requirements,
      (type, text) => ({ type, text })
    ),
    practical_signals: asJsonArray(row.practical_signals),
    tips: asJsonArray(row.tips),
    variations: asJsonArray(row.variations),
    substitutions: asJsonArray(row.substitutions),
    meal_moments: Array.isArray(row.meal_moments) ? row.meal_moments : [],
    nutrition_notes: row.nutrition_notes,
    personal_notes: row.personal_notes,
    source_type: sourceType,
    source_reference: JSON.stringify(row.source_reference),
    is_favorite: row.is_favorite,
    last_cooked_at: row.last_cooked_at
  };
}

function dbNormalizedIngredientName(name) {
  return String(name ?? "").trim().toLocaleLowerCase("it-IT");
}

export async function importCoreArchive({
  client,
  recipesData,
  appliancesData,
  categoriesData,
  onProgress = () => {}
}) {
  if (!client) throw new Error("Client Supabase non disponibile.");
  const ownerUserId = await ensureAdministrator(client);
  const preview = buildImportPreview({ recipesData, appliancesData, categoriesData });

  const blockingWarnings = [
    ...preview.warnings.duplicate_recipe_codes,
    ...preview.warnings.recipes_without_code,
    ...preview.warnings.ingredients_without_name
  ];
  if (blockingWarnings.length) throw new Error("Import bloccato: l’anteprima contiene anomalie.");

  const report = {
    ingredients: { created: 0, updated: 0 },
    categories: { created: 0, updated: 0 },
    tags: { created: 0, updated: 0 },
    appliances: { created: 0, updated: 0 },
    recipes: { created: 0, updated: 0 },
    recipe_ingredients: { created: 0, updated: 0 },
    tasting_notes: { created: 0, updated: 0 },
    skipped_relations: []
  };

  const ingredientByNormalizedName = new Map();
  for (const ingredient of preview.payload.ingredients) {
    onProgress(`Ingrediente: ${ingredient.name}`);
    const existing = await findOne(client, "ingredients", {
      owner_user_id: ownerUserId,
      normalized_name: dbNormalizedIngredientName(ingredient.name)
    });
    const row = {
      owner_user_id: ownerUserId,
      name: ingredient.name,
      default_unit: ingredient.default_unit,
      aliases: ingredient.aliases,
      notes: ingredient.notes,
      is_pantry_staple: ingredient.is_pantry_staple
    };
    const saved = existing
      ? await updateOne(client, "ingredients", existing.id, row)
      : await insertOne(client, "ingredients", row);
    report.ingredients[existing ? "updated" : "created"] += 1;
    ingredientByNormalizedName.set(ingredient.normalized_name, saved.id);
  }

  for (const category of preview.payload.categories) {
    onProgress(`Categoria: ${category.name}`);
    const existing = await findOne(client, "categories", {
      owner_user_id: ownerUserId,
      name: category.name
    });
    const row = {
      owner_user_id: ownerUserId,
      name: category.name
    };
    if (existing) await updateOne(client, "categories", existing.id, row);
    else await insertOne(client, "categories", row);
    report.categories[existing ? "updated" : "created"] += 1;
  }

  for (const tag of preview.payload.tags) {
    onProgress(`Tag: ${tag.name}`);
    const existing = await findOne(client, "tags", {
      owner_user_id: ownerUserId,
      name: tag.name
    });
    const row = {
      owner_user_id: ownerUserId,
      name: tag.name
    };
    if (existing) await updateOne(client, "tags", existing.id, row);
    else await insertOne(client, "tags", row);
    report.tags[existing ? "updated" : "created"] += 1;
  }

  for (const appliance of preview.payload.appliances) {
    onProgress(`Elettrodomestico: ${appliance.name}`);
    const existing = await findOne(client, "appliances", {
      owner_user_id: ownerUserId,
      name: appliance.name
    });
    const row = {
      owner_user_id: ownerUserId,
      name: appliance.name
    };
    if (existing) await updateOne(client, "appliances", existing.id, row);
    else await insertOne(client, "appliances", row);
    report.appliances[existing ? "updated" : "created"] += 1;
  }

  const recipeByCode = new Map();
  for (const recipe of preview.payload.recipes) {
    onProgress(`Ricetta: ${recipe.code}`);
    const existing = await findOne(client, "recipes", {
      owner_user_id: ownerUserId,
      code: recipe.code
    });
    const row = recipeDbRow(recipe, ownerUserId);
    const saved = existing
      ? await updateOne(client, "recipes", existing.id, row)
      : await insertOne(client, "recipes", row);
    report.recipes[existing ? "updated" : "created"] += 1;
    recipeByCode.set(recipe.code, saved.id);
  }

  for (const link of preview.payload.recipe_ingredients) {
    const recipeId = recipeByCode.get(link.recipe_code);
    const ingredientId = ingredientByNormalizedName.get(link.ingredient_normalized_name);
    if (!recipeId || !ingredientId) {
      throw new Error(`Relazione ingrediente incompleta per ${link.recipe_code}.`);
    }

    onProgress(`Collegamento ingredienti: ${link.recipe_code}`);
    const existing = await findOne(client, "recipe_ingredients", {
      recipe_id: recipeId,
      ingredient_id: ingredientId
    });
    const row = {
      recipe_id: recipeId,
      ingredient_id: ingredientId,
      section_name: link.section_name?.trim() || "Ingredienti",
      sort_order: link.sort_order,
      quantity: null,
      quantity_max: null,
      unit: null,
      quantity_text: link.quantity_text,
      preparation: null,
      notes: null,
      is_optional: false
    };
    if (existing) await updateOne(client, "recipe_ingredients", existing.id, row);
    else await insertOne(client, "recipe_ingredients", row);
    report.recipe_ingredients[existing ? "updated" : "created"] += 1;
  }

  for (const note of preview.payload.tasting_notes) {
    const recipeId = recipeByCode.get(note.recipe_code);
    if (!recipeId) throw new Error(`Ricetta mancante per tasting note ${note.recipe_code}.`);

    onProgress(`Test storico: ${note.recipe_code}`);
    const existing = await findOne(client, "tasting_notes", {
      recipe_id: recipeId,
      owner_user_id: ownerUserId,
      version_label: note.version_label
    });
    const outcome = ALLOWED_TASTING_OUTCOMES.has(note.outcome)
      ? note.outcome
      : note.is_certification_test
        ? "certified"
        : "repeat_with_changes";

    const row = {
      recipe_id: recipeId,
      owner_user_id: ownerUserId,
      tasted_at: note.tested_at ? `${note.tested_at}T12:00:00Z` : new Date().toISOString(),
      version_label: note.version_label?.trim() || null,
      outcome,
      overall_rating: note.overall_rating,
      flavor_rating: null,
      texture_rating: null,
      appearance_rating: null,
      aroma_rating: null,
      would_make_again: note.would_make_again,
      is_certification_test: Boolean(note.is_certification_test),
      general_notes: note.general_notes,
      flavor_notes: null,
      texture_notes: null,
      appearance_notes: null,
      aroma_notes: null,
      family_feedback: null,
      child_feedback: null,
      changes_made: asJsonArray(note.changes_made),
      next_adjustments: asJsonArray(note.next_adjustments),
      recipe_snapshot: asJsonObject(note.recipe_snapshot)
    };
    if (existing) await updateOne(client, "tasting_notes", existing.id, row);
    else await insertOne(client, "tasting_notes", row);
    report.tasting_notes[existing ? "updated" : "created"] += 1;
  }

  return { owner_user_id: ownerUserId, report, preview_counts: preview.counts };
}
