const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6-terra";
const DEFAULT_MAX_OUTPUT_TOKENS = 6000;
const MAX_PACKET_BYTES = 180_000;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema",
    "version",
    "state",
    "proposal_id",
    "summary",
    "requires_user_confirmation",
    "automatic_writes",
    "proposal",
    "explanations",
    "assumptions",
    "source_usage",
    "uncertainties",
    "confidence",
  ],
  properties: {
    schema: { type: "string", const: "cucina-hub.fermentation-assistant.response" },
    version: { type: "integer", const: 1 },
    state: { type: "string", const: "preview" },
    proposal_id: { type: "string", minLength: 1, maxLength: 100 },
    summary: { type: "string", minLength: 1, maxLength: 2000 },
    requires_user_confirmation: { type: "boolean", const: true },
    automatic_writes: { type: "boolean", const: false },
    proposal: {
      type: "object",
      additionalProperties: false,
      required: [
        "product_style",
        "format",
        "hydration_percent",
        "dough_total_weight_g",
        "ingredients",
        "fermentation",
        "oven",
      ],
      properties: {
        product_style: { type: "string", enum: ["roman_pan", "neapolitan", "home_round", "focaccia", "bread"] },
        format: {
          type: "object",
          additionalProperties: false,
          required: ["shape", "portion_count", "portion_weight_g", "tray_width_cm", "tray_length_cm", "round_diameter_cm"],
          properties: {
            shape: { type: "string", enum: ["tray", "round", "loaf"] },
            portion_count: { type: "integer", minimum: 1, maximum: 30 },
            portion_weight_g: { type: "number", exclusiveMinimum: 0, maximum: 5000 },
            tray_width_cm: { anyOf: [{ type: "number", minimum: 10, maximum: 200 }, { type: "null" }] },
            tray_length_cm: { anyOf: [{ type: "number", minimum: 10, maximum: 200 }, { type: "null" }] },
            round_diameter_cm: { anyOf: [{ type: "number", minimum: 15, maximum: 100 }, { type: "null" }] },
          },
        },
        hydration_percent: { type: "number", minimum: 40, maximum: 120 },
        dough_total_weight_g: { type: "number", exclusiveMinimum: 0, maximum: 100_000 },
        ingredients: {
          type: "array",
          minItems: 4,
          maxItems: 30,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["role", "name", "grams", "source_id"],
            properties: {
              role: { type: "string", enum: ["flour", "water", "salt", "yeast", "oil", "sugar", "other"] },
              name: { type: "string", minLength: 1, maxLength: 250 },
              grams: { type: "number", minimum: 0, maximum: 100_000 },
              source_id: { type: "string", minLength: 1, maxLength: 150 },
            },
          },
        },
        fermentation: {
          type: "object",
          additionalProperties: false,
          required: ["phases"],
          properties: {
            phases: {
              type: "array",
              minItems: 1,
              maxItems: 20,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["name", "duration_minutes", "temperature_c"],
                properties: {
                  name: { type: "string", minLength: 1, maxLength: 250 },
                  duration_minutes: { type: "integer", minimum: 0, maximum: 10_080 },
                  temperature_c: { anyOf: [{ type: "number", minimum: -5, maximum: 45 }, { type: "null" }] },
                },
              },
            },
          },
        },
        oven: {
          type: "object",
          additionalProperties: false,
          required: ["type", "temperature_c", "preheat_minutes", "bake_minutes"],
          properties: {
            type: { type: "string", enum: ["samsung_oven", "weber_kettle", "air_fryer", "other"] },
            temperature_c: { type: "number", minimum: 50, maximum: 500 },
            preheat_minutes: { type: "integer", minimum: 1, maximum: 240 },
            bake_minutes: { type: "integer", minimum: 1, maximum: 240 },
          },
        },
      },
    },
    explanations: {
      type: "array",
      minItems: 1,
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["topic", "text"],
        properties: {
          topic: { type: "string", minLength: 1, maxLength: 150 },
          text: { type: "string", minLength: 1, maxLength: 3000 },
        },
      },
    },
    assumptions: { type: "array", maxItems: 30, items: { type: "string", minLength: 1, maxLength: 1000 } },
    source_usage: {
      type: "array",
      minItems: 1,
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source_id", "usage"],
        properties: {
          source_id: { type: "string", minLength: 1, maxLength: 150 },
          usage: { type: "string", minLength: 1, maxLength: 2000 },
        },
      },
    },
    uncertainties: { type: "array", maxItems: 30, items: { type: "string", minLength: 1, maxLength: 1000 } },
    confidence: {
      type: "object",
      additionalProperties: false,
      required: ["level", "reason"],
      properties: {
        level: { type: "string", enum: ["low", "medium", "high"] },
        reason: { type: "string", minLength: 1, maxLength: 2000 },
      },
    },
  },
};

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
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
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
      if (content?.type === "output_text" && typeof content.text === "string" && content.text.trim()) return content.text.trim();
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

const SYSTEM_INSTRUCTIONS = `Sei AI Fermentation Assistant di Cucina Hub.
Genera esclusivamente una proposta tecnica di impasto in stato preview e conforme allo schema JSON richiesto.
Usa prima i dati personali presenti nel pacchetto. Usa soltanto source_id dichiarati nel manifesto sources.
Mantieni preparazione, forma, numero di teglie o panetti e forno richiesti.
Calcola quantità coerenti in grammi: la somma degli ingredienti deve coincidere con dough_total_weight_g entro gli arrotondamenti, e portion_weight_g moltiplicato per portion_count deve coincidere con il totale.
Distingui dati osservati, fonti, ipotesi e inferenze. Non presentare il Learning come causalità, soprattutto con campione insufficiente.
Non inventare fonti Biblioteca se risultano non collegate. Dichiaralo nelle incertezze.
Non creare ricette o sessioni, non proporre scritture automatiche e non cambiare i guardrail.
requires_user_confirmation deve essere true e automatic_writes deve essere false.
Adatta la proposta al risultato desiderato, al profilo ambiente, alle farine disponibili e ai limiti dell'elettrodomestico.
Sii prudente con tempi e lievito; esplicita le ipotesi quando i dati non bastano.`;

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, 405, { error: "method_not_allowed", message: "Usa una richiesta POST." });
  if (!request.headers.get("authorization")) return json(request, 401, { error: "authentication_required", message: "Accedi a Cucina Hub prima di usare l’assistente." });

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

  if (!openAiKey) return json(request, 503, { error: "provider_not_configured", message: "OPENAI_API_KEY non configurata nei secret della Edge Function." });

  const packet = body?.packet;
  if (!validPacket(packet)) return json(request, 400, { error: "invalid_packet", message: "Pacchetto AI assente o non conforme ai guardrail." });

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
    if (!rawText) return json(request, 502, { error: "empty_provider_response", message: "Il provider non ha restituito una proposta leggibile." });

    let response: unknown;
    try {
      response = JSON.parse(rawText);
    } catch {
      return json(request, 502, { error: "invalid_provider_json", message: "La risposta del provider non è un JSON valido." });
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
      return json(request, 504, { error: "provider_timeout", message: "La generazione ha superato il tempo massimo. Riprova." });
    }
    console.error("Fermentation assistant failure", error instanceof Error ? error.message : "unknown");
    return json(request, 500, { error: "internal_error", message: "Errore interno durante la generazione della proposta." });
  } finally {
    clearTimeout(timeout);
  }
});
