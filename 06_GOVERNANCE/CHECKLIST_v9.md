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

## Milestone C ✅
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
- [x] Knowledge Graph MVP
  - [x] Tabella `knowledge_relations`
  - [x] Relazioni esplicite e tipizzate tra Knowledge Object
  - [x] Tipi supportati: `uses`, `compatible_with`, `derives_from`, `replaces`, `requires`, `related_to`, `executed_with`, `improved_by`
  - [x] Blocco delle auto-relazioni e dei duplicati, inclusi quelli invertiti per le relazioni simmetriche
  - [x] RLS con verifica della proprietà di entrambi i nodi
  - [x] Vista iPad-first con grafo visuale e lista accessibile
  - [x] Creazione, centratura ed eliminazione delle relazioni validate
  - [x] Test iPad completato
  - [x] Merge PR #120

## Milestone D — rinviata alla fase AI finale
- [ ] AI operativa
- [ ] Chat interna
- [ ] RAG
- [ ] Assistenti specializzati

## Milestone E
- [ ] Planner
  - [x] Planner Core MVP
    - [x] Tabella personale `planned_meals` collegata alle ricette della Biblioteca tramite FK, senza duplicazione dei contenuti
    - [x] Data, fascia del pasto, orario facoltativo, porzioni e nota
    - [x] Vincoli, indici, blocco dei duplicati e RLS per proprietario
    - [x] Creazione, modifica ed eliminazione dei pasti pianificati
    - [x] Elenco cronologico raggruppato per giorno
    - [x] Stati di caricamento, autenticazione assente, vuoto, successo ed errore
    - [x] UI touch-first e accesso dalla navigazione principale
    - [x] Test iPad completato
    - [x] Merge PR #122
  - [x] Vista settimanale
    - [x] Intervallo lunedì-domenica
    - [x] Navigazione settimana precedente / oggi / successiva
    - [x] Giorni vuoti sempre visibili
    - [x] Aggiunta con data precompilata dalla griglia
    - [x] Modifica diretta dalla card del pasto
    - [x] Query Supabase limitata alla settimana selezionata
    - [x] UI touch-first e test iPad completato
    - [x] Merge PR #124
  - [ ] Menu quindicinali / Menu Package
    - [x] Modello `Menu Package → Planned Meal → Planned Meal Item` accettato
    - [x] ADR-011 `Menu package e pasti multi-elemento nel Planner`
    - [x] Contratto `cucina-hub.menu-plan` versione 1
    - [x] Periodo espresso con `period_start` / `period_end`, senza durata hard-coded
    - [x] Tipi elemento definiti: `recipe`, `food`, `preparation`
    - [x] Regola Hurom: usare i codici stabili della Biblioteca quando disponibili, senza duplicare ingredienti e procedimento
    - [x] Idempotenza definita tramite provenienza, `external_id`, revisione e `payload_hash`
    - [x] Guardrail obbligatori: preview, nessun salvataggio automatico, conferma esplicita
    - [x] Integrazione diretta ChatGPT → Cucina Hub separata e rinviata a endpoint autenticato
    - [ ] Migration `planner_menu_packages`
    - [ ] Migration `planned_meal_items`
    - [ ] Evoluzione compatibile di `planned_meals`
    - [ ] Migrazione dei `recipe_id` esistenti in item `recipe`
    - [ ] Vincoli, indici e RLS per proprietario
    - [ ] Parser `cucina-hub.menu-plan` v1
    - [ ] Validatore strutturale e guardrail
    - [ ] Resolver dei `recipe_code` della Biblioteca
    - [ ] Gestione specifica riferimenti Hurom
    - [ ] Calcolo `payload_hash` e protezione dai retry
    - [ ] Anteprima importazione
    - [ ] Conflict engine
    - [ ] Conflitti con pasti manuali e menu sovrapposti
    - [ ] Protezione dei pasti/elementi modificati manualmente
    - [ ] Conferma esplicita prima del commit
    - [ ] Commit atomico del pacchetto
    - [ ] Vista/import quindicinale iPad-first
    - [ ] Test iPad
    - [ ] Merge
  - [ ] Integrazione diretta ChatGPT → Cucina Hub
    - [ ] Endpoint autenticato
    - [ ] Riutilizzo del contratto `cucina-hub.menu-plan`
    - [ ] `owner_user_id` derivato dal JWT
    - [ ] Creazione della sola preview/staging
    - [ ] Conferma finale obbligatoria nell'app
- [ ] Meal Prep
- [ ] Calendario
- [ ] Lista spesa
- [ ] Dashboard

**Target:** Release 1.0

---

**Aggiornato:** 12 agosto 2026

**Stato corrente:** Milestone E — Planner in corso; Planner Core e vista settimanale sono completati e validati su iPad. L'architettura dei menu quindicinali è definita con ADR-011 e contratto `cucina-hub.menu-plan` v1. Prossimo task operativo: database Menu Package + pasti multi-elemento. Milestone D — AI resta rinviata alla fase finale.
