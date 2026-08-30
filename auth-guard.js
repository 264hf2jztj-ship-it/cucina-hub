"use strict";

(function exposeAuthGuard(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CucinaHubAuthGuard = api;
})(typeof window !== "undefined" ? window : null, () => {
  async function requireAdministrator(client) {
    if (!client?.auth?.getSession || typeof client.from !== "function") {
      throw new Error("Il controllo di accesso non è disponibile.");
    }

    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;

    const session = sessionData?.session ?? null;
    const user = session?.user ?? null;
    if (!user) return { authorized: false, reason: "signed_out", session: null, user: null };

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profileError) throw profileError;

    if (profile?.role !== "admin") {
      await client.auth.signOut();
      return { authorized: false, reason: "forbidden", session: null, user: null };
    }

    return { authorized: true, reason: null, session, user };
  }

  return Object.freeze({ VERSION: 1, requireAdministrator });
});
