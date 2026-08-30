"use strict";

const client = window.cucinaHubSupabase;
const core = window.CucinaHubNotificationsCore;

const state = {
  ownerUserId: null,
  preferences: core.normalizePreferences(),
  meals: [],
  tasks: [],
  recipes: [],
  receipts: [],
  notifications: [],
  filter: "active",
  busy: false
};

const elements = {
  status: document.querySelector("#notificationsStatus"),
  authGate: document.querySelector("#authGate"),
  missingMigration: document.querySelector("#missingMigration"),
  errorPanel: document.querySelector("#errorPanel"),
  errorMessage: document.querySelector("#errorMessage"),
  workspace: document.querySelector("#notificationsWorkspace"),
  retryLoad: document.querySelector("#retryLoad"),
  retryError: document.querySelector("#retryError"),
  mealsEnabled: document.querySelector("#mealsEnabled"),
  mealLeadMinutes: document.querySelector("#mealLeadMinutes"),
  mealPrepEnabled: document.querySelector("#mealPrepEnabled"),
  mealPrepLeadMinutes: document.querySelector("#mealPrepLeadMinutes"),
  savePreferences: document.querySelector("#savePreferences"),
  enableSystemNotifications: document.querySelector("#enableSystemNotifications"),
  systemHelp: document.querySelector("#systemHelp"),
  unreadCount: document.querySelector("#unreadCount"),
  upcomingCount: document.querySelector("#upcomingCount"),
  missingTimeCount: document.querySelector("#missingTimeCount"),
  markAllRead: document.querySelector("#markAllRead"),
  list: document.querySelector("#notificationList"),
  filters: Array.from(document.querySelectorAll("[data-filter]"))
};

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(message = "", type = "") {
  elements.status.textContent = message;
  elements.status.className = `notifications-status${type ? ` ${type}` : ""}`;
}

function assertOk(error, context) {
  if (!error) return;
  const wrapped = new Error(`${context}: ${error.message}`);
  wrapped.code = error.code;
  throw wrapped;
}

function isMissingNotifications(error) {
  return ["42P01", "PGRST204", "PGRST205"].includes(error?.code)
    || /planner_notification_(preferences|states)|schema cache|could not find the table/i.test(error?.message || "");
}

function isoDate(date) {
  const copy = new Date(date);
  const year = copy.getFullYear();
  const month = String(copy.getMonth() + 1).padStart(2, "0");
  const day = String(copy.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

function leadLabel(minutes) {
  if (minutes === 0) return "all’orario previsto";
  if (minutes === 1440) return "1 giorno prima";
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} ${minutes === 60 ? "ora" : "ore"} prima`;
  return `${minutes} minuti prima`;
}

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

function missingTimesCount() {
  const mealCount = state.preferences.meals_enabled
    ? state.meals.filter(meal => !meal.planned_time).length
    : 0;
  const prepCount = state.preferences.meal_prep_enabled
    ? state.tasks.filter(task => task.status !== "done" && !task.scheduled_time).length
    : 0;
  return mealCount + prepCount;
}

function syncForm() {
  elements.mealsEnabled.checked = state.preferences.meals_enabled;
  elements.mealLeadMinutes.value = String(state.preferences.meal_lead_minutes);
  elements.mealPrepEnabled.checked = state.preferences.meal_prep_enabled;
  elements.mealPrepLeadMinutes.value = String(state.preferences.meal_prep_lead_minutes);
}

function updateSystemHelp() {
  const supported = "Notification" in window && "serviceWorker" in navigator;
  if (!supported) {
    elements.systemHelp.textContent = "Gli avvisi di sistema non sono supportati da questo browser.";
    elements.enableSystemNotifications.disabled = true;
    elements.enableSystemNotifications.textContent = "NON DISPONIBILE";
    return;
  }
  elements.enableSystemNotifications.disabled = false;
  const permission = Notification.permission;
  if (permission === "granted" && state.preferences.system_notifications_enabled) {
    elements.systemHelp.textContent = isStandalone()
      ? "Attivi. Gli avvisi vengono mostrati quando Cucina Hub controlla i promemoria."
      : "Permesso attivo. Su iPhone apri Cucina Hub dalla schermata Home.";
    elements.enableSystemNotifications.textContent = "DISATTIVA";
  } else if (permission === "denied") {
    elements.systemHelp.textContent = "Permesso negato. Puoi riattivarlo dalle impostazioni del dispositivo.";
    elements.enableSystemNotifications.textContent = "BLOCCATO";
    elements.enableSystemNotifications.disabled = true;
  } else {
    elements.systemHelp.textContent = isStandalone()
      ? "Tocca Attiva per autorizzare gli avvisi di sistema."
      : "Su iPhone aggiungi prima Cucina Hub alla schermata Home.";
    elements.enableSystemNotifications.textContent = "ATTIVA";
  }
}

function filteredNotifications() {
  const groups = core.groupNotifications(state.notifications);
  if (state.filter === "due") return groups.due.filter(item => item.unread);
  if (state.filter === "upcoming") return groups.upcoming;
  if (state.filter === "dismissed") return groups.dismissed;
  return [...groups.due, ...groups.upcoming];
}

function cardHtml(item) {
  const icon = item.source_type === "planned_meal" ? "🍽️" : "🧰";
  const stateLabel = item.status === "read" ? "Letta" : item.due ? "Da leggere" : "In arrivo";
  const stateActions = item.status === "dismissed"
    ? `<button class="button secondary" type="button" data-action="unread" data-source-type="${item.source_type}" data-source-id="${item.source_id}">RIPRISTINA</button>`
    : `${item.status !== "read"
      ? `<button class="button secondary" type="button" data-action="read" data-source-type="${item.source_type}" data-source-id="${item.source_id}">LETTA</button>`
      : `<button class="button secondary" type="button" data-action="unread" data-source-type="${item.source_type}" data-source-id="${item.source_id}">RIPRISTINA</button>`}
      <button class="button secondary" type="button" data-action="dismissed" data-source-type="${item.source_type}" data-source-id="${item.source_id}">IGNORA</button>`;
  return `<article class="notification-card${item.due ? " is-due" : ""}${item.status === "read" ? " is-read" : ""}">
    <span class="notification-icon" aria-hidden="true">${icon}</span>
    <div class="notification-copy">
      <div class="notification-meta"><span>${escapeHtml(item.kind_label)}</span><span>${escapeHtml(stateLabel)}</span></div>
      <h3>${escapeHtml(item.title)}</h3>
      <div class="notification-meta">
        <span>${escapeHtml(formatDateTime(item.event_at))}</span>
        <span>Avviso ${escapeHtml(leadLabel(item.lead_minutes))}</span>
      </div>
      <div class="notification-actions-row">
        <a class="button secondary" href="${escapeHtml(item.href)}">APRI</a>
        ${stateActions}
      </div>
    </div>
  </article>`;
}

function render() {
  state.notifications = core.buildNotifications({
    meals: state.meals,
    tasks: state.tasks,
    states: state.receipts,
    preferences: state.preferences,
    recipes: state.recipes
  });
  const groups = core.groupNotifications(state.notifications);
  elements.unreadCount.textContent = core.unreadCount(state.notifications);
  elements.upcomingCount.textContent = groups.upcoming.length;
  elements.missingTimeCount.textContent = missingTimesCount();
  const visible = filteredNotifications();
  elements.list.innerHTML = visible.length
    ? visible.map(cardHtml).join("")
    : '<div class="notification-empty">Nessun promemoria in questa sezione.</div>';
  elements.filters.forEach(button => button.classList.toggle("is-active", button.dataset.filter === state.filter));
  syncForm();
  updateSystemHelp();
  updateBadge();
}

async function updateBadge() {
  if (!("setAppBadge" in navigator)) return;
  const count = core.unreadCount(state.notifications);
  try {
    if (count) await navigator.setAppBadge(count);
    else if ("clearAppBadge" in navigator) await navigator.clearAppBadge();
  } catch (_error) {
    // Il badge è un miglioramento progressivo: il centro interno resta operativo.
  }
}

async function currentUser() {
  const access = await window.CucinaHubAuthGuard.requireAdministrator(client);
  return access.user;
}

async function ensurePreferences(userId, row) {
  if (row) return core.normalizePreferences(row);
  const defaults = {
    owner_user_id: userId,
    ...core.DEFAULT_PREFERENCES,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Rome"
  };
  const { data, error } = await client
    .from("planner_notification_preferences")
    .insert(defaults)
    .select()
    .single();
  assertOk(error, "Creazione preferenze");
  return core.normalizePreferences(data);
}

async function loadNotifications() {
  if (state.busy) return;
  state.busy = true;
  elements.authGate.hidden = true;
  elements.missingMigration.hidden = true;
  elements.errorPanel.hidden = true;
  setStatus("Caricamento notifiche…");
  try {
    const user = await currentUser();
    if (!user) {
      elements.authGate.hidden = false;
      elements.workspace.hidden = true;
      setStatus("Accedi a Cucina Hub per vedere le notifiche.", "warning");
      return;
    }
    state.ownerUserId = user.id;
    const now = new Date();
    const start = isoDate(shiftDays(now, -1));
    const end = isoDate(shiftDays(now, 14));
    const [preferencesResult, recipesResult, mealsResult, tasksResult, statesResult] = await Promise.all([
      client.from("planner_notification_preferences").select("*").eq("owner_user_id", user.id).maybeSingle(),
      client.from("recipes").select("id,title,code").eq("owner_user_id", user.id),
      client.from("planned_meals")
        .select("id,recipe_id,planned_date,meal_slot,planned_time,updated_at,planned_meal_items(item_type,label,recipe_code,position)")
        .eq("owner_user_id", user.id)
        .gte("planned_date", start)
        .lte("planned_date", end),
      client.from("meal_prep_tasks")
        .select("id,title,scheduled_date,scheduled_time,status,updated_at")
        .eq("owner_user_id", user.id)
        .gte("scheduled_date", start)
        .lte("scheduled_date", end),
      client.from("planner_notification_states").select("*").eq("owner_user_id", user.id)
    ]);
    if (preferencesResult.error && isMissingNotifications(preferencesResult.error)) {
      elements.missingMigration.hidden = false;
      elements.workspace.hidden = true;
      setStatus("La base dati delle notifiche non è ancora disponibile.", "warning");
      return;
    }
    assertOk(preferencesResult.error, "Lettura preferenze");
    assertOk(recipesResult.error, "Lettura ricette");
    assertOk(mealsResult.error, "Lettura pasti");
    assertOk(tasksResult.error, "Lettura Meal Prep");
    assertOk(statesResult.error, "Lettura stati notifiche");

    state.preferences = await ensurePreferences(user.id, preferencesResult.data);
    state.recipes = recipesResult.data || [];
    state.meals = mealsResult.data || [];
    state.tasks = tasksResult.data || [];
    state.receipts = statesResult.data || [];
    elements.workspace.hidden = false;
    render();
    await showDueSystemNotifications();
    setStatus(`Notifiche aggiornate: ${core.unreadCount(state.notifications)} da leggere.`, "success");
  } catch (error) {
    elements.workspace.hidden = true;
    elements.errorPanel.hidden = false;
    elements.errorMessage.textContent = error.message || "Non è stato possibile caricare le notifiche.";
    setStatus("Errore durante il caricamento delle notifiche.", "error");
  } finally {
    state.busy = false;
  }
}

async function savePreferences() {
  const payload = core.normalizePreferences({
    meals_enabled: elements.mealsEnabled.checked,
    meal_lead_minutes: Number(elements.mealLeadMinutes.value),
    meal_prep_enabled: elements.mealPrepEnabled.checked,
    meal_prep_lead_minutes: Number(elements.mealPrepLeadMinutes.value),
    system_notifications_enabled: state.preferences.system_notifications_enabled,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || state.preferences.timezone
  });
  elements.savePreferences.disabled = true;
  try {
    const { data, error } = await client
      .from("planner_notification_preferences")
      .upsert({ owner_user_id: state.ownerUserId, ...payload }, { onConflict: "owner_user_id" })
      .select()
      .single();
    assertOk(error, "Salvataggio preferenze");
    state.preferences = core.normalizePreferences(data);
    render();
    setStatus("Preferenze notifiche salvate.", "success");
  } catch (error) {
    setStatus(error.message || "Salvataggio non riuscito.", "error");
  } finally {
    elements.savePreferences.disabled = false;
  }
}

function findNotification(sourceType, sourceId) {
  return state.notifications.find(item => item.source_type === sourceType && item.source_id === sourceId);
}

async function setNotificationState(item, status, additions = {}) {
  const payload = {
    owner_user_id: state.ownerUserId,
    ...core.statePayload(item, status),
    ...additions
  };
  const { data, error } = await client
    .from("planner_notification_states")
    .upsert(payload, { onConflict: "owner_user_id,source_type,source_id" })
    .select()
    .single();
  assertOk(error, "Aggiornamento notifica");
  const existingIndex = state.receipts.findIndex(row => row.id === data.id);
  if (existingIndex >= 0) state.receipts[existingIndex] = data;
  else state.receipts.push(data);
}

async function handleNotificationAction(button) {
  const item = findNotification(button.dataset.sourceType, button.dataset.sourceId);
  if (!item) return;
  button.disabled = true;
  try {
    await setNotificationState(item, button.dataset.action);
    render();
    setStatus("Stato della notifica aggiornato.", "success");
  } catch (error) {
    setStatus(error.message || "Aggiornamento non riuscito.", "error");
  } finally {
    button.disabled = false;
  }
}

async function markAllRead() {
  const unread = state.notifications.filter(item => item.due && item.unread);
  if (!unread.length) return;
  elements.markAllRead.disabled = true;
  try {
    for (const item of unread) await setNotificationState(item, "read");
    render();
    setStatus("Tutte le notifiche scadute sono state segnate come lette.", "success");
  } catch (error) {
    setStatus(error.message || "Aggiornamento non riuscito.", "error");
  } finally {
    elements.markAllRead.disabled = false;
  }
}

async function serviceWorkerRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("../sw.js");
}

async function toggleSystemNotifications() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
  try {
    let enabled = state.preferences.system_notifications_enabled;
    if (enabled) {
      enabled = false;
    } else {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        updateSystemHelp();
        setStatus("Permesso per gli avvisi di sistema non concesso.", "warning");
        return;
      }
      await serviceWorkerRegistration();
      enabled = true;
    }
    const { data, error } = await client
      .from("planner_notification_preferences")
      .update({ system_notifications_enabled: enabled })
      .eq("owner_user_id", state.ownerUserId)
      .select()
      .single();
    assertOk(error, "Aggiornamento avvisi di sistema");
    state.preferences = core.normalizePreferences(data);
    render();
    if (enabled) await showDueSystemNotifications();
    setStatus(enabled ? "Avvisi di sistema attivati." : "Avvisi di sistema disattivati.", "success");
  } catch (error) {
    setStatus(error.message || "Non è stato possibile cambiare gli avvisi di sistema.", "error");
  }
}

async function showDueSystemNotifications() {
  if (!state.preferences.system_notifications_enabled) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const registration = await serviceWorkerRegistration();
  if (!registration) return;
  for (const item of state.notifications.filter(notification => notification.should_notify)) {
    await registration.showNotification(item.kind_label, {
      body: core.notificationBody(item),
      icon: "../icon.svg",
      badge: "../icon.svg",
      tag: `cucina-hub-${item.source_type}-${item.source_id}`,
      data: { url: new URL(item.href, window.location.href).href }
    });
    await setNotificationState(item, "unread", { notified_at: new Date().toISOString() });
  }
  render();
}

elements.filters.forEach(button => button.addEventListener("click", () => {
  state.filter = button.dataset.filter;
  render();
}));
elements.list.addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  if (button) handleNotificationAction(button);
});
elements.savePreferences.addEventListener("click", savePreferences);
elements.enableSystemNotifications.addEventListener("click", toggleSystemNotifications);
elements.markAllRead.addEventListener("click", markAllRead);
elements.retryLoad.addEventListener("click", loadNotifications);
elements.retryError.addEventListener("click", loadNotifications);

loadNotifications();
