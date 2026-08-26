"use strict";

(() => {
  const core = window.CucinaHubDashboardCore;
  const notificationCore = window.CucinaHubNotificationsCore;
  const client = window.cucinaHubSupabase;
  let busy = false;

  function escapeHtml(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function dateLabel(value) {
    return new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short" })
      .format(new Date(`${value}T12:00:00`));
  }

  function timeLabel(value) {
    return value ? String(value).slice(0, 5) : "Orario libero";
  }

  function isOptionalTableError(error) {
    return ["42P01", "PGRST204", "PGRST205"].includes(error?.code);
  }

  async function optional(query, fallback) {
    const result = await query;
    if (!result.error) return result.data ?? fallback;
    if (isOptionalTableError(result.error)) return fallback;
    throw result.error;
  }

  function setMetric(id, value, detail) {
    const metric = document.querySelector(`#${id}`);
    if (!metric) return;
    metric.querySelector(".metric-value").textContent = value;
    metric.querySelector(".metric-detail").textContent = detail;
  }

  function agendaHtml(item) {
    const when = `${item.overdue ? "In ritardo · " : ""}${dateLabel(item.date)} · ${timeLabel(item.time)}`;
    return `<a class="dashboard-agenda-item${item.overdue ? " is-overdue" : ""}" href="${escapeHtml(item.href)}">
      <span class="dashboard-agenda-icon" aria-hidden="true">${item.icon}</span>
      <span class="dashboard-agenda-copy"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(when)}</small></span>
      <span class="dashboard-agenda-arrow" aria-hidden="true">→</span>
    </a>`;
  }

  function render(data) {
    const nextMeal = document.querySelector("#dashboardNextMeal");
    const agenda = document.querySelector("#dashboardAgenda");
    const status = document.querySelector("#dashboardDataStatus");
    if (!nextMeal || !agenda || !status) return false;

    setMetric("dashboardMealMetric", data.todayMeals, data.todayMeals === 1 ? "pasto previsto oggi" : "pasti previsti oggi");
    setMetric("dashboardPrepMetric", data.prepDue, data.prepDue === 1 ? "preparazione da completare" : "preparazioni da completare");
    setMetric("dashboardShoppingMetric", data.shoppingOpen, "voci ancora da comprare");
    setMetric("dashboardNotificationMetric", data.notificationsUnread, "avvisi da leggere");

    nextMeal.innerHTML = data.nextMeal
      ? `<div><div class="big-icon" aria-hidden="true">🍽️</div><p class="eyebrow">Prossimo pasto</p><h3>${escapeHtml(data.nextMeal.title)}</h3><p>${escapeHtml(dateLabel(data.nextMeal.planned_date))} · ${escapeHtml(timeLabel(data.nextMeal.planned_time))}</p></div><a class="button secondary" href="${escapeHtml(core.plannerHref("meal-plan", data.nextMeal.planned_date, data.nextMeal.planned_date))}">APRI PASTO</a>`
      : '<div><div class="big-icon" aria-hidden="true">🍽️</div><p class="eyebrow">Prossimo pasto</p><h3>Nessun pasto pianificato</h3><p>Puoi aggiungerlo direttamente dal Planner Hub.</p></div><a class="button secondary" href="planner/index.html?v=14">PIANIFICA</a>';

    agenda.innerHTML = data.agenda.length
      ? data.agenda.map(agendaHtml).join("")
      : '<div class="dashboard-agenda-empty"><span aria-hidden="true">✅</span><strong>Nessun impegno nei prossimi giorni</strong><p>Pasti e preparazioni compariranno qui automaticamente.</p></div>';
    status.textContent = "Dashboard aggiornata dai tuoi dati personali.";
    status.className = "dashboard-data-status success";
    return true;
  }

  async function load() {
    if (busy || !client || !core || !notificationCore || !document.querySelector("#dashboardAgenda")) return;
    busy = true;
    const status = document.querySelector("#dashboardDataStatus");
    if (status) {
      status.textContent = "Aggiornamento del riepilogo personale…";
      status.className = "dashboard-data-status";
    }
    try {
      const auth = await client.auth.getSession();
      if (auth.error) throw auth.error;
      const user = auth.data.session?.user;
      if (!user) return;
      const today = core.dateValue();
      const start = core.addDays(today, -1);
      const end = core.addDays(today, 14);
      const weekStart = core.mondayFor(today);
      const [recipesResult, mealsResult, tasksResult, shopping, preferences, states] = await Promise.all([
        client.from("recipes").select("id,code,title").eq("owner_user_id", user.id),
        client.from("planned_meals")
          .select("id,recipe_id,planned_date,meal_slot,planned_time,updated_at,planned_meal_items(label,recipe_code,position)")
          .eq("owner_user_id", user.id).gte("planned_date", start).lte("planned_date", end).order("planned_date").order("planned_time"),
        client.from("meal_prep_tasks")
          .select("id,title,scheduled_date,scheduled_time,status,updated_at")
          .eq("owner_user_id", user.id).neq("status", "done").lte("scheduled_date", end).order("scheduled_date").order("scheduled_time").limit(100),
        optional(client.from("shopping_list_items").select("id,is_checked,is_excluded").eq("owner_user_id", user.id).eq("week_start", weekStart), []),
        optional(client.from("planner_notification_preferences").select("*").eq("owner_user_id", user.id).maybeSingle(), null),
        optional(client.from("planner_notification_states").select("*").eq("owner_user_id", user.id), [])
      ]);
      if (recipesResult.error) throw recipesResult.error;
      if (mealsResult.error) throw mealsResult.error;
      if (tasksResult.error) throw tasksResult.error;
      const recipes = recipesResult.data || [];
      const meals = mealsResult.data || [];
      const tasks = tasksResult.data || [];
      const notifications = notificationCore.buildNotifications({
        meals,
        tasks,
        states,
        preferences: preferences || {},
        recipes,
        now: new Date()
      });
      render(core.summary({ meals, tasks, shopping, notifications, recipes, now: new Date() }));
    } catch (error) {
      if (status) {
        status.textContent = `Riepilogo personale non disponibile: ${error.message}`;
        status.className = "dashboard-data-status error";
      }
    } finally {
      busy = false;
    }
  }

  window.addEventListener("cucina-hub:authenticated", () => void load());
  window.addEventListener("cucina-hub:view-rendered", event => {
    if (event.detail?.view === "dashboard") void load();
  });
  document.addEventListener("DOMContentLoaded", () => void load());
})();
