"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "workspace.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "planner.css"), "utf8");
const js = fs.readFileSync(path.join(__dirname, "planner.js"), "utf8");
const home = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

for (const stateId of [
  "pageStatus",
  "authGate",
  "errorPanel",
  "plannerWorkspace",
  "mealList",
  "weekGrid",
  "weekRange",
  "weekMealCount",
  "weekEmptySummary",
  "previousWeek",
  "currentWeek",
  "nextWeek",
  "shoppingListPanel",
  "shoppingListCount",
  "shoppingListActiveCount",
  "shoppingListCheckedCount",
  "shoppingListExcludedCount",
  "shoppingListStatus",
  "shoppingListUnavailable",
  "shoppingListBody",
  "shoppingListWeekRange",
  "refreshShoppingList",
  "shoppingListForm",
  "shoppingListFilter",
  "shoppingListItems",
  "mealPrepPanel",
  "mealPrepCount",
  "mealPrepTodoCount",
  "mealPrepProgressCount",
  "mealPrepDoneCount",
  "mealPrepStatus",
  "mealPrepUnavailable",
  "mealPrepBody",
  "mealPrepForm",
  "mealPrepList",
  "menuPlanInput",
  "menuPlanFile",
  "menuPlanFileStatus",
  "menuPreviewCount",
  "refreshMenuPreviews",
  "menuPreviewInbox",
  "stageMenuPlan",
  "analyzeMenuPlan",
  "clearMenuPlan",
  "menuPlanResult"
]) {
  assert.match(html, new RegExp(`id=["']${stateId}["']`));
}

for (const fieldId of ["plannedDate", "mealSlot", "plannedTime", "servings", "recipeId", "mealNote"]) {
  assert.match(html, new RegExp(`id=["']${fieldId}["']`));
}

for (const fieldId of [
  "shoppingItemName",
  "shoppingItemQuantity",
  "shoppingItemUnit",
  "shoppingItemCategory",
  "shoppingItemNote",
  "addShoppingItem"
]) {
  assert.match(html, new RegExp(`id=["']${fieldId}["']`));
}

for (const fieldId of [
  "mealPrepMealId",
  "mealPrepItemId",
  "mealPrepType",
  "mealPrepTaskTitle",
  "mealPrepDate",
  "mealPrepTime",
  "mealPrepServings",
  "mealPrepQuantity",
  "mealPrepUnit",
  "mealPrepStorage",
  "mealPrepStorageNote",
  "mealPrepNote"
]) {
  assert.match(html, new RegExp(`id=["']${fieldId}["']`));
}

assert.match(html, /aria-live="polite"/i);
assert.match(html, /planner-core\.js\?v=2/i);
assert.match(html, /meal-prep-core\.js\?v=1/i);
assert.match(html, /shopping-list-core\.js\?v=1/i);
assert.match(html, /planner\.css\?v=10/i);
assert.match(html, /menu-plan-import-engine\.js\?v=5/i);
assert.match(html, /planner\.js\?v=13/i);
assert.match(home, /href="planner\/index\.html\?v=14"/i);
assert.match(html, /href="calendar\.html\?v=3"/i);
assert.match(html, /href="index\.html\?v=14"/i);
assert.match(html, /data-planner-module="shopping-list"/i);
assert.match(html, /data-planner-module="meal-prep"/i);
assert.match(html, /data-planner-module="menu-package"/i);
assert.match(html, /data-planner-module="meal-plan"/i);
assert.match(js, /URLSearchParams\(window\.location\.search\).*get\("week"\)/i);
assert.match(js, /URLSearchParams\(window\.location\.search\).*get\("section"\)/i);
assert.match(js, /function applyWorkspaceSection\(\)/i);
assert.match(js, /querySelectorAll\("\[data-planner-module\]"\)/i);
assert.match(html, /accept="\.json,\.md,\.txt/i);
assert.match(html, /IMPORTA/i);
assert.match(css, /min-height:\s*48px/i);
assert.match(css, /@media \(max-width: 900px\)/i);
assert.match(css, /grid-template-columns:\s*repeat\(7,\s*minmax/i);
assert.match(css, /overflow-x:\s*auto/i);
assert.match(css, /\.week-day-add/i);
assert.match(css, /\.menu-import-panel/i);
assert.match(css, /\.menu-preview-inbox/i);
assert.match(css, /\.menu-preview-request/i);
assert.match(css, /\.menu-file-input::file-selector-button/i);
assert.match(css, /\.menu-idempotency/i);
assert.match(css, /\.menu-payload-hash/i);
assert.match(css, /\.menu-conflict-card/i);
assert.match(css, /\.menu-conflict-summary/i);
assert.match(css, /\.menu-conflict-resolution/i);
assert.match(css, /\.menu-full-preview/i);
assert.match(css, /\.menu-preview-day/i);
assert.match(css, /\.menu-preview-item/i);
assert.match(css, /\.menu-commit-panel/i);
assert.match(css, /\.menu-commit-button/i);
assert.match(css, /\.meal-item-list/i);
assert.match(css, /\.meal-prep-panel/i);
assert.match(css, /\.meal-prep-stats/i);
assert.match(css, /\.meal-prep-layout/i);
assert.match(css, /\.meal-prep-card/i);
assert.match(css, /\.meal-prep-actions/i);
assert.match(css, /\.shopping-list-panel/i);
assert.match(css, /\.shopping-list-stats/i);
assert.match(css, /\.shopping-list-layout/i);
assert.match(css, /\.shopping-list-item/i);
assert.match(css, /\.shopping-list-actions/i);
assert.match(js, /\.from\("recipes"\)/i);
assert.match(js, /\.from\("planned_meals"\)/i);
assert.match(js, /\.from\("meal_prep_tasks"\)/i);
assert.match(js, /\.from\("shopping_list_items"\)/i);
assert.match(js, /\.gte\("planned_date",\s*week\.startDate\)/i);
assert.match(js, /\.lte\("planned_date",\s*week\.endDate\)/i);
assert.match(js, /\.insert\(payload\)/i);
assert.match(js, /\.update\(payload\)/i);
assert.match(js, /\.delete\(\)/i);
assert.match(js, /CucinaHubAuthGuard\.requireAdministrator\(client\)/i);
assert.match(js, /owner_user_id:\s*state\.ownerUserId/i);
assert.match(js, /core\.weekForDate\(state\.weekAnchor/i);
assert.match(js, /function selectWeek\(anchorDate\)/i);
assert.match(js, /function prepareNewMeal\(plannedDate\)/i);
assert.match(js, /function prepareNewMealPrepTask\(mealId/i);
assert.match(js, /function renderMealPrep\(\)/i);
assert.match(js, /function saveMealPrepTask\(event\)/i);
assert.match(js, /function updateMealPrepTaskStatus\(taskId, nextStatus\)/i);
assert.match(js, /function deleteMealPrepTask\(taskId\)/i);
assert.match(js, /045_meal_prep_core\.sql/i);
assert.match(js, /function renderShoppingList\(\)/i);
assert.match(js, /function saveShoppingItem\(event\)/i);
assert.match(js, /function updateShoppingItemState\(itemId, action\)/i);
assert.match(js, /function deleteShoppingItem\(itemId\)/i);
assert.match(js, /client\.rpc\("refresh_weekly_shopping_list"/i);
assert.match(js, /046_shopping_list_core\.sql/i);
assert.match(js, /menuPlanEngine\.analyze\(elements\.menuInput\.value,\s*state\.recipes\)/i);
assert.match(js, /menuPlanEngine\.computePayloadHash\(result\.normalizedPacket\)/i);
assert.match(js, /menuPlanEngine\.analyzeIdempotency/i);
assert.match(js, /menuPlanEngine\.analyzeConflicts/i);
assert.match(js, /menuPlanEngine\.buildResolutionPlan/i);
assert.match(js, /menuPlanEngine\.buildMenuPreview/i);
assert.match(js, /menuPlanEngine\.buildCommitRequest/i);
assert.match(js, /client\.rpc\("commit_planner_menu_package"/i);
assert.match(js, /client\.functions\.invoke\("planner-menu-preview"/i);
assert.match(js, /\.from\("planner_menu_import_requests"\)/i);
assert.match(js, /client\.rpc\("update_planner_menu_preview_request"/i);
assert.match(js, /source\.type = chatgpt_project/i);
assert.match(js, /043_planner_menu_commit_runtime_fix\.sql/i);
assert.match(js, /Codice tecnico:/i);
assert.match(js, /p_confirmed:\s*true/i);
assert.match(js, /CONFERMA E SALVA MENU/i);
assert.match(js, /data-menu-action="commit"/i);
assert.match(js, /data-menu-conflict-id/i);
assert.match(js, /elements\.menuResult\.addEventListener\("change"/i);
assert.match(js, /elements\.menuResult\.addEventListener\("click"/i);
assert.match(js, /\.lte\("period_start",\s*packet\.menu\.period_end\)/i);
assert.match(js, /\.gte\("period_end",\s*packet\.menu\.period_start\)/i);
assert.match(js, /file\.size > maxBytes/i);
assert.match(js, /\.from\("planner_menu_packages"\)/i);
assert.match(js, /\.from\("planner_menu_packages"\)[\s\S]{0,180}\.select\(/i);
assert.doesNotMatch(js, /\.from\("planner_menu_packages"\)[\s\S]{0,500}\.(?:insert|update|delete)\(/i);
assert.match(js, /\.from\("planned_meal_items"\)/i);
assert.match(js, /\.from\("planned_meal_items"\)[\s\S]{0,180}\.select\(/i);
assert.doesNotMatch(js, /\.from\("planned_meal_items"\)[\s\S]{0,500}\.(?:insert|update|delete)\(/i);
assert.match(js, /planned_meal_items\(id,position,item_type,recipe_id,recipe_code,label,quantity,unit,note,source_item_key,is_user_modified\)/i);
assert.match(js, /migration 040_planner_core\.sql/i);

console.log("Planner UI settimanale: controlli statici superati.");
