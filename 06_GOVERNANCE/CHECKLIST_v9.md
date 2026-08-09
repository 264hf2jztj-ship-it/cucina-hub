# CHECKLIST v9

## Milestone A — Knowledge Base
- [x] Database
- [x] Ricette
- [x] Manuali
- [x] Elettrodomestici
- [x] Corsi
- [x] Import ZIP
- [x] Import incrementale
- [x] Storage ibrido
- [x] Archivio esterno

## Milestone B — Laboratorio

### 8.4.1 Profili ambiente
- [x] Completato

### 8.4.2 Profili impasto
- [x] Database
- [x] CRUD
- [x] Collegamento profilo ambiente
- [x] Parametri fermentazione
- [x] Parametri ingredienti
- [x] Processo impasto
- [x] Obiettivo temporale
- [x] Test
- [x] Merge

### 8.4.3 Sessioni impasto
- [x] Database
- [x] CRUD
- [x] Duplica sessione
- [x] Storico
- [x] Foto
- [x] Test
- [x] Merge

### 8.4.4 Timeline intelligente
- [x] Motore timeline
- [x] Correzione temperatura
- [x] Correzione umidità
- [x] Correzione frigorifero
- [x] Notifiche / Calendario
- [x] Test

### 8.4.5 Diario fermentazioni
- [x] Valutazione
- [x] Foto
- [x] Note
- [x] Learning
- [x] Esclusione delle sessioni fittizie dal Learning
- [x] Test

### 8.4.6A Importazione Chat progetto Cucina → Wizard
- [x] Contratto `cucina-hub.chat-recipe` versione 1
- [x] Parser JSON e blocchi copiati dalla chat
- [x] Validazione di formula, formato, fermentazione, forno e guardrail
- [x] Collegamento dei profili farina
- [x] Collegamento del profilo ambiente
- [x] Anteprima prima del trasferimento
- [x] Conferma esplicita
- [x] Trasferimento e generazione della proposta del Wizard
- [x] Provenienza dalla chat conservata nel workflow
- [x] Nessun salvataggio automatico
- [x] Blocco di sicurezza validato
- [x] Test iPad completato
- [x] Merge PR #110

### 8.4.6 AI Fermentation Assistant — rinviato alla fase AI finale
- [x] Richiesta strutturata in anteprima
- [x] Contratto e validatore della risposta
- [x] Prototipo server-side e ADR del provider
- [ ] Configurazione della chiave API
- [ ] Deploy della Edge Function
- [ ] Test con generazione reale
- [ ] Integrazione con Biblioteca, Planner e Learning

> La configurazione e l’uso del provider AI sono intenzionalmente sospesi per evitare costi e consumo API durante lo sviluppo delle sezioni principali.

## Milestone C
- [ ] Knowledge Objects
- [ ] Tag Engine
- [ ] Ricerca globale
- [ ] Knowledge Graph

## Milestone D
- [ ] AI operativa
- [ ] Chat interna
- [ ] RAG
- [ ] Assistenti specializzati

## Milestone E
- [ ] Planner
- [ ] Meal Prep
- [ ] Calendario
- [ ] Lista spesa
- [ ] Dashboard

**Target:** Release 1.0

---

**Aggiornato:** 9 agosto 2026  
**Stato corrente:** Milestone B completata nella modalità senza provider AI; prossimo step operativo `Milestone C — Knowledge Objects`.
