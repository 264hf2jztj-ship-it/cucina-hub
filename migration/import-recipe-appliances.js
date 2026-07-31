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

export async function importRecipeAppliances({
  client,
  recipesData,
  appliancesData,
  categoriesData,
  ownerUserId,
  onProgress = () => {}
}) {
  const preview = buildImportPreview({ recipesData, appliancesData, categoriesData });
  const recipeByCode = new Map();
  const applianceBySlug = new Map();

  for (const recipe of preview.payload.recipes) {
    const existing = await findOne(client, "recipes", {
      owner_user_id: ownerUserId,
      code: recipe.code
    });
    if (!existing) throw new Error(`Ricetta non trovata per ${recipe.code}.`);
    recipeByCode.set(recipe.code, existing.id);
  }

  for (const appliance of preview.payload.appliances) {
    const existing = await findOne(client, "appliances", {
      owner_user_id: ownerUserId,
      name: appliance.name
    });
    if (!existing) throw new Error(`Elettrodomestico non trovato: ${appliance.name}.`);
    applianceBySlug.set(appliance.slug, existing.id);
  }

  const report = { created: 0, existing: 0 };
  for (const link of preview.payload.recipe_appliances) {
    const recipeId = recipeByCode.get(link.recipe_code);
    const applianceId = applianceBySlug.get(link.appliance_slug);
    if (!recipeId || !applianceId) {
      throw new Error(`Relazione elettrodomestico incompleta per ${link.recipe_code}.`);
    }

    const filters = {
      recipe_id: recipeId,
      appliance_id: applianceId
    };

    onProgress(`Collegamento elettrodomestico: ${link.recipe_code}`);
    const existing = await findOne(client, "recipe_appliances", filters);
    if (existing) {
      report.existing += 1;
      continue;
    }

    await insertOne(client, "recipe_appliances", filters);
    report.created += 1;
  }

  return report;
}
