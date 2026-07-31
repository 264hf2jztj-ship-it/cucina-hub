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

async function detectColumn(client, candidates, label, required = false) {
  for (const column of candidates) {
    const { error } = await client.from("changelog_entries").select(column).limit(0);
    if (!error) return column;
    if (error.code !== "42703" && !String(error.message).includes("does not exist")) {
      assertOk(error, `Verifica colonna ${column}`);
    }
  }
  if (required) {
    throw new Error(`Schema changelog_entries non compatibile: manca una colonna per ${label}.`);
  }
  return null;
}

async function detectMapping(client) {
  return {
    id: await detectColumn(client, ["id"], "id"),
    owner: await detectColumn(client, ["owner_user_id", "user_id", "created_by"], "proprietario", true),
    version: await detectColumn(client, ["version_label", "app_version", "release_version", "versione", "version"], "versione", true),
    date: await detectColumn(client, ["release_date", "released_at", "published_at", "entry_date", "data"], "data"),
    title: await detectColumn(client, ["title", "name", "titolo"], "titolo"),
    changes: await detectColumn(client, ["changes", "change_items", "items", "modifiche"], "modifiche"),
    content: await detectColumn(client, ["content", "notes", "description", "details"], "contenuto")
  };
}

function buildRow(mapping, ownerUserId, entry, version) {
  const row = {
    [mapping.owner]: ownerUserId,
    [mapping.version]: version
  };
  if (mapping.date) row[mapping.date] = entry.data || null;
  if (mapping.title) row[mapping.title] = entry.titolo || version;

  const changes = Array.isArray(entry.modifiche) ? entry.modifiche : [];
  if (mapping.changes) row[mapping.changes] = changes;
  else if (mapping.content) row[mapping.content] = changes.join("\n");
  return row;
}

export async function importChangelogEntries({ client, changelogData, onProgress = () => {} }) {
  if (!client) throw new Error("Client Supabase non disponibile.");
  const ownerUserId = await ensureAdministrator(client);
  const mapping = await detectMapping(client);
  onProgress(`Mappatura schema: ${JSON.stringify(mapping)}`);

  const entries = Array.isArray(changelogData?.versioni) ? changelogData.versioni : [];
  const report = { created: 0, updated: 0 };

  for (const entry of entries) {
    const version = String(entry.versione ?? "").trim();
    if (!version) throw new Error("Voce changelog priva di versione.");

    onProgress(`Changelog: ${version}`);
    const { data: existing, error: readError } = await client
      .from("changelog_entries")
      .select("*")
      .eq(mapping.owner, ownerUserId)
      .eq(mapping.version, version)
      .limit(1)
      .maybeSingle();
    assertOk(readError, "Lettura changelog_entries");

    const row = buildRow(mapping, ownerUserId, entry, version);
    if (existing) {
      let query = client.from("changelog_entries").update(row);
      if (mapping.id && existing[mapping.id]) query = query.eq(mapping.id, existing[mapping.id]);
      else query = query.eq(mapping.owner, ownerUserId).eq(mapping.version, version);
      const { error } = await query;
      assertOk(error, "Aggiornamento changelog_entries");
      report.updated += 1;
    } else {
      const { error } = await client.from("changelog_entries").insert(row);
      assertOk(error, "Inserimento changelog_entries");
      report.created += 1;
    }
  }

  return { owner_user_id: ownerUserId, report, source_count: entries.length, schema_mapping: mapping };
}
