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

### 8.4.6B Supporto impasti fritti / Chat→Wizard v2
- [x] Contratto `cucina-hub.chat-recipe` versione 2
- [x] `product_style: fried_dough`
- [x] `cooking.method: deep_fry`
- [x] Profilo KitchenCraft inox Ø20 cm senza cestello
- [x] Piastra a induzione IKEA con potenze operative
- [x] Temperatura olio e tempo per lato
- [x] Nessuna fase frigorifero
- [x] Timeline con riscaldamento olio e frittura
- [x] Gestione olio e zucchero/miele nell’impasto
- [x] Più lavorazioni tramite `mixing_batches`
- [x] Salvataggio della sessione validato
- [x] Sessione Guidata validata
- [x] Flusso frittura e impostazioni induzione validati
- [x] Compatibilità pacchetti v1 da forno
- [x] Blocco di sicurezza validato
- [x] Merge PR #112

> Nota: `mixing_batches` è attualmente un input del pacchetto Chat→Wizard. La divisione automatica in base alla quantità di farina o alla capacità dell’impastatrice non è implementata e non va considerata una funzione completata.

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
- [x] Knowledge Objects MVP
  - [x] Tabelle `knowledge_objects` e `knowledge_object_links`
  - [x] CRUD dei Knowledge Object
  - [x] Collegamenti tipizzati a ricette, manuali, corsi, elettrodomestici e sessioni
  - [x] Integrità referenziale e blocco dei collegamenti duplicati
  - [x] RLS per proprietario e verifica della proprietà delle fonti
  - [x] UI iPad-first e accesso dalla navigazione principale
  - [x] Test iPad completato
  - [x] Merge PR #114
- [x] Tag Engine MVP
  - [x] Riuso del catalogo `tags` e dei collegamenti ricetta `recipe_tags`
  - [x] Tabella `tag_links` per Knowledge Object, manuali, corsi, elettrodomestici e sessioni
  - [x] Creazione, rinomina ed eliminazione dei tag
  - [x] Applicazione e rimozione dei tag sui sei tipi di contenuto
  - [x] Vincolo a singolo target e blocco dei collegamenti duplicati
  - [x] RLS per proprietario e verifica della proprietà delle fonti
  - [x] UI iPad-first e navigazione Knowledge
  - [x] Test iPad completato
  - [x] Merge PR #116
- [x] Ricerca globale MVP
  - [x] Indice unificato derivato al caricamento dai dati autorizzati via RLS
  - [x] Knowledge Object, ricette, manuali, corsi, elettrodomestici e sessioni
  - [x] Ricerca in titoli, ingredienti, tag, note e metadati
  - [x] Normalizzazione degli accenti e ordinamento per rilevanza
  - [x] Filtri per tipo e tag
  - [x] Azzeramento dei filtri e navigazione alle sezioni originali
  - [x] Nessuna copia persistente e nessuna migration aggiuntiva
  - [x] UI iPad-first e test iPad completato
  - [x] Merge PR #118
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

**Aggiornato:** 10 agosto 2026  
**Stato corrente:** Ricerca globale MVP completata e validata su iPad (PR #118); prossimo step operativo `Milestone C — Knowledge Graph`.
