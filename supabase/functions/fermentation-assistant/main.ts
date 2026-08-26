import { RESPONSE_SCHEMA } from "./response-schema.ts";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6-terra";
const DEFAULT_MAX_OUTPUT_TOKENS = 6000;
const MAX_PACKET_BYTES = 180_000;

function configuredOrigins(): string[] {
  const raw = Deno.env.get("FERMENTATION_ASSISTANT_ALLOWED_ORIGINS") || "https://264hf2jztj-ship-it.github.io";
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") || "";
  const allowed = configuredOrigins();
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(request: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function validPacket(packet: unknown): packet is Record<string, unknown> {
  if (!packet || typeof packet !== "object") return false;
  const value = packet as Record<string, any>;
  return value.schema === "cucina-hub.fermentation-assistant.request" &&
    value.version === 1 &&
    value.task?.mode === "preview_only" &&
    value.guardrails?.automatic_writes === false &&
    value.guardrails?.requires_user_confirmation === true &&
    Array.isArray(value.sources);
}

function outputText(payload: any): string | null {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string" && content.text.trim()) {
        return content.text.trim();
      }
    }
  }
  return null;
}

function safeModel(): string {
  const configured = (Deno.env.get("OPENAI_MODEL") || DEFAULT_MODEL).trim();
  return configured || DEFAULT_MODEL;
}

function maxOutputTokens(): number {
  const configured = Number(Deno.env.get("OPENAI_MAX_OUTPUT_TOKENS") || DEFAULT_MAX_OUTPUT_TOKENS);
  if (!Number.isFinite(configured)) return DEFAULT_MAX_OUTPUT_TOKENS;
  return Math.max(1500, Math.min(12_000, Math.round(configured)));
}

function validProviderGuardrails(response: any): boolean {
  return response?.schema === "cucina-hub.fermentation-assistant.response" &&
    response?.version === 1 &&
    response?.state === "preview" &&
    response?.automatic_writes === false &&
    response?.requires_user_confirmation === true;
}

const SYSTEM_INSTRUCTIONS = `Sei AI Fermentation Assistant di Cucina Hub.
Genera esclusivamente una proposta tecnica di impasto in stato preview e conforme allo schema JSON richiesto.
Usa prima i dati personali presenti nel pacchetto. Usa soltanto source_id dichiarati nel manifesto sources.
Mantieni preparazione, forma, numero di teglie o panetti e forno richiesti.
Calcola quantità coerenti in grammi: la somma degli ingredienti deve coincidere con dough_total_weight_g entro gli arrotondamenti, e portion_weight_g moltiplicato per portion_count deve coincidere con il totale.
Distingui dati osservati, fonti, ipotesi e inferenze. Non presentare il Learning come causalità, soprattutto con campione insufficiente.
Per la Biblioteca usa esclusivamente gli estratti presenti in retrieval_context.library.results e cita il loro source_id esatto. Non trattare link o metadati come contenuti consultati e non inventare fonti mancanti.
Non creare ricette o sessioni, non proporre scritture automatiche e non cambiare i guardrail.
requires_user_confirmation deve essere true e automatic_writes deve essere false.
Adatta la proposta al risultato desiderato, al profilo ambiente, alle farine disponibili e ai limiti dell'elettrodomestico.
Sii prudente con tempi e lievito; esplicita le ipotesi quando i dati non bastano.`;

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") {
    return json(request, 405, { error: "method_not_allowed", message: "Usa una richiesta POST." });
  }
  if (!request.headers.get("authorization")) {
    return json(request, 401, { error: "authentication_required", message: "Accedi a Cucina Hub prima di usare l’assistente." });
  }

  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  const model = safeModel();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json(request, 400, { error: "invalid_json", message: "Corpo della richiesta non valido." });
  }

  if (body?.action === "health") {
    return json(request, 200, {
      ok: true,
      provider: "openai",
      model,
      configured: Boolean(openAiKey),
      preview_only: true,
      automatic_writes: false,
    });
  }

  if (!openAiKey) {
    return json(request, 503, {
      error: "provider_not_configured",
      message: "OPENAI_API_KEY non configurata nei secret della Edge Function.",
    });
  }

  const packet = body?.packet;
  if (!validPacket(packet)) {
    return json(request, 400, {
      error: "invalid_packet",
      message: "Pacchetto AI assente o non conforme ai guardrail.",
    });
  }

  const serializedPacket = JSON.stringify(packet);
  if (new TextEncoder().encode(serializedPacket).byteLength > MAX_PACKET_BYTES) {
    return json(request, 413, { error: "packet_too_large", message: "Il contesto supera il limite consentito." });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    const providerResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: maxOutputTokens(),
        reasoning: { effort: "low" },
        text: {
          verbosity: "medium",
          format: {
            type: "json_schema",
            name: "cucina_hub_fermentation_proposal",
            description: "Proposta tecnica di impasto in anteprima per Cucina Hub.",
            strict: true,
            schema: RESPONSE_SCHEMA,
          },
        },
        instructions: SYSTEM_INSTRUCTIONS,
        input: [{
          role: "user",
          content: [{
            type: "input_text",
            text: `Genera la proposta usando questo pacchetto strutturato:\n${serializedPacket}`,
          }],
        }],
      }),
    });

    const providerPayload = await providerResponse.json().catch(() => null);
    if (!providerResponse.ok) {
      const providerMessage = providerPayload?.error?.message || "Il provider AI ha rifiutato la richiesta.";
      console.error("OpenAI error", providerResponse.status, providerPayload?.error?.type || "unknown");
      return json(request, providerResponse.status >= 500 ? 502 : 400, {
        error: "provider_error",
        message: providerMessage,
        provider_status: providerResponse.status,
      });
    }

    const rawText = outputText(providerPayload);
    if (!rawText) {
      return json(request, 502, {
        error: "empty_provider_response",
        message: "Il provider non ha restituito una proposta leggibile.",
      });
    }

    let response: unknown;
    try {
      response = JSON.parse(rawText);
    } catch {
      return json(request, 502, {
        error: "invalid_provider_json",
        message: "La risposta del provider non è un JSON valido.",
      });
    }

    if (!validProviderGuardrails(response)) {
      return json(request, 502, {
        error: "provider_guardrail_violation",
        message: "La risposta del provider non rispetta i guardrail obbligatori.",
      });
    }

    return json(request, 200, {
      response,
      provider: {
        name: "openai",
        model: providerPayload?.model || model,
        response_id: providerPayload?.id || null,
        stored: false,
      },
      usage: providerPayload?.usage || null,
      guardrails: {
        preview_only: true,
        automatic_writes: false,
        requires_user_confirmation: true,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return json(request, 504, {
        error: "provider_timeout",
        message: "La generazione ha superato il tempo massimo. Riprova.",
      });
    }
    console.error("Fermentation assistant failure", error instanceof Error ? error.message : "unknown");
    return json(request, 500, {
      error: "internal_error",
      message: "Errore interno durante la generazione della proposta.",
    });
  } finally {
    clearTimeout(timeout);
  }
});
