"use strict";

import { buildImportPreview } from "./import-preview.js";

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
  const { error } = await client.from(table).insert(row);
  assertOk(error, `Inserimento ${table}`);
}

export async function importRecipeTags({
  client,
  recipesData,
  appliancesData,
  categoriesData,
  ownerUserId,
  onProgress = () => {}
}) {
  const preview = buildImportPreview({ recipesData, appliancesData, categoriesData });
  const recipeByCode = new Map();
  const tagBySlug = new Map();

  for (const recipe of preview.payload.recipes) {
    const existing = await findOne(client, "recipes", {
      owner_user_id: ownerUserId,
      code: recipe.code
    });
    if (!existing) throw new Error(`Ricetta non trovata per ${recipe.code}.`);
    recipeByCode.set(recipe.code, existing.id);
  }

  for (const tag of preview.payload.tags) {
    const existing = await findOne(client, "tags", {
      owner_user_id: ownerUserId,
      name: tag.name
    });
    if (!existing) throw new Error(`Tag non trovato: ${tag.name}.`);
    tagBySlug.set(tag.slug, existing.id);
  }

  const report = { created: 0, existing: 0 };
  for (const link of preview.payload.recipe_tags) {
    const recipeId = recipeByCode.get(link.recipe_code);
    const tagId = tagBySlug.get(link.tag_slug);
    if (!recipeId || !tagId) {
      throw new Error(`Relazione tag incompleta per ${link.recipe_code}.`);
    }

    onProgress(`Collegamento tag: ${link.recipe_code}`);
    const existing = await findOne(client, "recipe_tags", {
      recipe_id: recipeId,
      tag_id: tagId
    });
    if (existing) {
      report.existing += 1;
      continue;
    }

    await insertOne(client, "recipe_tags", {
      recipe_id: recipeId,
      tag_id: tagId
    });
    report.created += 1;
  }

  return report;
}
