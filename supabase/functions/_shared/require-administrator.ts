type AccessResult =
  | { authorized: true }
  | { authorized: false; status: number; error: string; message: string };

const unauthenticated = (): AccessResult => ({
  authorized: false,
  status: 401,
  error: "authentication_required",
  message: "Accedi con una sessione utente valida.",
});

const forbidden = (): AccessResult => ({
  authorized: false,
  status: 403,
  error: "administrator_required",
  message: "Accesso riservato all’amministratore.",
});

const unavailable = (): AccessResult => ({
  authorized: false,
  status: 503,
  error: "authorization_unavailable",
  message: "Non è possibile verificare l’accesso. Riprova più tardi.",
});

// Same authority as auth-guard.js: Supabase user + current profiles.role.
// Use Auth's get-user endpoint (the REST equivalent of auth.getUser(jwt)),
// never locally decoded claims or a project API key as proof of identity.
export async function requireAdministrator(request: Request): Promise<AccessResult> {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  if (!bearer || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(bearer[1])) {
    return unauthenticated();
  }

  const url = Deno.env.get("SUPABASE_URL");
  const apiKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !apiKey) return unavailable();

  // These headers are request-scoped. No service role, refresh or auth cache.
  const headers = { Authorization: request.headers.get("authorization")!, apikey: apiKey };
  try {
    const options = { headers, signal: AbortSignal.timeout(10_000), redirect: "error" as const };
    const userResponse = await fetch(`${url}/auth/v1/user`, options);
    if (!userResponse.ok) {
      await userResponse.body?.cancel();
      return userResponse.status >= 500 ? unavailable() : unauthenticated();
    }
    const user = await userResponse.json();
    if (typeof user?.id !== "string" || !user.id || user.role !== "authenticated" || user.is_anonymous === true) {
      return unauthenticated();
    }

    // Read the live role through the caller's RLS. Do not trust role metadata
    // in the JWT: an administrator may have been revoked since token issuance.
    const profileUrl = new URL(`${url}/rest/v1/profiles`);
    profileUrl.searchParams.set("select", "role");
    profileUrl.searchParams.set("id", `eq.${user.id}`);
    profileUrl.searchParams.set("limit", "1");
    const profileResponse = await fetch(profileUrl, options);
    if (!profileResponse.ok) {
      await profileResponse.body?.cancel();
      if (profileResponse.status === 401) return unauthenticated();
      return profileResponse.status === 403 ? forbidden() : unavailable();
    }
    const profiles = await profileResponse.json();
    if (!Array.isArray(profiles)) return unavailable();
    if (profiles.length !== 1 || profiles[0]?.role !== "admin") return forbidden();
    return { authorized: true };
  } catch {
    // Fail closed; never forward Auth/PostgREST payloads, tokens or exceptions.
    return unavailable();
  }
}
