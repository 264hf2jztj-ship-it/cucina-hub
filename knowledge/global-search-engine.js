"use strict";

(function exposeGlobalSearchEngine(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) root.CucinaHubGlobalSearchEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createGlobalSearchEngine() {
  const TYPE_DEFINITIONS = Object.freeze({
    knowledge_object: Object.freeze({ label: "Knowledge Object", icon: "🧠" }),
    recipe: Object.freeze({ label: "Ricetta", icon: "📖" }),
    manual: Object.freeze({ label: "Manuale", icon: "📄" }),
    course: Object.freeze({ label: "Corso", icon: "🎓" }),
    appliance: Object.freeze({ label: "Elettrodomestico", icon: "🔌" }),
    baking_session: Object.freeze({ label: "Sessione", icon: "🧪" })
  });

  const TAG_LINK_TARGETS = Object.freeze({
    knowledge_object: "knowledge_object_id",
    manual: "manual_id",
    course: "course_id",
    appliance: "appliance_id",
    baking_session: "baking_session_id"
  });

  const IGNORED_ROW_KEYS = new Set([
    "id",
    "owner_user_id",
    "created_at",
    "updated_at",
    "archived_at"
  ]);

  function normalizeText(value = "") {
    return String(value)
      .toLocaleLowerCase("it-IT")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function flattenText(value) {
    if (value == null) return "";
    if (["string", "number", "boolean"].includes(typeof value)) return String(value);
    if (Array.isArray(value)) return value.map(flattenText).filter(Boolean).join(" ");
    if (typeof value === "object") {
      return Object.values(value).map(flattenText).filter(Boolean).join(" ");
    }
    return "";
  }

  function searchableRowText(row = {}) {
    return Object.entries(row)
      .filter(([key]) => !IGNORED_ROW_KEYS.has(key) && !key.endsWith("_id"))
      .map(([, value]) => flattenText(value))
      .filter(Boolean)
      .join(" ");
  }

  function rows(value) {
    return Array.isArray(value) ? value : [];
  }

  function groupBy(items, key) {
    const groups = new Map();
    for (const item of rows(items)) {
      const value = item?.[key];
      if (!value) continue;
      if (!groups.has(value)) groups.set(value, []);
      groups.get(value).push(item);
    }
    return groups;
  }

  function relationMap(items, ownerKey, valueKey) {
    const values = new Map();
    for (const item of rows(items)) {
      const ownerId = item?.[ownerKey];
      const valueId = item?.[valueKey];
      if (!ownerId || !valueId) continue;
      if (!values.has(ownerId)) values.set(ownerId, new Set());
      values.get(ownerId).add(valueId);
    }
    return values;
  }

  function tagIdsByTarget(data) {
    const result = new Map();

    for (const link of rows(data.recipeTags)) {
      if (!link.recipe_id || !link.tag_id) continue;
      const key = `recipe:${link.recipe_id}`;
      if (!result.has(key)) result.set(key, new Set());
      result.get(key).add(link.tag_id);
    }

    for (const link of rows(data.tagLinks)) {
      if (!link.tag_id) continue;
      for (const [type, column] of Object.entries(TAG_LINK_TARGETS)) {
        if (!link[column]) continue;
        const key = `${type}:${link[column]}`;
        if (!result.has(key)) result.set(key, new Set());
        result.get(key).add(link.tag_id);
      }
    }

    return result;
  }

  function compactParts(parts) {
    return parts
      .map(value => String(value ?? "").trim())
      .filter(Boolean);
  }

  function truncate(value, maxLength = 190) {
    const text = String(value ?? "").trim().replace(/\s+/g, " ");
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 1).trimEnd()}…`;
  }

  function parseSourceReference(value) {
    if (value && typeof value === "object") return value;
    if (typeof value !== "string") return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function recipeHref(recipe) {
    const source = parseSourceReference(recipe.source_reference);
    const legacyId = source.legacy_id ?? recipe.legacy_id;
    const parameters = new URLSearchParams({ view: "recipes" });
    if (legacyId) parameters.set("recipe", legacyId);
    return `../index.html?${parameters.toString()}&v=14`;
  }

  function buildIndex(data = {}) {
    const tagById = new Map(rows(data.tags).map(tag => [tag.id, tag]));
    const targetTags = tagIdsByTarget(data);
    const ingredientsById = new Map(rows(data.ingredients).map(item => [item.id, item]));
    const ingredientsByRecipe = groupBy(data.recipeIngredients, "recipe_id");
    const courseContents = groupBy(data.courseContents, "course_id");
    const sessionNotes = groupBy(data.bakingSessionNotes, "session_id");
    const sessionEvaluations = groupBy(data.bakingSessionEvaluations, "session_id");
    const knowledgeObjectLinks = groupBy(data.knowledgeObjectLinks, "knowledge_object_id");
    const applianceManuals = relationMap(data.applianceManuals, "manual_id", "appliance_id");
    const recipesById = new Map(rows(data.recipes).map(item => [item.id, item]));
    const manualsById = new Map(rows(data.manuals).map(item => [item.id, item]));
    const coursesById = new Map(rows(data.courses).map(item => [item.id, item]));
    const appliancesById = new Map(rows(data.appliances).map(item => [item.id, item]));
    const sessionsById = new Map(rows(data.bakingSessions).map(item => [item.id, item]));

    function recipeIngredientBundle(recipeId) {
      const ingredientLinks = ingredientsByRecipe.get(recipeId) ?? [];
      const ingredientRows = ingredientLinks
        .map(link => ({ link, ingredient: ingredientsById.get(link.ingredient_id) }))
        .filter(item => item.ingredient);
      const text = ingredientRows.map(({ link, ingredient }) => compactParts([
        ingredient.name,
        ingredient.normalized_name,
        ingredient.aliases,
        ingredient.notes,
        link.quantity_text,
        link.section_name
      ]).join(" ")).join(" ");
      const preview = ingredientRows.slice(0, 4).map(({ ingredient }) => ingredient.name).join(" · ");
      return { text, preview };
    }

    function linkedSourceText(link) {
      if (link.recipe_id) {
        return compactParts([
          searchableRowText(recipesById.get(link.recipe_id)),
          recipeIngredientBundle(link.recipe_id).text
        ]).join(" ");
      }
      if (link.manual_id) return searchableRowText(manualsById.get(link.manual_id));
      if (link.course_id) {
        return compactParts([
          searchableRowText(coursesById.get(link.course_id)),
          (courseContents.get(link.course_id) ?? []).map(searchableRowText).join(" ")
        ]).join(" ");
      }
      if (link.appliance_id) return searchableRowText(appliancesById.get(link.appliance_id));
      if (link.baking_session_id) {
        return compactParts([
          searchableRowText(sessionsById.get(link.baking_session_id)),
          (sessionNotes.get(link.baking_session_id) ?? []).map(searchableRowText).join(" "),
          (sessionEvaluations.get(link.baking_session_id) ?? []).map(searchableRowText).join(" ")
        ]).join(" ");
      }
      return "";
    }

    function createItem({
      row,
      type,
      title,
      summary,
      meta,
      extraSearch = "",
      href,
      inheritedTagIds = []
    }) {
      const ownTagIds = targetTags.get(`${type}:${row.id}`) ?? new Set();
      const tagIds = [...new Set([...ownTagIds, ...inheritedTagIds])]
        .filter(tagId => tagById.has(tagId));
      const tagNames = tagIds.map(tagId => tagById.get(tagId).name).filter(Boolean);
      const safeTitle = String(title ?? "").trim() || `${TYPE_DEFINITIONS[type].label} senza titolo`;
      const safeSummary = truncate(summary || "Nessuna descrizione disponibile.");
      const searchText = normalizeText(compactParts([
        safeTitle,
        safeSummary,
        searchableRowText(row),
        extraSearch,
        tagNames.join(" ")
      ]).join(" "));

      return {
        id: row.id,
        type,
        typeLabel: TYPE_DEFINITIONS[type].label,
        icon: TYPE_DEFINITIONS[type].icon,
        title: safeTitle,
        summary: safeSummary,
        meta: truncate(meta, 150),
        href,
        tagIds,
        tagNames,
        titleSearch: normalizeText(safeTitle),
        tagSearch: normalizeText(tagNames.join(" ")),
        searchText,
        updatedAt: row.updated_at ?? row.created_at ?? null
      };
    }

    const index = [];

    for (const object of rows(data.knowledgeObjects)) {
      const links = knowledgeObjectLinks.get(object.id) ?? [];
      index.push(createItem({
        row: object,
        type: "knowledge_object",
        title: object.title,
        summary: object.description,
        meta: `${links.length} ${links.length === 1 ? "fonte collegata" : "fonti collegate"}`,
        extraSearch: links.map(linkedSourceText).join(" "),
        href: `index.html?object=${encodeURIComponent(object.id)}&v=3`
      }));
    }

    for (const recipe of rows(data.recipes)) {
      const ingredients = recipeIngredientBundle(recipe.id);

      index.push(createItem({
        row: recipe,
        type: "recipe",
        title: compactParts([recipe.code, recipe.title ?? recipe.name]).join(" — "),
        summary: recipe.description ?? recipe.method_summary,
        meta: compactParts([ingredients.preview, recipe.status]).join(" · "),
        extraSearch: ingredients.text,
        href: recipeHref(recipe)
      }));
    }

    for (const manual of rows(data.manuals)) {
      const applianceIds = [...(applianceManuals.get(manual.id) ?? [])];
      const applianceNames = applianceIds
        .map(applianceId => rows(data.appliances).find(item => item.id === applianceId)?.name)
        .filter(Boolean);

      index.push(createItem({
        row: manual,
        type: "manual",
        title: manual.title ?? manual.name,
        summary: manual.notes ?? manual.description,
        meta: compactParts([
          manual.manufacturer ?? manual.brand,
          manual.model ?? manual.model_number,
          applianceNames.join(", ")
        ]).join(" · "),
        extraSearch: applianceNames.join(" "),
        href: "../appliances/detail.html?v=23"
      }));
    }

    for (const course of rows(data.courses)) {
      const contents = courseContents.get(course.id) ?? [];
      const contentText = contents.map(searchableRowText).join(" ");
      const contentTypes = [...new Set(contents.map(item => item.content_type).filter(Boolean))];

      index.push(createItem({
        row: course,
        type: "course",
        title: course.title ?? course.name,
        summary: course.description,
        meta: compactParts([
          `${contents.length} ${contents.length === 1 ? "contenuto" : "contenuti"}`,
          contentTypes.join(", ")
        ]).join(" · "),
        extraSearch: contentText,
        href: `../courses/detail.html?course=${encodeURIComponent(course.id)}&v=2`
      }));
    }

    for (const appliance of rows(data.appliances)) {
      index.push(createItem({
        row: appliance,
        type: "appliance",
        title: appliance.name ?? appliance.title,
        summary: appliance.description ?? appliance.notes ?? appliance.model,
        meta: compactParts([appliance.brand, appliance.model]).join(" · "),
        href: `../appliances/detail.html?appliance=${encodeURIComponent(appliance.id)}&v=23`
      }));
    }

    for (const session of rows(data.bakingSessions)) {
      const notes = sessionNotes.get(session.id) ?? [];
      const evaluations = sessionEvaluations.get(session.id) ?? [];
      const extraSearch = [...notes, ...evaluations].map(searchableRowText).join(" ");
      const date = session.target_meal_at
        ? new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(new Date(session.target_meal_at))
        : "";

      index.push(createItem({
        row: session,
        type: "baking_session",
        title: session.title,
        summary: session.result_notes ?? session.learning_notes ?? session.product_style,
        meta: compactParts([date, session.status, `${notes.length} note`]).join(" · "),
        extraSearch,
        href: `../fermentation/baking-sessions.html?session=${encodeURIComponent(session.id)}&v=14`
      }));
    }

    return index.sort((left, right) => left.title.localeCompare(
      right.title,
      "it-IT",
      { sensitivity: "base" }
    ));
  }

  function scoreItem(item, normalizedQuery, tokens) {
    if (!normalizedQuery) return 0;

    let score = 0;
    if (item.titleSearch === normalizedQuery) score += 1000;
    else if (item.titleSearch.startsWith(normalizedQuery)) score += 700;
    else if (item.titleSearch.includes(normalizedQuery)) score += 450;

    if (item.searchText.includes(normalizedQuery)) score += 120;
    if (item.tagSearch.includes(normalizedQuery)) score += 100;

    for (const token of tokens) {
      if (item.titleSearch.includes(token)) score += 70;
      if (item.tagSearch.includes(token)) score += 45;
      if (item.searchText.includes(token)) score += 12;
    }

    return score;
  }

  function search(index, filters = {}) {
    const normalizedQuery = normalizeText(filters.query ?? "");
    const tokens = normalizedQuery ? normalizedQuery.split(" ").filter(Boolean) : [];
    const type = filters.type ?? "all";
    const tagId = filters.tagId ?? "all";

    return rows(index)
      .filter(item => type === "all" || item.type === type)
      .filter(item => tagId === "all" || item.tagIds.includes(tagId))
      .filter(item => !tokens.length || tokens.every(token => item.searchText.includes(token)))
      .map(item => ({ ...item, score: scoreItem(item, normalizedQuery, tokens) }))
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        const leftDate = Date.parse(left.updatedAt ?? "") || 0;
        const rightDate = Date.parse(right.updatedAt ?? "") || 0;
        if (rightDate !== leftDate) return rightDate - leftDate;
        return left.title.localeCompare(right.title, "it-IT", { sensitivity: "base" });
      });
  }

  return Object.freeze({
    TYPE_DEFINITIONS,
    buildIndex,
    flattenText,
    normalizeText,
    search
  });
});
