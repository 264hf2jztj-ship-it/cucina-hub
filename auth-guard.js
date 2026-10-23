"use strict";

(function exposeAuthGuard(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CucinaHubAuthGuard = api;
})(typeof window !== "undefined" ? window : null, () => {
  async function requireAdministrator(client, options = {}) {
    if (!client?.auth?.getSession || typeof client.from !== "function") {
      throw new Error("Il controllo di accesso non è disponibile.");
    }

    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;

    const session = sessionData?.session ?? null;
    const user = session?.user ?? null;
    if (!user) return { authorized: false, reason: "signed_out", session: null, user: null };

    // Opt-in for the AI pages; preserve the existing guard's other consumers.
    if (options.verifyIdentity) {
      const { data, error } = await client.auth.getUser(session.access_token);
      if (error) throw error;
      if (!data?.user || data.user.id !== user.id || data.user.is_anonymous === true ||
          (session.expires_at && session.expires_at * 1000 <= Date.now())) {
        return { authorized: false, reason: "signed_out", session: null, user: null };
      }
    }

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profileError) throw profileError;

    if (profile?.role !== "admin") {
      if (options.signOutOnForbidden !== false) await client.auth.signOut();
      return { authorized: false, reason: "forbidden", session: null, user: null };
    }

    return { authorized: true, reason: null, session, user };
  }

  function watchAdministrator(client, onChange, host = window) {
    let revision = 0, identity = null, authorized = false, stopped = false;
    let pending = null, expiryTimer = null, queued = null;

    function invalidate(reason = "signed_out") {
      ++revision;
      authorized = false;
      host.clearTimeout(expiryTimer);
      onChange({ authorized: false, reason, user: null });
    }
    function isCurrent(ticket) {
      return !stopped && authorized && ticket?.revision === revision && ticket.userId === identity;
    }
    function scheduleCheck() {
      if (stopped || queued !== null) return;
      // Never await Supabase operations inside its synchronous Auth callback.
      queued = host.setTimeout(() => { queued = null; void check(); }, 0);
    }
    async function check() {
      if (stopped) return null;
      if (pending?.revision === revision) return pending.promise;
      const version = revision;
      const promise = (async () => {
        try {
          const access = await requireAdministrator(client, { verifyIdentity: true, signOutOnForbidden: false });
          if (stopped || version !== revision) return null;
          if (!access.authorized) { invalidate(access.reason); return null; }
          if (identity !== null && identity !== access.user.id) invalidate("account_changed");
          identity = access.user.id;
          const notify = !authorized;
          authorized = true;
          host.clearTimeout(expiryTimer);
          if (access.session.expires_at) {
            expiryTimer = host.setTimeout(() => {
              invalidate("expired");
              scheduleCheck();
            }, Math.min(2147483647, Math.max(0, access.session.expires_at * 1000 - Date.now())));
          }
          if (notify) onChange({ authorized: true, user: access.user, reason: null, ticket: { revision, userId: identity } });
          return { revision, userId: identity };
        } catch {
          if (!stopped && version === revision) invalidate("verification_failed");
          return null;
        }
      })();
      pending = { revision: version, promise };
      try { return await promise; }
      finally { if (pending?.promise === promise) pending = null; }
    }
    const subscription = client?.auth?.onAuthStateChange?.((event, session) => {
      const next = session?.user?.id ?? null;
      if (event === "SIGNED_OUT" || !next || next !== identity) {
        invalidate(next ? "account_changed" : "signed_out");
        identity = next;
      }
      scheduleCheck();
    })?.data?.subscription;
    function resume() {
      if (host.document.visibilityState === "hidden") return;
      // Re-read the role on return without discarding a still-authorized draft.
      scheduleCheck();
    }
    function hide() { invalidate("page_hidden"); }
    host.addEventListener("focus", resume);
    host.addEventListener("pageshow", resume);
    host.addEventListener("pagehide", hide);
    host.document.addEventListener("visibilitychange", resume);
    const poll = host.setInterval(() => {
      if (host.document.visibilityState !== "hidden") void check();
    }, 30000);
    invalidate("initializing");
    return Object.freeze({
      start: check,
      authorize: check,
      isCurrent,
      async confirm(ticket) { if (!isCurrent(ticket)) return false; await check(); return isCurrent(ticket); },
      reject(error, ticket) {
        if (isCurrent(ticket) && [401, 403].includes(error?.context?.status ?? error?.status)) invalidate("access_denied");
      },
      stop() {
        stopped = true;
        invalidate("stopped");
        subscription?.unsubscribe();
        host.clearInterval(poll);
        host.clearTimeout(queued);
        host.removeEventListener("focus", resume);
        host.removeEventListener("pageshow", resume);
        host.removeEventListener("pagehide", hide);
        host.document.removeEventListener("visibilitychange", resume);
      }
    });
  }

  return Object.freeze({ VERSION: 2, requireAdministrator, watchAdministrator });
});
