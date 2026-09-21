(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CucinaHubWeberDiaryCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";

  const STATUS_LABELS = Object.freeze({ planned: "Pianificata", active: "In corso", completed: "Conclusa", cancelled: "Annullata" });
  const METHOD_LABELS = Object.freeze({ direct: "Diretta", indirect: "Indiretta", two_zone: "Due zone", snake: "Snake" });
  const FUEL_LABELS = Object.freeze({ briquettes: "Bricchetti", charcoal: "Carbonella", mixed: "Misto", other: "Altro" });
  const UNIT_LABELS = Object.freeze({ pieces: "pezzi", g: "g", kg: "kg", chimney: "cesti" });

  function clean(value, max = 4000) {
    const text = String(value ?? "").trim();
    return text ? text.slice(0, max) : null;
  }

  function numberOrNull(value) {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function validate(input = {}) {
    const errors = [];
    if (!clean(input.title, 180)) errors.push("Inserisci il titolo della sessione.");
    const cookedAt = clean(input.cooked_at, 40);
    if (!cookedAt || !Number.isFinite(new Date(cookedAt).getTime())) errors.push("Inserisci una data e ora valide.");
    if (!METHOD_LABELS[input.cooking_method]) errors.push("Seleziona il metodo di cottura.");
    if (!FUEL_LABELS[input.fuel_type]) errors.push("Seleziona il combustibile.");
    const amount = numberOrNull(input.fuel_amount);
    const unit = clean(input.fuel_unit, 20);
    if ((amount === null) !== (unit === null)) errors.push("Quantità e unità del combustibile devono essere compilate insieme.");
    if (amount !== null && amount <= 0) errors.push("La quantità di combustibile deve essere maggiore di zero.");
    for (const [key, label] of [["vent_bottom_percent", "Presa inferiore"], ["vent_top_percent", "Presa superiore"]]) {
      const value = numberOrNull(input[key]);
      if (value !== null && (value < 0 || value > 100)) errors.push(`${label}: usa un valore tra 0 e 100%.`);
    }
    const rating = numberOrNull(input.rating);
    if (rating !== null && (rating < 1 || rating > 5)) errors.push("La valutazione deve essere compresa tra 1 e 5.");
    for (const [key, label, min, max] of [
      ["target_grate_temp_c", "Temperatura obiettivo", 40, 450],
      ["peak_grate_temp_c", "Temperatura massima", 40, 450],
      ["food_core_temp_c", "Temperatura al cuore", 0, 150]
    ]) {
      const value = numberOrNull(input[key]);
      if (value !== null && (value < min || value > max)) errors.push(`${label}: usa un valore tra ${min} e ${max} °C.`);
    }
    const duration = numberOrNull(input.duration_minutes);
    if (duration !== null && duration <= 0) errors.push("La durata deve essere maggiore di zero.");
    return errors;
  }

  function payload(input = {}, ownerUserId, now = new Date()) {
    const errors = validate(input);
    if (errors.length) throw new Error(errors[0]);
    return {
      owner_user_id: ownerUserId,
      recipe_id: clean(input.recipe_id, 80),
      title: clean(input.title, 180),
      cooked_at: new Date(input.cooked_at).toISOString(),
      status: STATUS_LABELS[input.status] ? input.status : "planned",
      cooking_method: input.cooking_method,
      fuel_type: input.fuel_type,
      fuel_amount: numberOrNull(input.fuel_amount),
      fuel_unit: clean(input.fuel_unit, 20),
      ignition_method: clean(input.ignition_method, 300),
      vent_bottom_percent: numberOrNull(input.vent_bottom_percent),
      vent_top_percent: numberOrNull(input.vent_top_percent),
      target_grate_temp_c: numberOrNull(input.target_grate_temp_c),
      peak_grate_temp_c: numberOrNull(input.peak_grate_temp_c),
      food_core_temp_c: numberOrNull(input.food_core_temp_c),
      duration_minutes: numberOrNull(input.duration_minutes),
      rating: numberOrNull(input.rating),
      result_notes: clean(input.result_notes, 4000),
      next_change: clean(input.next_change, 2000),
      updated_at: now.toISOString()
    };
  }

  function filter(items = [], { status = "all", query = "" } = {}) {
    const needle = clean(query, 200)?.toLocaleLowerCase("it-IT") ?? "";
    return items.filter(item =>
      (status === "all" || item.status === status) &&
      (!needle || [item.title, item.result_notes, item.next_change, item.recipe_title]
        .some(value => String(value ?? "").toLocaleLowerCase("it-IT").includes(needle)))
    );
  }

  function summary(items = []) {
    const completed = items.filter(item => item.status === "completed");
    const rated = completed.filter(item => Number.isFinite(Number(item.rating)));
    return {
      total: items.length,
      planned: items.filter(item => item.status === "planned").length,
      active: items.filter(item => item.status === "active").length,
      completed: completed.length,
      averageRating: rated.length ? (rated.reduce((sum, item) => sum + Number(item.rating), 0) / rated.length).toFixed(1) : "—"
    };
  }

  return { STATUS_LABELS, METHOD_LABELS, FUEL_LABELS, UNIT_LABELS, clean, numberOrNull, validate, payload, filter, summary };
});
