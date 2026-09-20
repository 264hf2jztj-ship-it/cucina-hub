(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.CucinaHubAuthErrors = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const INVALID_CREDENTIALS = "Email o password non corrette.";
  const SERVICE_UNAVAILABLE = "Il servizio è momentaneamente non disponibile. Attendi qualche minuto e premi di nuovo Accedi.";
  const TOO_MANY_ATTEMPTS = "Troppi tentativi ravvicinati. Attendi qualche minuto prima di riprovare.";
  const GENERIC_SIGN_IN = "Non riesco a completare l’accesso. Riprova tra poco.";
  const GENERIC_SESSION = "Non riesco a controllare la sessione. Verifica la connessione e riprova.";

  function details(error) {
    return [error?.message, error?.name, error?.code, error?.status]
      .filter(value => value !== undefined && value !== null)
      .join(" ")
      .toLowerCase();
  }

  function isNetworkFailure(error) {
    return /load failed|failed to fetch|networkerror|network request failed|fetch failed|connection refused|timeout|timed out|aborterror/.test(details(error));
  }

  function isRateLimited(error) {
    return Number(error?.status) === 429 || /too many requests|rate limit|over_request_rate_limit/.test(details(error));
  }

  function signInMessage(error) {
    const value = details(error);

    if (/invalid login credentials|invalid_credentials/.test(value)) return INVALID_CREDENTIALS;
    if (isRateLimited(error)) return TOO_MANY_ATTEMPTS;
    if (isNetworkFailure(error)) return SERVICE_UNAVAILABLE;
    return GENERIC_SIGN_IN;
  }

  function sessionMessage(error) {
    if (isNetworkFailure(error)) return SERVICE_UNAVAILABLE;
    return GENERIC_SESSION;
  }

  return {
    isNetworkFailure,
    isRateLimited,
    sessionMessage,
    signInMessage
  };
});
