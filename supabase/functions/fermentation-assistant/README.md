# Fermentation Assistant Edge Function

## Scopo

Chiama OpenAI lato server e restituisce una proposta conforme al contratto di Cucina Hub. La funzione non salva dati e non crea sessioni.

## Secret obbligatorio

- `OPENAI_API_KEY`

## Secret facoltativi

- `OPENAI_MODEL` — default `gpt-5.6-terra`
- `OPENAI_MAX_OUTPUT_TOKENS` — default `6000`, limite applicativo 1500–12000
- `FERMENTATION_ASSISTANT_ALLOWED_ORIGINS` — elenco separato da virgole; default `https://264hf2jztj-ship-it.github.io`

## Deploy con Supabase CLI

```bash
supabase secrets set OPENAI_API_KEY=sk-... --project-ref <PROJECT_REF>
supabase secrets set OPENAI_MODEL=gpt-5.6-terra --project-ref <PROJECT_REF>
supabase functions deploy fermentation-assistant --project-ref <PROJECT_REF>
```

La funzione deve mantenere `verify_jwt = true`.

## Verifica

Dopo il deploy, aprire `workflow-engine/fermentation-assistant-provider-test.html` mentre si è autenticati in Cucina Hub.

L'azione `health` non chiama OpenAI e non consuma token. La generazione reale avviene soltanto quando il client invia un pacchetto richiesta valido.
