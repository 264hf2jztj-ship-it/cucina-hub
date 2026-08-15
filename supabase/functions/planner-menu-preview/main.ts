import { withSupabase } from "npm:@supabase/server@1.4.1";
import {
  canonicalStringify,
  computePayloadHash,
  validatePacket,
} from "./contract.mjs";

const MAX_PACKET_BYTES = 2 * 1024 * 1024;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function errorStatus(error: { code?: string; message?: string } | null): number {
  const message = String(error?.message ?? "");
  if (error?.code === "23505" || message.includes("same_revision_payload_mismatch")) return 409;
  if (error?.code === "42501" || message.includes("auth_required")) return 401;
  if (error?.code === "PGRST202" || error?.code === "42P01") return 503;
  if (error?.code === "22023") return 400;
  return 500;
}

function publicError(error: { code?: string; message?: string } | null) {
  const message = String(error?.message ?? "Errore inatteso durante la creazione dell’anteprima.");
  if (message.includes("same_revision_payload_mismatch")) {
    return {
      error: "same_revision_payload_mismatch",
      message: "La stessa revisione esiste già con un contenuto diverso. Incrementa menu.revision.",
    };
  }
  if (error?.code === "PGRST202" || error?.code === "42P01") {
    return {
      error: "preview_staging_unavailable",
      message: "Applica la migration 044_planner_menu_preview_staging.sql e aggiorna la cache PostgREST.",
    };
  }
  if (message.includes("menu_preview_")) {
    return { error: message.match(/menu_preview_[a-z_]+/)?.[0] ?? "invalid_preview_request", message };
  }
  return { error: "preview_staging_failed", message: "La richiesta non è stata salvata. Riprova più tardi." };
}

export default {
  fetch: withSupabase({ auth: "user" }, async (request, context) => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });
    if (request.method !== "POST") {
      return json(405, { error: "method_not_allowed", message: "Usa una richiesta POST." });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: "invalid_json", message: "Il corpo della richiesta non è un JSON valido." });
    }

    if (body?.action === "health") {
      return json(200, {
        ok: true,
        endpoint: "planner-menu-preview",
        contract: "cucina-hub.menu-plan",
        version: 1,
        authentication: "supabase_user_jwt",
        owner_from_jwt: true,
        preview_only: true,
        automatic_writes: false,
        requires_user_confirmation: true,
      });
    }

    const packet = body?.packet ?? (body?.contract === "cucina-hub.menu-plan" ? body : null);
    if (!packet) {
      return json(400, {
        error: "missing_packet",
        message: "Invia il pacchetto cucina-hub.menu-plan come corpo JSON oppure nel campo packet.",
      });
    }

    let serialized: string;
    try {
      serialized = JSON.stringify(packet);
    } catch {
      return json(400, { error: "invalid_packet", message: "Il pacchetto non può essere serializzato." });
    }
    if (new TextEncoder().encode(serialized).byteLength > MAX_PACKET_BYTES) {
      return json(413, { error: "packet_too_large", message: "Il pacchetto supera il limite di 2 MB." });
    }

    const validation = validatePacket(packet);
    if (!validation.valid) {
      return json(422, {
        error: "contract_validation_failed",
        message: "Il pacchetto non rispetta il contratto cucina-hub.menu-plan v1.",
        issues: validation.errors,
      });
    }

    if (validation.normalizedPacket.menu.source.type !== "chatgpt_project") {
      return json(422, {
        error: "direct_source_required",
        message: "L’endpoint diretto accetta source.type = chatgpt_project.",
      });
    }

    const canonicalPayload = canonicalStringify(validation.normalizedPacket);
    const payloadHash = await computePayloadHash(validation.normalizedPacket);
    const { data, error } = await context.supabase.rpc("stage_planner_menu_preview", {
      p_packet: validation.normalizedPacket,
      p_canonical_payload: canonicalPayload,
      p_payload_hash: payloadHash,
    });

    if (error) {
      console.error("planner-menu-preview staging error", error.code ?? "unknown");
      return json(errorStatus(error), publicError(error));
    }

    return json(data?.status === "staged" ? 201 : 200, {
      ok: true,
      state: data?.status ?? "staged",
      request_id: data?.request_id ?? null,
      package_id: data?.package_id ?? null,
      payload_hash: data?.payload_hash ?? payloadHash,
      summary: data?.summary ?? validation.summary,
      warnings: validation.warnings,
      owner_from_jwt: true,
      preview_only: true,
      automatic_writes: false,
      requires_user_confirmation: true,
      next_step: data?.status === "already_committed"
        ? "Il menu risulta già confermato nel Planner."
        : "Apri Cucina Hub > Planner > Anteprime ricevute per analizzare e confermare.",
    });
  }),
};
