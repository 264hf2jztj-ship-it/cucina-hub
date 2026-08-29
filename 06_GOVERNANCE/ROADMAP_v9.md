# ROADMAP v9

## Stato consolidato al 29 agosto 2026

Cucina Hub ha completato i blocchi funzionali previsti per le Release 0.8 e 0.9. Il repository `main` include le migration fino alla `054_rag_natural_language_search.sql`, l'AI Hub e il Planner AI.

## Release 0.8 — Knowledge, Laboratorio, Planner e AI

### Milestone A — Knowledge Base ✅
- Database, manuali, ricette e corsi
- Import ZIP e incrementale
- Storage ibrido e archivio esterno iCloud
- Biblioteca Supabase e collegamenti ai materiali

### Milestone B — Laboratorio ✅
- Profili ambiente e profili impasto
- Sessioni, timeline intelligente e correzioni operative
- Diario fermentazioni, foto, note e Learning
- Import Chat → Wizard v1
- Supporto impasti fritti / Chat → Wizard v2
- Fermentation Assistant attivato con provider server-side (PR #154)

> Il Wizard calcola automaticamente `mixing_batches` in base al limite operativo della DCG KM1401R, senza ridurre eventuali suddivisioni più prudenti ricevute dal pacchetto Chat → Wizard.

### Milestone C — Knowledge ✅
- Knowledge Objects (PR #114)
- Tag Engine (PR #116)
- Ricerca globale (PR #118)
- Knowledge Graph (PR #120)

### Milestone D — AI ✅
- Fermentation Assistant operativo (PR #154)
- RAG privato per le fonti della Biblioteca, con RLS e ricerca per proprietario (PR #155)
- Ingestione controllata e diretta dei PDF (PR #157–#159)
- Ricerca RAG in linguaggio naturale (PR #160)
- Supporto PDF verificato fino a 32 MB (PR #161)
- Chef AI contestuale, server-side e con citazioni strutturate (PR #162)
- Lettore privato EPUB/PDF sul dispositivo, con ricerca e segnalibri locali (PR #163 e fix successivi)
- Planner AI read-only e preview-first (PR #167)
- AI Hub con accesso unificato agli assistenti e alle fonti (PR #168)
- Navigazione AI consolidata: una sola card “Assistente AI” nella Dashboard, con ritorno all'AI Hub dalle sezioni AI (PR #169–#171)

### Milestone E — Planner ✅
- Planner Core MVP (PR #122)
- Vista settimanale (PR #124)
- Menu Package e pasti multi-elemento
  - migration `041_planner_menu_packages.sql`
  - parser e resolver delle ricette (PR #127)
  - idempotenza e protezione dai retry (PR #130)
  - conflict engine (PR #131)
  - risoluzioni in anteprima (PR #132)
  - commit atomico (PR #133)
  - correzione runtime (PR #134)
  - staging autenticato della preview (PR #135)
- Meal Prep (PR #136)
- Lista spesa e correzioni di regressione (PR #137, #138 e #145)
- Calendario (PR #143 e #144)
- Notifiche (PR #146)
- Planner Hub (PR #147)
- Planner AI (PR #167)

## Release 0.9 — Esperienza operativa ✅
- Dashboard Operativa completa (PR #148)
- Learning Hub (PR #149)
- Analytics personali (PR #150)
- Esperimenti strutturati
- Versioni ricetta immutabili
- AI Hub e navigazione consolidata
- Suite automatica stabilizzata: 137/137 test superati (PR #172)

## Release 1.0 — Gate finale 🟡

### Prossimo task operativo
Integrazione diretta ChatGPT → Cucina Hub, mantenendo gli stessi guardrail del contratto `cucina-hub.menu-plan` v1:

1. endpoint autenticato;
2. `owner_user_id` derivato dal JWT;
3. creazione della sola preview/staging;
4. nessuna scrittura automatica nel Planner;
5. conferma finale obbligatoria nell'app;
6. idempotenza, tracciabilità della provenienza e test end-to-end.

### Chiusura Release 1.0
- Collaudo end-to-end su iPhone e iPad
- Verifica autenticazione, navigazione, app shell offline e moduli operativi
- Verifica reale dei tre assistenti AI e delle fonti
- Aggiornamento finale di documentazione e checklist

---

**Aggiornato:** 29 agosto 2026  
**Stato corrente:** Release 0.8 e 0.9 implementate; Release 1.0 in fase di integrazione e collaudo finale.  
**Ultimo step completato:** quality gate della suite automatica, 137/137 test superati (PR #172).  
**Prossimo task operativo:** endpoint autenticato ChatGPT → staging Planner, senza commit automatico.
