(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CucinaHubNutritionGuidance = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const escape = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  function seasonal(date) {
    const month = Number(date.slice(5, 7));
    if (month >= 3 && month <= 5) return "Fragole, arance, ciliegie, albicocche, mele e pere";
    if (month >= 6 && month <= 8) return "Albicocche, pesche, prugne, anguria, melone e fichi";
    if (month >= 9 && month <= 11) return "Cachi, mele, pere, melograno, uva e kiwi";
    return "Kiwi, mandarini, arance, mele, pere e pompelmo";
  }
  function scope(alternative, meal) {
    const label = alternative.label || "";
    const target = /^Solo\s+(.+?)\s*[—:]/i.exec(label);
    if (target) return `Sostituisce solo: ${target[1]}. Il resto del pasto rimane invariato.`;
    if (/^Pasto completo\s*[—:]/i.test(label)) return "Sostituisce tutto il pasto, non si aggiunge al pasto principale.";
    const category = /^Alternativa\s+(frutta|carboidrati|proteine)\b/i.exec(label);
    if (category) return `Sostituisce solo la quota ${category[1].toLowerCase()}. Il resto del pasto rimane invariato.`;
    const single = alternative.components?.length === 1 && alternative.components[0];
    if (single && meal.components?.some(item => item.name.toLowerCase() === single.name.toLowerCase())) {
      return `Cambia solo: ${single.name}. Il resto del pasto rimane invariato.`;
    }
    return "Ambito non specificato nel piano: non è indicato se sostituisce tutto il pasto o un alimento. Da chiarire prima di usarla.";
  }
  function early(alternative) {
    return /allenamento.*(?:entro|mattin|presto)|(?:entro|mattin|presto).*allenamento/i.test(`${alternative.label || ""} ${alternative.note || ""}`);
  }
  function alternatives(meal, quantity) {
    if (!meal.alternatives?.length) return "";
    return `<details class="nutrition-options"><summary>Alternative (${meal.alternatives.length})</summary>${meal.alternatives.map(item => `<div class="nutrition-option"><strong>${escape(item.label)}</strong><p>${escape(scope(item, meal))}</p><ul>${item.components.map(component => `<li>${escape(component.name)}${quantity(component) ? ` · ${escape(quantity(component))}` : ""}${component.note ? `<p>${escape(component.note)}</p>` : ""}</li>`).join("")}</ul>${item.recipe_ref ? `<p>Ricetta: ${escape(item.recipe_ref.code)}</p>` : ""}${item.note ? `<p>${escape(item.note)}</p>` : ""}</div>`).join("")}</details>`;
  }
  function daily(packet, date, quantity) {
    const day = packet.days.find(item => item.date === date);
    if (!day) return "";
    const fruit = packet.shopping_list.categories.find(item => item.key === "fruit")?.items || [];
    const breakfast = day.meals.find(item => item.slot === "breakfast");
    const morning = breakfast?.alternatives?.filter(early) || [];
    return `<section class="nutrition-guidance"><h3>Indicazioni del piano</h3><div class="nutrition-option"><h4>Alcol · facoltativo</h4>${day.alcohol ? `<p>${escape(day.alcohol.label)}${quantity(day.alcohol) ? ` · ${escape(quantity(day.alcohol))}` : ""}</p>${day.alcohol.note ? `<p>${escape(day.alcohol.note)}</p>` : ""}` : "<p>Nessuna opzione alcol indicata per questo giorno.</p>"}</div><details class="nutrition-options"><summary>Frutta e stagionalità</summary><p>Idee di stagione: ${escape(seasonal(date))}.</p><p>Preferenze indicative per il clima mediterraneo, variabili per zona e periodo. <a href="https://agriculture.ec.europa.eu/farming/crops/fruit-and-vegetables/calendar_it" target="_blank" rel="noopener noreferrer">Calendario UE</a>.</p><p>Frutta prevista nella settimana: ${fruit.length ? fruit.map(item => escape(item.name)).join(", ") : "nessun elenco specifico pubblicato"}.</p><p>Per le porzioni segui il pasto. Questo elenco non rende automaticamente equivalenti frutti o quantità diverse.</p></details>${day.training ? `<details class="nutrition-options"><summary>Colazione se ti alleni presto</summary>${morning.length ? morning.map(item => `<div class="nutrition-option"><strong>${escape(item.label)}</strong><p>${escape(scope(item, breakfast))}</p><ul>${item.components.map(component => `<li>${escape(component.name)} · ${escape(quantity(component))}</li>`).join("")}</ul>${item.note ? `<p>${escape(item.note)}</p>` : ""}</div>`).join("") : "<p>Non è stata pubblicata una colazione specifica per l’allenamento mattutino in questo giorno. Va definita nel prossimo aggiornamento del piano, indicando cosa mangiare prima e dopo.</p>"}</details>` : ""}</section>`;
  }
  return Object.freeze({ scope, early, alternatives, daily, seasonal });
});
