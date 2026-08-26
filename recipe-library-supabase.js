"use strict";

(() => {
  let loadToken = 0;

  function normalizeName(value = "") {
    return String(value)
      .toLocaleLowerCase("it-IT")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function assertOk(error, context) {
    if (!error) return;
    const wrapped = new Error(`${context}: ${error.message}`);
    wrapped.code = error.code;
    throw wrapped;
  }

  function parseSourceReference(value) {
    if (!value) return {};
    if (typeof value === "object") return value;
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  function groupByRecipe(rows = []) {
    const grouped = new Map();
    rows.forEach(row => {
      const list = grouped.get(row.recipe_id) ?? [];
      list.push(row);
      grouped.set(row.recipe_id, list);
    });
    return grouped;
  }

  function legacyIngredient(row) {
    const quantity = row.quantity_text
      || (row.quantity != null
        ? `${row.quantity}${row.quantity_max != null ? `–${row.quantity_max}` : ""}${row.unit ? ` ${row.unit}` : ""}`
        : "");

    return {
      nome: row.ingredient?.name ?? "Ingrediente",
      quantita: quantity,
      preparazione: row.preparation ?? null,
      note: row.notes ?? null,
      ordine: row.sort_order ?? 0
    };
  }

  function categorySectionIds(categoryRows = []) {
    const byTitle = new Map((state.categories ?? []).map(item => [normalizeName(item.titolo), item.id]));
    return categoryRows
      .map(row => byTitle.get(normalizeName(row.category?.name)))
      .filter(Boolean);
  }

  function applianceLegacyIds(applianceRows = []) {
    const byName = new Map((state.appliances ?? []).map(item => [normalizeName(item.nome), item.id]));
    return applianceRows
      .map(row => byName.get(normalizeName(row.appliance?.name)))
      .filter(Boolean);
  }

  function iconForRecipe(source, sectionIds) {
    if (source.icon) return source.icon;
    const category = (state.categories ?? []).find(item => sectionIds.includes(item.id));
    return category?.icona ?? "🍽️";
  }

  function ratingForLegacy(tastingRows = []) {
    const value = tastingRows.find(item => item.overall_rating != null)?.overall_rating;
    if (value == null) return 0;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return numeric > 5 ? numeric / 2 : numeric;
  }

  function preparationSummary(requirements = []) {
    const rows = Array.isArray(requirements) ? requirements : [];
    const preferred = rows.find(item => item?.type === "preparazione_serale") ?? rows[0];
    return preferred?.text ?? null;
  }

  function mapRecipe(recipe, relations) {
    const ingredientRows = (relations.ingredients.get(recipe.id) ?? [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const categoryRows = (relations.categories.get(recipe.id) ?? [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const tagRows = relations.tags.get(recipe.id) ?? [];
    const applianceRows = (relations.appliances.get(recipe.id) ?? [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const tastingRows = (relations.tastings.get(recipe.id) ?? [])
      .slice()
      .sort((a, b) => String(b.tasted_at ?? "").localeCompare(String(a.tasted_at ?? "")));

    const sectionIds = categorySectionIds(categoryRows);
    const deviceIds = applianceLegacyIds(applianceRows);
    const source = parseSourceReference(recipe.source_reference);
    const primaryCategory = categoryRows.find(row => row.is_primary)?.category?.name
      ?? categoryRows[0]?.category?.name
      ?? recipe.description
      ?? "Ricetta";
    const primaryAppliance = applianceRows.find(row => row.usage_role === "primary") ?? applianceRows[0];

    return {
      id: recipe.id,
      codice: recipe.code ?? "",
      titolo: recipe.title,
      stato: recipe.status === "certified" ? "certificata" : "da-testare",
      categoria: primaryCategory,
      icona: iconForRecipe(source, sectionIds),
      resa: recipe.yield_text ?? null,
      filtro: primaryAppliance?.accessory_name ?? primaryAppliance?.program_name ?? source.filter ?? null,
      ingredienti: ingredientRows.map(legacyIngredient),
      procedimento: Array.isArray(recipe.instructions) ? recipe.instructions : [],
      preparazione_serale: preparationSummary(recipe.preparation_requirements),
      perche_funziona: recipe.method_summary ?? null,
      nutrienti: recipe.nutrition_notes ?? null,
      abbinamento: null,
      nota_degustatore: tastingRows[0]?.general_notes ?? recipe.personal_notes ?? null,
      valutazione_globale: ratingForLegacy(tastingRows),
      tags: tagRows.map(row => row.tag?.name).filter(Boolean),
      sezioni: [...new Set(sectionIds)],
      elettrodomestici: [...new Set(deviceIds)],
      source_reference: source,
      last_cooked_at: recipe.last_cooked_at ?? null
    };
  }

  async function loadRelations(client, recipeIds, userId) {
    if (!recipeIds.length) {
      return {
        ingredients: new Map(),
        categories: new Map(),
        tags: new Map(),
        appliances: new Map(),
        tastings: new Map()
      };
    }

    const [ingredients, categories, tags, appliances, tastings] = await Promise.all([
      client
        .from("recipe_ingredients")
        .select("recipe_id,sort_order,quantity,quantity_max,unit,quantity_text,preparation,notes,ingredient:ingredients(name)")
        .in("recipe_id", recipeIds),
      client
        .from("recipe_categories")
        .select("recipe_id,is_primary,sort_order,category:categories(name)")
        .in("recipe_id", recipeIds),
      client
        .from("recipe_tags")
        .select("recipe_id,tag:tags(name)")
        .in("recipe_id", recipeIds),
      client
        .from("recipe_appliances")
        .select("recipe_id,usage_role,sort_order,program_name,accessory_name,notes,appliance:appliances(name)")
        .in("recipe_id", recipeIds),
      client
        .from("tasting_notes")
        .select("recipe_id,overall_rating,general_notes,tasted_at")
        .eq("owner_user_id", userId)
        .in("recipe_id", recipeIds)
    ]);

    assertOk(ingredients.error, "Lettura ingredienti ricette");
    assertOk(categories.error, "Lettura categorie ricette");
    assertOk(tags.error, "Lettura tag ricette");
    assertOk(appliances.error, "Lettura elettrodomestici ricette");
    assertOk(tastings.error, "Lettura degustazioni ricette");

    return {
      ingredients: groupByRecipe(ingredients.data ?? []),
      categories: groupByRecipe(categories.data ?? []),
      tags: groupByRecipe(tags.data ?? []),
      appliances: groupByRecipe(appliances.data ?? []),
      tastings: groupByRecipe(tastings.data ?? [])
    };
  }

  function renderLoadingState() {
    if (state.currentView !== "recipes") return;
    renderRecipes();
    const count = document.querySelector("#resultCount");
    const grid = document.querySelector("#recipeGrid");
    if (count) count.textContent = "Caricamento ricette da Supabase…";
    if (grid) grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><span aria-hidden="true">⏳</span><h2>Caricamento ricette</h2><p>Sto leggendo la Biblioteca personale.</p></div>';
  }

  function renderLoadError(error) {
    if (state.currentView !== "recipes") return;
    renderRecipes();
    const count = document.querySelector("#resultCount");
    const grid = document.querySelector("#recipeGrid");
    if (count) count.textContent = "Ricette non disponibili";
    if (grid) grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><span aria-hidden="true">⚠️</span><h2>Non riesco a leggere la Biblioteca</h2><p>${escapeHtml(error.message)}</p></div>`;
  }

  async function loadRecipes(userId) {
    const token = ++loadToken;
    const client = window.cucinaHubSupabase;
    if (!client || !userId) return;

    state.recipes = [];
    renderLoadingState();

    try {
      const recipesResult = await client
        .from("recipes")
        .select("id,code,title,status,description,method_summary,yield_text,instructions,preparation_requirements,nutrition_notes,personal_notes,source_reference,last_cooked_at")
        .eq("owner_user_id", userId)
        .neq("status", "archived")
        .order("code", { ascending: true, nullsFirst: false })
        .order("title", { ascending: true });

      assertOk(recipesResult.error, "Lettura ricette");
      if (token !== loadToken) return;

      const recipes = recipesResult.data ?? [];
      const recipeIds = recipes.map(item => item.id);
      const relations = await loadRelations(client, recipeIds, userId);
      if (token !== loadToken) return;

      state.recipes = recipes.map(recipe => mapRecipe(recipe, relations));

      if (typeof renderView === "function") {
        renderView(state.currentView || "dashboard");
      }

      const requestedRecipe = new URLSearchParams(window.location.search).get("recipe");
      if (requestedRecipe && state.recipes.some(recipe => recipe.id === requestedRecipe) && typeof openRecipe === "function") {
        window.setTimeout(() => openRecipe(requestedRecipe), 0);
      }
    } catch (error) {
      console.error("Errore caricamento Biblioteca ricette:", error);
      if (token !== loadToken) return;
      state.recipes = [];
      renderLoadError(error);
    }
  }

  window.addEventListener("cucina-hub:authenticated", event => {
    void loadRecipes(event.detail?.userId);
  });
})();
