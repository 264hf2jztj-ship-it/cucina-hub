"use strict";

export function normalizeText(value = "") {
  return String(value)
    .trim()
    .toLocaleLowerCase("it-IT")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueBy(items, keySelector) {
  const map = new Map();
  for (const item of items) {
    const key = keySelector(item);
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}

function deriveMealMoments(recipe) {
  const source = normalizeText([recipe.categoria, ...(recipe.tags ?? [])].join(" "));
  const moments = [];
  if (source.includes("colazione")) moments.push("colazione");
  if (source.includes("pomeriggio")) moments.push("pomeriggio");
  if (source.includes("post-corsa") || source.includes("post-corsa")) moments.push("post-corsa");
  return moments;
}

function buildRecipeRow(recipe) {
  const nutritionNotes = [
    recipe.nutrienti,
    recipe.abbinamento ? `Abbinamento: ${recipe.abbinamento}` : null
  ].filter(Boolean).join("\n\n") || null;

  return {
    legacy_id: recipe.id,
    code: recipe.codice,
    title: recipe.titolo,
    status: recipe.stato === "certificata" ? "certified" : "experiment",
    description: recipe.categoria ?? null,
    method_summary: recipe.perche_funziona ?? null,
    yield_text: recipe.resa ?? null,
    instructions: recipe.procedimento ?? [],
    preparation_requirements: recipe.preparazione_serale
      ? { preparazione_serale: recipe.preparazione_serale }
      : {},
    practical_signals: [],
    tips: [],
    variations: [],
    substitutions: [],
    meal_moments: deriveMealMoments(recipe),
    nutrition_notes: nutritionNotes,
    personal_notes: null,
    source_type: "legacy_json",
    source_reference: {
      legacy_id: recipe.id,
      icon: recipe.icona ?? null,
      filter: recipe.filtro ?? null
    },
    is_favorite: false,
    last_cooked_at: recipe.data_prova ?? null
  };
}

function buildTastingNote(recipe) {
  if (!recipe.nota_degustatore && !recipe.valutazione_globale && !recipe.data_prova) {
    return null;
  }

  return {
    recipe_code: recipe.codice,
    tested_at: recipe.data_prova ?? null,
    version_label: "Test storico 1",
    outcome: recipe.stato === "certificata" ? "approved" : "testing",
    overall_rating: recipe.valutazione_globale ?? null,
    would_make_again: recipe.stato === "certificata" ? true : null,
    is_certification_test: recipe.stato === "certificata",
    general_notes: recipe.nota_degustatore ?? null,
    changes_made: {},
    next_adjustments: {},
    recipe_snapshot: recipe
  };
}

export function buildImportPreview({ recipesData, appliancesData, categoriesData }) {
  const recipes = recipesData.ricette ?? [];

  const ingredients = uniqueBy(
    recipes.flatMap(recipe => (recipe.ingredienti ?? []).map(item => ({
      name: item.nome,
      normalized_name: normalizeText(item.nome),
      default_unit: null,
      aliases: [],
      notes: null,
      is_pantry_staple: false
    }))),
    item => item.normalized_name
  );

  const tags = uniqueBy(
    recipes.flatMap(recipe => (recipe.tags ?? []).map(name => ({
      name,
      slug: normalizeText(name)
    }))),
    item => item.slug
  );

  const categories = uniqueBy(
    [
      ...(categoriesData.categorie ?? []).map(item => ({
        legacy_id: item.id,
        name: item.titolo,
        slug: normalizeText(item.id || item.titolo)
      })),
      ...recipes.flatMap(recipe => (recipe.sezioni ?? []).map(id => ({
        legacy_id: id,
        name: id,
        slug: normalizeText(id)
      })))
    ],
    item => item.slug
  );

  const appliances = uniqueBy(
    [
      ...(appliancesData.elettrodomestici ?? []).map(item => ({
        legacy_id: item.id,
        name: item.nome,
        slug: normalizeText(item.id || item.nome)
      })),
      ...recipes.flatMap(recipe => (recipe.elettrodomestici ?? []).map(id => ({
        legacy_id: id,
        name: id,
        slug: normalizeText(id)
      })))
    ],
    item => item.slug
  );

  const recipeRows = recipes.map(buildRecipeRow);
  const tastingNotes = recipes.map(buildTastingNote).filter(Boolean);

  const recipeIngredients = recipes.flatMap(recipe =>
    (recipe.ingredienti ?? []).map((item, index) => ({
      recipe_code: recipe.codice,
      ingredient_normalized_name: normalizeText(item.nome),
      quantity_text: item.quantita ?? null,
      sort_order: index + 1
    }))
  );

  const recipeTags = recipes.flatMap(recipe =>
    (recipe.tags ?? []).map(name => ({
      recipe_code: recipe.codice,
      tag_slug: normalizeText(name)
    }))
  );

  const recipeCategories = recipes.flatMap(recipe =>
    (recipe.sezioni ?? []).map(id => ({
      recipe_code: recipe.codice,
      category_slug: normalizeText(id)
    }))
  );

  const recipeAppliances = recipes.flatMap(recipe =>
    (recipe.elettrodomestici ?? []).map((id, index) => ({
      recipe_code: recipe.codice,
      appliance_slug: normalizeText(id),
      is_primary: index === 0
    }))
  );

  const duplicateRecipeCodes = [...new Set(
    recipeRows
      .map(item => item.code)
      .filter((code, index, all) => all.indexOf(code) !== index)
  )];

  return {
    generated_at: new Date().toISOString(),
    counts: {
      recipes: recipeRows.length,
      ingredients: ingredients.length,
      tags: tags.length,
      categories: categories.length,
      appliances: appliances.length,
      tasting_notes: tastingNotes.length,
      recipe_ingredients: recipeIngredients.length,
      recipe_tags: recipeTags.length,
      recipe_categories: recipeCategories.length,
      recipe_appliances: recipeAppliances.length
    },
    warnings: {
      duplicate_recipe_codes: duplicateRecipeCodes,
      recipes_without_code: recipeRows.filter(item => !item.code).map(item => item.legacy_id),
      ingredients_without_name: ingredients.filter(item => !item.name)
    },
    payload: {
      recipes: recipeRows,
      ingredients,
      tags,
      categories,
      appliances,
      tasting_notes: tastingNotes,
      recipe_ingredients: recipeIngredients,
      recipe_tags: recipeTags,
      recipe_categories: recipeCategories,
      recipe_appliances: recipeAppliances
    }
  };
}
