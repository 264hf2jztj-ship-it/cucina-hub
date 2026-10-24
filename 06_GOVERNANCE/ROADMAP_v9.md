# ROADMAP v9

## Addendum operativo — 23 ottobre 2026

- **S01 PARTIALLY VERIFIED:** PR #196 unita; correzione distribuita dal commit `76de8766689708995b4752a9a1138d21ba747330` (Fermentation v3, Chef v2, Planner v2). Test anonimi live superati; il collaudo amministrativo iPhone/Safari/Comandi Rapidi del 23 ottobre ha verificato 3 health 200 con `configured=false` e 3 generazioni 503 `provider_not_configured`. Restano non verificati nel runtime isolato non admin e admin con ruolo revocato, stesso JWT.
- **S02:** protezioni frontend implementate e validate sul branch dedicato; suite completa 436/436, inclusi 35 nuovi test simulati. Review/merge e collaudo Safari iPhone/iPad ancora da eseguire; nessun rilascio frontend implicito.
- Release 1.0 ancora aperta. Evidenze, limiti e checklist: [registro sicurezza](RELEASE_1_0_SECURITY_VERIFICATION.md). Le sezioni del 29 agosto sotto restano una baseline storica, non una certificazione dello stato live attuale.

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

### Prossimo task operativo (indicazione storica del 29 agosto)
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

**Aggiornato:** 23 ottobre 2026 (addendum S01/S02; baseline funzionale del 29 agosto conservata).

**Stato corrente:** Release 1.0 non chiusa; S01 parzialmente verificata, S02 validata automaticamente sul branch.

**Prossimo passo:** review PR S02 e collaudo manuale autorizzato; nessun merge, deploy o intervento successivo automatico.
