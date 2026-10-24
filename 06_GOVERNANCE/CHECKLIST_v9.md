# CHECKLIST v9

## Verifiche sicurezza — aggiornamento 23 ottobre 2026

Registro autorevole per evidenze e limiti: [Release 1.0 — verifiche S01/S02](RELEASE_1_0_SECURITY_VERIFICATION.md).

- [x] S01: PR #196 unita, Edge distribuite (Fermentation v3, Chef v2, Planner v2), `verify_jwt=true`.
- [x] S01: richieste anonime/chiavi pubbliche/JWT invalido respinte live; CORS OPTIONS 200 (22 ottobre).
- [x] S01: collaudo amministrativo reale iPhone/Safari/Comandi Rapidi (23 ottobre): 3/3 health 200, provider assente, 3/3 generazioni 503 `provider_not_configured`.
- [ ] S01: non amministratore sintetico → 403 nel runtime isolato.
- [ ] S01: ruolo admin sintetico revocato, stesso JWT → 403 nel runtime isolato.
- [x] S02: implementazione sul branch dedicato e test automatici locali 436/436, inclusi 35 nuovi test simulati.
- [ ] S02: review e merge autorizzato.
- [ ] S02: collaudo manuale Safari iPhone/iPad, logout tra schede, scadenza, cambio account, risposte tardive e cache.
- [ ] S01 CLOSED.
- [ ] S02 completata in produzione.

Release 1.0 non chiusa. Le spunte storiche sotto descrivono l'implementazione funzionale, non sostituiscono questi test. Il collaudo S01 senza provider non certifica generazioni reali OpenAI o retrieval con due identità.

## Stato consolidato al 29 agosto 2026

## Milestone A — Knowledge Base ✅
- [x] Database
- [x] Ricette
- [x] Manuali
- [x] Elettrodomestici
- [x] Corsi
- [x] Import ZIP
- [x] Import incrementale
- [x] Storage ibrido
- [x] Archivio esterno iCloud
- [x] Biblioteca Supabase e collegamenti ai materiali

## Milestone B — Laboratorio ✅

### Profili, sessioni e workflow
- [x] Profili ambiente
- [x] Profili impasto
- [x] Sessioni impasto
- [x] Timeline intelligente
- [x] Correzione temperatura, umidità e frigorifero
- [x] Diario fermentazioni
- [x] Foto, note e valutazioni
- [x] Learning delle fermentazioni
- [x] Esclusione delle sessioni fittizie dal Learning

### Import Chat → Wizard
- [x] Contratto `cucina-hub.chat-recipe` v1
- [x] Preview e conferma esplicita
- [x] Nessun salvataggio automatico
- [x] Trasferimento al Wizard
- [x] Contratto v2 per impasti fritti
- [x] Frittura, induzione e più lavorazioni
- [x] Compatibilità con i pacchetti v1
- [x] Calcolo automatico di `mixing_batches` dalla capacità dell'impastatrice

### Fermentation Assistant
- [x] Richiesta strutturata in anteprima
- [x] Contratto e validatore della risposta
- [x] Provider server-side
- [x] Edge Function attivata
- [x] Integrazione con RAG e fonti personali
- [x] Accesso dall'AI Hub
- [x] Merge PR #154

## Milestone C — Knowledge ✅
- [x] Knowledge Objects — PR #114
- [x] Tag Engine — PR #116
- [x] Ricerca globale — PR #118
- [x] Knowledge Graph — PR #120
- [x] RLS per proprietario
- [x] Navigazione Knowledge
- [x] Validazioni iPad completate

## Milestone D — AI ✅

### RAG e fonti
- [x] Tabelle private `rag_sources` e `rag_chunks`
- [x] RLS e ricerca limitata al proprietario
- [x] Ingestione controllata con preview e conferma
- [x] Ingestione diretta PDF
- [x] Compatibilità Safari
- [x] Ricerca in linguaggio naturale
- [x] PDF fino a 32 MB verificati
- [x] Migration `052_private_rag_core.sql`
- [x] Migration `053_rag_controlled_ingestion.sql`
- [x] Migration `054_rag_natural_language_search.sql`

### Assistenti
- [x] Fermentation Assistant — PR #154
- [x] Chef AI contestuale e read-only — PR #162
- [x] Planner AI read-only e preview-first — PR #167
- [x] Risposte strutturate e citazioni verificabili
- [x] Chiavi provider mantenute server-side

### Biblioteca privata
- [x] Lettore EPUB sul dispositivo
- [x] Lettore PDF sul dispositivo
- [x] Nessun caricamento automatico dei documenti
- [x] Ricerca locale
- [x] Segnalibri locali
- [x] Chiusura reader non bloccante
- [x] PR #163 e fix successivi

### AI Hub e navigazione
- [x] AI Hub autenticato — PR #168
- [x] Accesso a Chef AI, Fermentation Assistant, Planner AI e Fonti
- [x] Una sola card “Assistente AI” nella Dashboard
- [x] Ritorno diretto all'AI Hub dalle sezioni AI
- [x] Regressione Dashboard corretta — PR #170 e #171

## Milestone E — Planner ✅

### Planner Core
- [x] Migration `040_planner_core.sql`
- [x] CRUD personale e RLS
- [x] Collegamento alle ricette
- [x] Vista settimanale
- [x] PR #122 e #124

### Menu Package
- [x] ADR-011
- [x] Contratto `cucina-hub.menu-plan` v1
- [x] Migration `041_planner_menu_packages.sql`
- [x] Pasti multi-elemento
- [x] Evoluzione compatibile dei pasti esistenti
- [x] Parser e validatore
- [x] Resolver dei `recipe_code`
- [x] Riferimenti Hurom senza duplicazione
- [x] Idempotenza e `payload_hash`
- [x] Preview importazione
- [x] Conflict engine
- [x] Protezione delle modifiche manuali
- [x] Risoluzioni esplicite
- [x] Commit atomico
- [x] Fix runtime del commit
- [x] Staging autenticato della preview
- [x] Migration `042_planner_menu_atomic_commit.sql`
- [x] Migration `043_planner_menu_commit_runtime_fix.sql`
- [x] Migration `044_planner_menu_preview_staging.sql`
- [x] PR #127, #130–#135

### Moduli operativi
- [x] Meal Prep — migration `045`, PR #136
- [x] Lista spesa — migration `046`, PR #137
- [x] Fix lista spesa — migration `047` e `048`, PR #138 e #145
- [x] Calendario — PR #143 e #144
- [x] Notifiche — migration `049`, PR #146
- [x] Planner Hub — PR #147
- [x] Planner AI — PR #167

## Release 0.9 — Esperienza operativa ✅
- [x] Dashboard Operativa — PR #148
- [x] Learning Hub — PR #149
- [x] Analytics personali — PR #150
- [x] Esperimenti — migration `050_recipe_experiments_core.sql`
- [x] Versioni ricette — migration `051_recipe_versions_core.sql`
- [x] AI Hub — PR #168
- [x] Navigazione AI consolidata — PR #169–#171
- [x] Suite automatica 137/137 — PR #172

## Release 1.0 — Integrazione e collaudo 🟡

### Integrazione diretta ChatGPT → Cucina Hub
- [ ] Endpoint autenticato
- [ ] Riutilizzo del contratto `cucina-hub.menu-plan` v1
- [ ] `owner_user_id` derivato dal JWT
- [ ] Creazione della sola preview/staging
- [ ] Nessun commit automatico nel Planner
- [ ] Conferma finale obbligatoria nell'app
- [ ] Idempotenza e provenienza ChatGPT
- [ ] Test di sicurezza e test end-to-end
- [ ] Validazione iPhone/iPad
- [ ] Merge

### Gate Release 1.0
- [x] Suite automatica: baseline S01 401/401; branch S02 436/436 (23 ottobre 2026), senza attribuire i mock a test runtime.
- [ ] Smoke test autenticazione
- [ ] Smoke test navigazione principale e Dashboard
- [ ] Smoke test Planner completo
- [ ] Smoke test app shell offline
- [ ] Test reale Chef AI
- [ ] Test reale Fermentation Assistant
- [ ] Test reale Planner AI
- [ ] Test reale RAG e fonti
- [ ] Aggiornamento documentazione finale
- [ ] Tag Release 1.0

---

**Aggiornato:** 23 ottobre 2026 (evidenze S01/S02; baseline funzionale del 29 agosto conservata).

**Stato corrente:** S01 PARTIALLY VERIFIED; S02 validata automaticamente sul branch, collaudo manuale pendente. Release 1.0 aperta.

**Prossimo passo:** review PR S02 e successivi collaudi autorizzati, senza merge/deploy automatico.
