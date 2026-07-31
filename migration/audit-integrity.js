"use strict";

function assertOk(error, context) {
  if (!error) return;
  const wrapped = new Error(`${context}: ${error.message}`);
  wrapped.code = error.code;
  wrapped.details = error.details;
  wrapped.hint = error.hint;
  throw wrapped;
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

async function readRows(client, table, columns) {
  const { data, error } = await client.from(table).select(columns);
  assertOk(error, `Lettura ${table}`);
  return data ?? [];
}

function duplicatesBy(rows, keyBuilder) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyBuilder(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));
}

function orphanCount(rows, field, validIds) {
  return rows.filter(row => !validIds.has(row[field])).length;
}

const EXPECTED_COUNTS = Object.freeze({
  recipes: 8,
  ingredients: 16,
  tags: 21,
  categories: 6,
  appliances: 11,
  tasting_notes: 8,
  recipe_ingredients: 38,
  recipe_categories: 8,
  recipe_tags: 30,
  recipe_appliances: 8,
  changelog_entries: 1
});

export async function runMigrationIntegrityAudit({ client, onProgress = () => {} }) {
  if (!client) throw new Error("Client Supabase non disponibile.");
  const ownerUserId = await ensureAdministrator(client);

  const tableSpecs = {
    recipes: "id,owner_user_id,code,title",
    ingredients: "id,owner_user_id,normalized_name,name",
    tags: "id,owner_user_id,name",
    categories: "id,owner_user_id,name",
    appliances: "id,owner_user_id,name",
    tasting_notes: "id,owner_user_id,recipe_id,version_label",
    recipe_ingredients: "recipe_id,ingredient_id",
    recipe_categories: "recipe_id,category_id",
    recipe_tags: "recipe_id,tag_id",
    recipe_appliances: "recipe_id,appliance_id",
    changelog_entries: "id,owner_user_id"
  };

  const rows = {};
  for (const [table, columns] of Object.entries(tableSpecs)) {
    onProgress(`Lettura ${table}…`);
    rows[table] = await readRows(client, table, columns);
  }

  const counts = Object.fromEntries(
    Object.entries(rows).map(([table, values]) => [table, values.length])
  );
  const countChecks = Object.fromEntries(
    Object.entries(EXPECTED_COUNTS).map(([table, expected]) => [table, {
      expected,
      actual: counts[table],
      pass: counts[table] === expected
    }])
  );

  const duplicates = {
    recipes: duplicatesBy(rows.recipes, row => `${row.owner_user_id}|${row.code}`),
    ingredients: duplicatesBy(rows.ingredients, row => `${row.owner_user_id}|${row.normalized_name}`),
    tags: duplicatesBy(rows.tags, row => `${row.owner_user_id}|${String(row.name).trim().toLowerCase()}`),
    categories: duplicatesBy(rows.categories, row => `${row.owner_user_id}|${String(row.name).trim().toLowerCase()}`),
    appliances: duplicatesBy(rows.appliances, row => `${row.owner_user_id}|${String(row.name).trim().toLowerCase()}`),
    recipe_ingredients: duplicatesBy(rows.recipe_ingredients, row => `${row.recipe_id}|${row.ingredient_id}`),
    recipe_categories: duplicatesBy(rows.recipe_categories, row => `${row.recipe_id}|${row.category_id}`),
    recipe_tags: duplicatesBy(rows.recipe_tags, row => `${row.recipe_id}|${row.tag_id}`),
    recipe_appliances: duplicatesBy(rows.recipe_appliances, row => `${row.recipe_id}|${row.appliance_id}`)
  };

  const recipeIds = new Set(rows.recipes.map(row => row.id));
  const ingredientIds = new Set(rows.ingredients.map(row => row.id));
  const categoryIds = new Set(rows.categories.map(row => row.id));
  const tagIds = new Set(rows.tags.map(row => row.id));
  const applianceIds = new Set(rows.appliances.map(row => row.id));

  const orphans = {
    tasting_notes_recipe: orphanCount(rows.tasting_notes, "recipe_id", recipeIds),
    recipe_ingredients_recipe: orphanCount(rows.recipe_ingredients, "recipe_id", recipeIds),
    recipe_ingredients_ingredient: orphanCount(rows.recipe_ingredients, "ingredient_id", ingredientIds),
    recipe_categories_recipe: orphanCount(rows.recipe_categories, "recipe_id", recipeIds),
    recipe_categories_category: orphanCount(rows.recipe_categories, "category_id", categoryIds),
    recipe_tags_recipe: orphanCount(rows.recipe_tags, "recipe_id", recipeIds),
    recipe_tags_tag: orphanCount(rows.recipe_tags, "tag_id", tagIds),
    recipe_appliances_recipe: orphanCount(rows.recipe_appliances, "recipe_id", recipeIds),
    recipe_appliances_appliance: orphanCount(rows.recipe_appliances, "appliance_id", applianceIds)
  };

  const ownerMismatches = Object.fromEntries(
    ["recipes", "ingredients", "tags", "categories", "appliances", "tasting_notes", "changelog_entries"]
      .map(table => [table, rows[table].filter(row => row.owner_user_id !== ownerUserId).length])
  );

  const failedCounts = Object.values(countChecks).filter(check => !check.pass).length;
  const duplicateGroups = Object.values(duplicates).reduce((sum, items) => sum + items.length, 0);
  const orphanRows = Object.values(orphans).reduce((sum, value) => sum + value, 0);
  const foreignOwnerRows = Object.values(ownerMismatches).reduce((sum, value) => sum + value, 0);

  return {
    generated_at: new Date().toISOString(),
    owner_user_id: ownerUserId,
    overall_pass: failedCounts === 0 && duplicateGroups === 0 && orphanRows === 0 && foreignOwnerRows === 0,
    summary: {
      failed_count_checks: failedCounts,
      duplicate_groups: duplicateGroups,
      orphan_rows: orphanRows,
      foreign_owner_rows: foreignOwnerRows,
      manuals_status: "blocked_until_storage_files_exist"
    },
    count_checks: countChecks,
    duplicates,
    orphans,
    owner_mismatches: ownerMismatches
  };
}
