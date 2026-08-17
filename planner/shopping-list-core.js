"use strict";

(() => {
  const CATEGORIES = Object.freeze({
    produce: Object.freeze({ label: "Frutta e verdura", icon: "🥬", order: 10 }),
    protein: Object.freeze({ label: "Carne, pesce e proteine", icon: "🥩", order: 20 }),
    dairy: Object.freeze({ label: "Freschi e latticini", icon: "🥛", order: 30 }),
    bakery: Object.freeze({ label: "Pane e forno", icon: "🥖", order: 40 }),
    pantry: Object.freeze({ label: "Dispensa", icon: "🥫", order: 50 }),
    frozen: Object.freeze({ label: "Surgelati", icon: "❄️", order: 60 }),
    beverages: Object.freeze({ label: "Bevande", icon: "🧃", order: 70 }),
    household: Object.freeze({ label: "Casa", icon: "🧻", order: 80 }),
    other: Object.freeze({ label: "Altro", icon: "🛒", order: 90 })
  });

  const SOURCES = Object.freeze({
    manual: Object.freeze({ label: "Aggiunta manualmente", icon: "✍️" }),
    planner_food: Object.freeze({ label: "Alimento del Planner", icon: "🍎" }),
    planner_preparation: Object.freeze({ label: "Preparazione del Planner", icon: "🥣" }),
    planner_recipe: Object.freeze({ label: "Ricetta del Planner", icon: "📖" })
  });

  const FILTERS = Object.freeze({
    active: Object.freeze({ label: "Da comprare" }),
    checked: Object.freeze({ label: "Acquistati" }),
    excluded: Object.freeze({ label: "Esclusi" }),
    all: Object.freeze({ label: "Tutti" })
  });

  function cleanText(value) {
    return String(value ?? "").trim() || null;
  }

  function nullableNumber(value) {
    const raw = String(value ?? "").trim().replace(",", ".");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  function normalizeName(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("it-IT")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .slice(0, 200);
  }

  function normalizeManualItem(input = {}) {
    const name = String(input.name ?? "").trim();
    const quantity = nullableNumber(input.quantity);
    const unit = cleanText(input.unit);
    const category = String(input.category ?? "other").trim();
    const note = cleanText(input.note);
    const errors = [];

    if (!name) errors.push("Inserisci cosa devi comprare.");
    if (name.length > 200) errors.push("Il nome non può superare 200 caratteri.");
    if (Number.isNaN(quantity) || (quantity !== null && quantity <= 0)) {
      errors.push("La quantità deve essere un numero maggiore di zero.");
    }
    if ((quantity === null) !== (unit === null)) {
      errors.push("Quantità e unità devono essere compilate insieme.");
    }
    if (unit && unit.length > 40) errors.push("L’unità non può superare 40 caratteri.");
    if (!CATEGORIES[category]) errors.push("Scegli una categoria valida.");
    if (note && note.length > 1000) errors.push("La nota non può superare 1000 caratteri.");

    return {
      valid: errors.length === 0,
      errors,
      value: {
        name,
        normalized_name: normalizeName(name),
        quantity,
        unit,
        quantity_text: null,
        category,
        source_type: "manual",
        source_key: null,
        source_label: null,
        planned_meal_id: null,
        planned_meal_item_id: null,
        recipe_id: null,
        note,
        is_checked: false,
        is_excluded: false
      }
    };
  }

  function itemStatus(item = {}) {
    if (item.is_excluded) return "excluded";
    if (item.is_checked) return "checked";
    return "active";
  }

  function filterItems(items = [], filter = "active") {
    if (filter === "all") return [...items];
    const safeFilter = FILTERS[filter] ? filter : "active";
    return items.filter(item => itemStatus(item) === safeFilter);
  }

  function itemSortKey(item = {}) {
    const categoryOrder = CATEGORIES[item.category]?.order ?? 999;
    const statusOrder = { active: 10, checked: 20, excluded: 30 }[itemStatus(item)] ?? 999;
    return [
      String(categoryOrder).padStart(3, "0"),
      String(statusOrder).padStart(3, "0"),
      normalizeName(item.name),
      String(item.source_label ?? ""),
      String(item.created_at ?? ""),
      String(item.id ?? "")
    ].join("|");
  }

  function sortItems(items = []) {
    return [...items].sort((left, right) => itemSortKey(left).localeCompare(itemSortKey(right)));
  }

  function groupItemsByCategory(items = [], filter = "active") {
    const groups = [];
    for (const item of sortItems(filterItems(items, filter))) {
      const category = CATEGORIES[item.category] ? item.category : "other";
      const last = groups[groups.length - 1];
      if (!last || last.category !== category) {
        groups.push({ category, items: [item] });
      } else {
        last.items.push(item);
      }
    }
    return groups;
  }

  function summarizeItems(items = []) {
    return items.reduce((summary, item) => {
      summary.total += 1;
      summary[itemStatus(item)] += 1;
      if (item.source_type === "manual") summary.manual += 1;
      else summary.generated += 1;
      return summary;
    }, { total: 0, active: 0, checked: 0, excluded: 0, manual: 0, generated: 0 });
  }

  function formatQuantity(item = {}) {
    if (item.quantity !== null && item.quantity !== undefined && item.quantity !== "") {
      const parsed = Number(item.quantity);
      if (Number.isFinite(parsed)) {
        const quantity = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3 }).format(parsed);
        return `${quantity}${item.unit ? ` ${item.unit}` : ""}`;
      }
    }
    return cleanText(item.quantity_text);
  }

  const api = Object.freeze({
    CATEGORIES,
    FILTERS,
    SOURCES,
    filterItems,
    formatQuantity,
    groupItemsByCategory,
    itemStatus,
    normalizeManualItem,
    normalizeName,
    sortItems,
    summarizeItems
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.CucinaHubShoppingListCore = api;
})();
