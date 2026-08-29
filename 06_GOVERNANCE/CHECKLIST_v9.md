# CHECKLIST v9

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
- [x] Suite automatica completa: 139/139
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

**Aggiornato:** 29 agosto 2026  
**Stato corrente:** Release 0.8 e 0.9 implementate; Release 1.0 in fase di integrazione e collaudo.  
**Ultimo step completato:** stabilizzazione della suite PWA, 137/137 test superati (PR #172).  
**Prossimo task operativo:** endpoint autenticato ChatGPT → staging Planner, con conferma finale obbligatoria nell'app.
