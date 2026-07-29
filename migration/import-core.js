"use strict";

import { buildImportPreview } from "./import-preview.js";

function assertOk(error, context) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

async function findOne(client, table, filters) {
  let query = client.from(table).select("*").limit(1);
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }
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
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  assertOk(profileError, "Verifica profilo");
  if (profile?.role !== "admin") throw new Error("L’account non ha ruolo amministratore.");
  return user.id;
}

function recipeDbRow(row, ownerUserId) {
  return {
    owner_user_id: ownerUserId,
    code: row.code,
    title: row.title,
    status: row.status,
    description: row.description,
    method_summary: row.method_summary,
    yield_text: row.yield_text,
    instructions: row.instructions,
    preparation_requirements: row.preparation_requirements,
    practical_signals: row.practical_signals,
    tips: row.tips,
    variations: row.variations,
    substitutions: row.substitutions,
    meal_moments: row.meal_moments,
    nutrition_notes: row.nutrition_notes,
    personal_notes: row.personal_notes,
    source_type: row.source_type,
    source_reference: JSON.stringify(row.source_reference),
    is_favorite: row.is_favorite,
    last_cooked_at: row.last_cooked_at
  };
}

export async function importCoreArchive({ client, recipesData, appliancesData, categoriesData, onProgress = () => {} }) {
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
    recipes: { created: 0, updated: 0 },
    recipe_ingredients: { created: 0, updated: 0 },
    tasting_notes: { created: 0, updated: 0 },
    skipped_relations: ["categories", "tags", "appliances"]
  };

  const ingredientByNormalizedName = new Map();
  for (const ingredient of preview.payload.ingredients) {
    onProgress(`Ingrediente: ${ingredient.name}`);
    const existing = await findOne(client, "ingredients", {
      owner_user_id: ownerUserId,
      normalized_name: ingredient.normalized_name
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
    if (!recipeId || !ingredientId) throw new Error(`Relazione ingrediente incompleta per ${link.recipe_code}.`);

    onProgress(`Collegamento ingredienti: ${link.recipe_code}`);
    const existing = await findOne(client, "recipe_ingredients", {
      recipe_id: recipeId,
      ingredient_id: ingredientId
    });
    const row = {
      recipe_id: recipeId,
      ingredient_id: ingredientId,
      section_name: null,
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
    const row = {
      recipe_id: recipeId,
      owner_user_id: ownerUserId,
      tested_at: note.tested_at ? `${note.tested_at}T12:00:00Z` : new Date().toISOString(),
      version_label: note.version_label,
      outcome: note.outcome,
      overall_rating: note.overall_rating,
      flavor_rating: null,
      texture_rating: null,
      appearance_rating: null,
      aroma_rating: null,
      would_make_again: note.would_make_again,
      is_certification_test: note.is_certification_test,
      general_notes: note.general_notes,
      flavor_notes: null,
      texture_notes: null,
      appearance_notes: null,
      aroma_notes: null,
      family_feedback: null,
      child_feedback: null,
      changes_made: note.changes_made,
      next_adjustments: note.next_adjustments,
      recipe_snapshot: note.recipe_snapshot
    };
    if (existing) await updateOne(client, "tasting_notes", existing.id, row);
    else await insertOne(client, "tasting_notes", row);
    report.tasting_notes[existing ? "updated" : "created"] += 1;
  }

  return { owner_user_id: ownerUserId, report, preview_counts: preview.counts };
}
