(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CucinaHubLearningCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function statusFor({ enabled = true, completedSessions = 0, evaluatedSessions = 0, minimumSessions = 2 } = {}) {
    if (!enabled) return "disabled";
    if (!completedSessions) return "empty";
    if (!evaluatedSessions) return "needs_evaluations";
    if (evaluatedSessions < minimumSessions) return "building";
    return "ready";
  }

  function actionFor(status) {
    const actions = {
      disabled: {
        label: "RIATTIVA IL LEARNING",
        description: "I dati restano salvati e torneranno a essere analizzati.",
        kind: "enable"
      },
      empty: {
        label: "CREA LA PRIMA SESSIONE",
        description: "Registra una prova reale nel Laboratorio per iniziare a costruire lo storico.",
        href: "../fermentation/baking-wizard.html?v=22"
      },
      needs_evaluations: {
        label: "VALUTA LE SESSIONI",
        description: "Aggiungi voti, tempi reali ed esito alle prove completate.",
        href: "../fermentation/baking-session-history.html?v=5"
      },
      building: {
        label: "AGGIUNGI UN'ALTRA PROVA",
        description: "Servono almeno due sessioni valutate per iniziare un confronto.",
        href: "../fermentation/baking-sessions.html?v=9"
      },
      ready: {
        label: "APRI L'ANALISI COMPLETA",
        description: "Esamina condizioni, confronti e sessioni considerate.",
        href: "../fermentation/fermentation-learning.html?v=2"
      }
    };
    return actions[status] || actions.empty;
  }

  function summary({ analysis = {}, completedSessions = 0, excludedEvaluations = 0, enabled = true, minimumSessions = 2 } = {}) {
    const evaluatedSessions = Number(analysis.sample_count || 0);
    const status = statusFor({ enabled, completedSessions, evaluatedSessions, minimumSessions });
    return {
      status,
      action: actionFor(status),
      completedSessions,
      evaluatedSessions,
      excludedEvaluations,
      confidence: analysis.confidence || { level: "insufficient", label: "Dati insufficienti" },
      qualityScore: Number(analysis.data_quality?.score || 0),
      averageRating: analysis.averages?.overall_rating ?? null,
      insights: Array.isArray(analysis.insights) ? analysis.insights.slice(0, 4) : [],
      methodology: analysis.methodology?.statement || "Il Learning descrive associazioni nello storico personale, non dimostra causalità e non modifica automaticamente ricette o sessioni."
    };
  }

  return { statusFor, actionFor, summary };
});
