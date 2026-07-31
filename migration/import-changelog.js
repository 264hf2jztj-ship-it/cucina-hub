"use strict";

function assertOk(error, context) {
  if (!error) return;
  const wrapped = new Error(`${context}: ${error.message}`);
  wrapped.code = error.code;
  wrapped.details = error.details;
  wrapped.hint = error.hint;
  throw wrapped;
}

async function ensureAdministrator(client) {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  assertOk(sessionError, "Lettura sessione");
  const user = sessionData.session?.user;
  if (!user) throw new Error("Accedi prima a Cucina Hub con l’account amministratore.");

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  assertOk(profileError, "Verifica profilo");
  if (profile?.role !== "admin") throw new Error("L’account non ha ruolo amministratore.");
  return user.id;
}

async function findByVersion(client, ownerUserId, version) {
  const { data, error } = await client
    .from("changelog_entries")
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .eq("version", version)
    .limit(1)
    .maybeSingle();
  assertOk(error, "Lettura changelog_entries");
  return data;
}

export async function importChangelogEntries({ client, changelogData, onProgress = () => {} }) {
  if (!client) throw new Error("Client Supabase non disponibile.");
  const ownerUserId = await ensureAdministrator(client);
  const entries = Array.isArray(changelogData?.versioni) ? changelogData.versioni : [];
  const report = { created: 0, updated: 0 };

  for (const entry of entries) {
    const version = String(entry.versione ?? "").trim();
    if (!version) throw new Error("Voce changelog priva di versione.");

    onProgress(`Changelog: ${version}`);
    const existing = await findByVersion(client, ownerUserId, version);
    const row = {
      owner_user_id: ownerUserId,
      version,
      release_date: entry.data || null,
      title: entry.titolo || version,
      changes: Array.isArray(entry.modifiche) ? entry.modifiche : []
    };

    if (existing) {
      const { error } = await client
        .from("changelog_entries")
        .update(row)
        .eq("id", existing.id);
      assertOk(error, "Aggiornamento changelog_entries");
      report.updated += 1;
    } else {
      const { error } = await client.from("changelog_entries").insert(row);
      assertOk(error, "Inserimento changelog_entries");
      report.created += 1;
    }
  }

  return { owner_user_id: ownerUserId, report, source_count: entries.length };
}
