"use strict";

const assert = require("node:assert/strict");
const engine = require("./global-search-engine.js");

const fixture = {
  knowledgeObjects: [
    { id: "ko-1", title: "Pizza in teglia", description: "Tecnica e fonti personali" }
  ],
  knowledgeObjectLinks: [
    { knowledge_object_id: "ko-1", recipe_id: "recipe-1" }
  ],
  recipes: [
    {
      id: "recipe-1",
      code: "RC-101",
      title: "Focaccia croccante",
      description: "Impasto ad alta idratazione",
      source_reference: JSON.stringify({ legacy_id: "legacy-focaccia" })
    }
  ],
  manuals: [
    { id: "manual-1", title: "Manuale Hurom", notes: "Pulizia del filtro fine" }
  ],
  courses: [
    { id: "course-1", title: "Corso impasti", description: "Lezioni pratiche" }
  ],
  courseContents: [
    {
      id: "content-1",
      course_id: "course-1",
      title: "Fermentazione controllata",
      content_type: "video",
      metadata: { topic: "temperatura ambiente" }
    }
  ],
  appliances: [
    { id: "appliance-1", name: "Estrattore Hurom E30ST", description: "Succhi ed estratti" }
  ],
  bakingSessions: [
    {
      id: "session-1",
      title: "Test pizza serale",
      product_style: "roman_pan",
      target_meal_at: "2026-08-10T20:00:00Z"
    }
  ],
  bakingSessionNotes: [
    { id: "note-1", session_id: "session-1", note_text: "Impasto troppo freddo" }
  ],
  bakingSessionEvaluations: [],
  ingredients: [
    { id: "ingredient-1", name: "Farina tipo 0", aliases: ["farina forte"] }
  ],
  recipeIngredients: [
    { recipe_id: "recipe-1", ingredient_id: "ingredient-1", quantity_text: "500 g" }
  ],
  tags: [
    { id: "tag-pizza", name: "pizza" },
    { id: "tag-estratti", name: "estratti" }
  ],
  recipeTags: [
    { recipe_id: "recipe-1", tag_id: "tag-pizza" }
  ],
  tagLinks: [
    { tag_id: "tag-pizza", knowledge_object_id: "ko-1" },
    { tag_id: "tag-pizza", baking_session_id: "session-1" },
    { tag_id: "tag-estratti", appliance_id: "appliance-1" }
  ],
  applianceManuals: [
    { manual_id: "manual-1", appliance_id: "appliance-1" }
  ]
};

const index = engine.buildIndex(fixture);

assert.equal(index.length, 6, "indicizza i sei tipi di contenuto");
assert.equal(engine.normalizeText("Tè, caffè e crème"), "te caffe e creme");

const ingredientResults = engine.search(index, { query: "farina forte" });
assert.deepEqual(new Set(ingredientResults.map(item => item.type)), new Set(["knowledge_object", "recipe"]));
assert.match(ingredientResults.find(item => item.type === "recipe").href, /recipe=legacy-focaccia/);

const courseResults = engine.search(index, { query: "temperatura ambiente", type: "course" });
assert.deepEqual(courseResults.map(item => item.id), ["course-1"]);

const noteResults = engine.search(index, { query: "troppo freddo" });
assert.deepEqual(noteResults.map(item => item.id), ["session-1"]);

const pizzaTagResults = engine.search(index, { tagId: "tag-pizza" });
assert.deepEqual(
  new Set(pizzaTagResults.map(item => item.id)),
  new Set(["ko-1", "recipe-1", "session-1"])
);

const typeResults = engine.search(index, { type: "appliance" });
assert.deepEqual(typeResults.map(item => item.id), ["appliance-1"]);

console.log("Global Search Engine: 7 controlli superati.");
