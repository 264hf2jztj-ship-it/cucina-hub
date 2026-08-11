# ROADMAP v9

## Release 0.8 — Knowledge & AI

### Milestone A — Knowledge Base ✅
- Database
- Manuali
- Ricette
- Corsi
- Import ZIP
- Storage ibrido
- Archivio esterno iCloud

### Milestone B — Laboratorio ✅
- ✅ 8.4.1 Profili ambiente
- ✅ 8.4.2 Profili impasto
- ✅ 8.4.3 Sessioni impasto
- ✅ 8.4.4 Timeline intelligente
- ✅ 8.4.5 Diario fermentazioni
- ✅ 8.4.6A Importazione Chat progetto Cucina → Wizard
- ✅ 8.4.6B Supporto impasti fritti / contratto Chat→Wizard v2
- ⏸️ 8.4.6 AI Fermentation Assistant — infrastruttura prototipata; configurazione del provider, consumo API e attivazione operativa rinviati alla fase AI finale del progetto

> Stato del supporto impasti fritti: validati trasferimento dalla chat, salvataggio sessione, Sessione Guidata, frittura, gestione piastra a induzione e più lavorazioni. Il numero di lavorazioni (`mixing_batches`) è attualmente fornito dal pacchetto JSON; la suddivisione automatica in base alla capacità dell’impastatrice non è implementata.

### Milestone C — Knowledge ✅
- ✅ Knowledge Objects — MVP con CRUD, collegamenti tipizzati alle fonti, RLS e test iPad completato (PR #114)
- ✅ Tag Engine — MVP con catalogo condiviso, collegamenti tipizzati ai contenuti, RLS e test iPad completato (PR #116)
- ✅ Ricerca globale — MVP con indice derivato, ricerca unificata, filtri per tipo/tag e test iPad completato (PR #118)
- ✅ Knowledge Graph — MVP con relazioni esplicite e tipizzate tra Knowledge Object, vincoli di integrità, RLS, vista grafica/lista e test iPad completato (PR #120)

### Milestone D — AI
- Assistente AI
- RAG
- Chef AI
- Fermentation AI
- Planner AI

> Decisione operativa: durante lo sviluppo delle sezioni non-AI, le ricette vengono preparate e perfezionate nella chat del progetto Cucina e trasferite in Cucina Hub tramite pacchetti strutturati e validati. L’AI interna verrà attivata soltanto quando Biblioteca, Laboratorio, Planner e Learning saranno sufficientemente completi.

### Milestone E — Planner
- ✅ Planner Core MVP — pianificazione manuale collegata alle ricette della Biblioteca, CRUD, vincoli, RLS e test iPad completato (PR #122)
- Vista settimanale
- Meal Prep
- Menu
- Lista spesa
- Calendario
- Notifiche

## Release 0.9
- Dashboard
- Learning
- Analytics
- Esperimenti
- Versioni ricette

**Target:** Release 1.0

---

**Aggiornato:** 11 agosto 2026

**Step completato:** Milestone E — Planner Core MVP (PR #122), validato su iPad

**Macro-step in corso:** Milestone E — Planner

**Prossimo task operativo:** vista settimanale del Planner; Milestone D — AI resta rinviata alla fase AI finale, dopo il completamento delle sezioni principali
