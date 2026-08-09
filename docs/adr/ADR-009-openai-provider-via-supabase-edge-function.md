# ADR-009 — Provider AI tramite Supabase Edge Function

| Campo | Valore |
|---|---|
| Progetto | Cucina Hub |
| Data | 2026-08-09 |
| Stato | Accettato |
| Ambito | AI Fermentation Assistant |

## Contesto

Il frontend di Cucina Hub è statico e gira su GitHub Pages. Una chiave di un provider AI non può essere inserita nel browser, nel repository o nella configurazione pubblica. L'AI deve inoltre usare prima i dati personali del Laboratorio, dichiarare la provenienza e mantenere ogni proposta in anteprima fino alla conferma dell'utente.

## Alternative considerate

1. Chiamata diretta dal browser al provider AI.
2. Backend dedicato separato da Supabase.
3. Supabase Edge Function autenticata che orchestra il provider.
4. Nessun provider e copia manuale del prompt.

## Decisione

Il provider iniziale è OpenAI tramite Responses API e Structured Outputs.

La chiamata avviene esclusivamente nella Supabase Edge Function `fermentation-assistant`, protetta dal JWT dell'utente. La chiave viene salvata come secret `OPENAI_API_KEY` nel progetto Supabase e non viene mai inviata al client.

Il modello è configurabile tramite il secret `OPENAI_MODEL`; il valore predefinito è `gpt-5.6-terra`, scelto come equilibrio iniziale tra qualità e costo. Il numero massimo di token di output è configurabile tramite `OPENAI_MAX_OUTPUT_TOKENS` e limitato anche dalla funzione.

La richiesta inviata dal client deve rispettare il contratto `cucina-hub.fermentation-assistant.request` versione 1. La risposta del provider deve rispettare lo schema `cucina-hub.fermentation-assistant.response` versione 1 e viene successivamente validata dal motore locale già esistente.

## Vincoli

- `store: false` nelle richieste OpenAI.
- Nessuna chiave nel repository o nel frontend.
- Nessuna scrittura automatica su ricette, profili o sessioni.
- Stato obbligatorio `preview`.
- Conferma utente sempre necessaria.
- Fonti limitate agli identificativi presenti nel manifesto della richiesta.
- Il Learning non può essere presentato come causalità.
- Dimensione del contesto e token di output limitati per controllare costi e abusi.
- Origini browser consentite configurabili tramite secret.

## Conseguenze positive

- Il frontend statico resta compatibile con iPad.
- Il segreto del provider resta lato server.
- Il provider può essere sostituito senza modificare il contratto del frontend.
- Ogni proposta passa da Structured Outputs e dal validatore applicativo.
- Il modello può essere cambiato senza nuova build usando un secret Supabase.

## Conseguenze negative

- È necessario configurare un account API OpenAI con fatturazione separata.
- La Edge Function deve essere distribuita e monitorata.
- Ogni generazione ha costo e latenza variabili.
- La prima versione non integra ancora RAG o fonti della Biblioteca.

## Fuori ambito

- Applicazione della proposta al Wizard.
- Salvataggio della proposta.
- RAG e Knowledge Objects.
- Analisi di una sessione precedente.
- Diagnosi dei problemi di fermentazione.
