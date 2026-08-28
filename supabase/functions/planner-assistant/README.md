# planner-assistant

Edge Function autenticata e read-only che genera una proposta `cucina-hub.menu-plan` v1.

- usa il JWT Supabase dell'utente e le RLS esistenti;
- legge il catalogo personale delle ricette e il Planner del periodo;
- recupera fino a quattro frammenti RAG pertinenti quando disponibili;
- chiama OpenAI con `store: false`;
- restituisce un pacchetto con guardrail `preview_only`;
- non crea anteprime, menu, pasti o altri record.

Il frontend richiede un secondo tap esplicito per inviare il pacchetto a `planner-menu-preview`; il commit finale resta nel normale flusso Menu Package.
