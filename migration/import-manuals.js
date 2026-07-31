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
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  assertOk(profileError, "Verifica profilo");
  if (profile?.role !== "admin") throw new Error("L’account non ha ruolo amministratore.");
  return user.id;
}

function missingColumn(error) {
  const text = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  return error?.code === "42703" || text.includes("column") && text.includes("does not exist");
}

async function firstExistingColumn(client, table, candidates, required = false) {
  for (const column of candidates) {
    const { error } = await client.from(table).select(column).limit(1);
    if (!error) return column;
    if (!missingColumn(error)) assertOk(error, `Verifica schema ${table}.${column}`);
  }
  if (required) throw new Error(`Nessuna colonna compatibile trovata in ${table}: ${candidates.join(", ")}`);
  return null;
}

async function detectSchema(client) {
  return {
    manuals: {
      id: await firstExistingColumn(client, "manuals", ["id"], true),
      owner: await firstExistingColumn(client, "manuals", ["owner_user_id", "user_id"], true),
      title: await firstExistingColumn(client, "manuals", ["title", "name"], true),
      manufacturer: await firstExistingColumn(client, "manuals", ["manufacturer", "brand"]),
      model: await firstExistingColumn(client, "manuals", ["model", "model_number"]),
      language: await firstExistingColumn(client, "manuals", ["language", "language_code"]),
      type: await firstExistingColumn(client, "manuals", ["document_type", "manual_type", "type"]),
      version: await firstExistingColumn(client, "manuals", ["version_label", "version"]),
      filename: await firstExistingColumn(client, "manuals", ["source_filename", "file_name", "filename"]),
      notes: await firstExistingColumn(client, "manuals", ["notes", "description"])
    },
    links: {
      appliance: await firstExistingColumn(client, "appliance_manuals", ["appliance_id"], true),
      manual: await firstExistingColumn(client, "appliance_manuals", ["manual_id"], true)
    }
  };
}

function setIf(row, column, value) {
  if (column && value !== undefined) row[column] = value;
}

export async function importManualMetadata({ client, manualsData, onProgress = () => {} }) {
  if (!client) throw new Error("Client Supabase non disponibile.");
  const ownerUserId = await ensureAdministrator(client);
  const schema = await detectSchema(client);
  onProgress(`Mappatura schema: ${JSON.stringify(schema)}`);

  const entries = Array.isArray(manualsData?.manuali) ? manualsData.manuali : [];
  const report = {
    manuals: { created: 0, updated: 0 },
    appliance_manuals: { created: 0, existing: 0 }
  };

  for (const entry of entries) {
    onProgress(`Manuale: ${entry.title}`);

    const { data: appliance, error: applianceError } = await client
      .from("appliances")
      .select("id")
      .eq("owner_user_id", ownerUserId)
      .eq("name", entry.appliance_name)
      .maybeSingle();
    assertOk(applianceError, "Lettura appliances");
    if (!appliance) throw new Error(`Elettrodomestico non trovato: ${entry.appliance_name}`);

    let existingQuery = client.from("manuals").select("*")
      .eq(schema.manuals.owner, ownerUserId)
      .eq(schema.manuals.title, entry.title)
      .limit(1);
    const { data: existing, error: existingError } = await existingQuery.maybeSingle();
    assertOk(existingError, "Lettura manuals");

    const row = {};
    setIf(row, schema.manuals.owner, ownerUserId);
    setIf(row, schema.manuals.title, entry.title);
    setIf(row, schema.manuals.manufacturer, entry.manufacturer ?? null);
    setIf(row, schema.manuals.model, entry.model ?? null);
    setIf(row, schema.manuals.language, entry.language ?? null);
    setIf(row, schema.manuals.type, entry.document_type ?? null);
    setIf(row, schema.manuals.version, entry.version_label ?? null);
    setIf(row, schema.manuals.filename, entry.source_filename ?? null);
    setIf(row, schema.manuals.notes, entry.notes ?? null);

    let manual;
    if (existing) {
      const { data, error } = await client.from("manuals")
        .update(row).eq(schema.manuals.id, existing[schema.manuals.id])
        .select("*").single();
      assertOk(error, "Aggiornamento manuals");
      manual = data;
      report.manuals.updated += 1;
    } else {
      const { data, error } = await client.from("manuals").insert(row).select("*").single();
      assertOk(error, "Inserimento manuals");
      manual = data;
      report.manuals.created += 1;
    }

    const linkFilters = {
      [schema.links.appliance]: appliance.id,
      [schema.links.manual]: manual[schema.manuals.id]
    };
    let linkQuery = client.from("appliance_manuals").select("*").limit(1);
    for (const [column, value] of Object.entries(linkFilters)) linkQuery = linkQuery.eq(column, value);
    const { data: existingLink, error: linkError } = await linkQuery.maybeSingle();
    assertOk(linkError, "Lettura appliance_manuals");

    if (existingLink) {
      report.appliance_manuals.existing += 1;
    } else {
      const { error } = await client.from("appliance_manuals").insert(linkFilters);
      assertOk(error, "Inserimento appliance_manuals");
      report.appliance_manuals.created += 1;
    }
  }

  return {
    owner_user_id: ownerUserId,
    report,
    source_count: entries.length,
    schema_mapping: schema,
    pdf_upload_deferred_to_macrostep_6: true
  };
}
