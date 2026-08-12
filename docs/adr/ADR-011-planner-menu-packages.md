# ADR-011 — Menu package e pasti multi-elemento nel Planner

| Campo | Valore |
|---|---|
| Progetto | Cucina Hub |
| Data | 2026-08-12 |
| Stato | Accettato |
| Ambito | Planner / Menu quindicinali |

## Contesto

Il Planner Core MVP rappresenta oggi un pasto pianificato tramite `planned_meals` e lo collega direttamente a una singola ricetta della Biblioteca. La vista settimanale costruita sopra questo modello è adatta alla pianificazione manuale, ma non rappresenta correttamente un menu quindicinale proveniente da una dieta strutturata.

Un pasto reale può infatti essere composto da più elementi: una ricetta principale, un contorno, un alimento semplice, un estratto Hurom o una preparazione autonoma che non merita ancora una scheda completa in Biblioteca.

Il progetto deve inoltre poter importare periodicamente menu generati nella chat dedicata ad Allenamento e Dieta, mantenendo anteprima, controllo dei conflitti e conferma esplicita. L'integrazione diretta ChatGPT → Cucina Hub è prevista come fase successiva e non deve condizionare il modello dati del Planner.

## Alternative considerate

1. Continuare a salvare un solo `recipe_id` per ogni pasto.
2. Creare una ricetta temporanea in Biblioteca per ogni elemento del menu.
3. Salvare il menu come JSON monolitico senza entità relazionali.
4. Introdurre un modello `Menu Package → Meal → Meal Items`, mantenendo la Biblioteca come fonte autorevole quando esiste una ricetta riutilizzabile.

## Decisione

Viene adottato il modello:

```text
Menu Package
  └── Planned Meal
        └── Planned Meal Item (1..n)
```

### Menu Package

Il menu è un oggetto di primo livello del Planner e descrive almeno:

- proprietario;
- titolo facoltativo;
- `period_start` e `period_end`;
- provenienza;
- identificativo esterno stabile;
- revisione;
- hash del payload;
- stato dell'importazione;
- data di conferma;
- eventuale relazione con una revisione precedente.

Il database non codifica una durata fissa di 14 giorni. Il menu quindicinale è il formato operativo iniziale, mentre `period_start` e `period_end` consentono periodi diversi senza cambiare schema.

### Planned Meal

`planned_meals` continua a rappresentare data, fascia, orario facoltativo, porzioni e note. Può essere:

- manuale, con `menu_package_id` nullo;
- proveniente da un menu, con `menu_package_id` valorizzato.

La ricetta non è più una proprietà obbligatoria del pasto: il contenuto del pasto viene espresso tramite gli elementi collegati.

### Planned Meal Item

Ogni pasto contiene uno o più elementi ordinati. La prima versione supporta tre tipi:

- `recipe`: riferimento a una ricetta esistente della Biblioteca;
- `food`: alimento semplice strutturato, con nome, quantità e unità quando disponibili;
- `preparation`: preparazione autonoma strutturata, mantenuta nel Planner senza creare automaticamente una ricetta in Biblioteca.

Un elemento `recipe` conserva il riferimento alla ricetta originale e non ne duplica ingredienti o procedimento.

## Riferimenti Hurom

Quando un estratto Hurom è già presente in Biblioteca con un codice stabile derivato dal Manuale Personale Hurom E30ST, il menu deve usare quel codice come riferimento.

Il resolver dell'importazione traduce il codice stabile nell'UUID reale della ricetta. In questo caso il payload non deve ridefinire ingredienti o procedimento.

Se un codice dichiarato non esiste nella Biblioteca, l'importazione produce un conflitto `missing_library_reference` e non crea silenziosamente una copia della ricetta.

## Contratto di importazione

Il formato di scambio iniziale è:

`cucina-hub.menu-plan` versione `1`.

Il contratto è indipendente dal canale di trasporto: la stessa struttura potrà essere incollata manualmente nell'app oppure inviata in futuro a un endpoint autenticato.

## Idempotenza

Ogni menu importato possiede almeno:

- `source.type`;
- `menu.external_id`;
- `menu.revision`;
- `payload_hash` calcolato sul payload canonicalizzato.

Comportamento richiesto:

- stesso ID, stessa revisione e stesso hash → importazione già eseguita, nessuna nuova scrittura;
- stesso ID e revisione ma hash diverso → conflitto bloccante;
- stesso ID con revisione successiva → anteprima delle differenze e possibile sostituzione controllata;
- nuovo ID → nuova importazione.

Un vincolo univoco database deve impedire duplicazioni anche in caso di doppio tap, retry o connessione instabile.

## Anteprima, conflitti e conferma

L'importazione segue sempre il flusso:

```text
Parsing
→ Validazione contratto
→ Risoluzione riferimenti Biblioteca
→ Controllo idempotenza
→ Analisi conflitti
→ Anteprima
→ Conferma esplicita
→ Transazione atomica
```

La preview deve mostrare almeno giorni, pasti, elementi, riferimenti Biblioteca risolti, elementi autonomi, riferimenti Hurom, warning e conflitti.

Nessun conflitto viene risolto tramite overwrite automatico. Le azioni possibili devono essere esplicite, ad esempio mantenere l'esistente, usare il nuovo valore, saltare l'elemento, mappare una ricetta o annullare l'importazione.

## Modifiche manuali successive all'import

Pasti ed elementi importati restano modificabili dall'utente. Il sistema deve però conservare l'informazione che un record è stato modificato dopo l'importazione.

Una revisione successiva del menu non può sovrascrivere automaticamente un record marcato come modificato manualmente: deve evidenziare il conflitto nella preview.

## Compatibilità con il Planner esistente

La futura migration deve preservare i pasti esistenti. Ogni `planned_meals.recipe_id` già presente verrà convertito in un singolo `planned_meal_item` di tipo `recipe` collegato allo stesso UUID.

La vista settimanale e il CRUD restano la base del Planner; il renderer viene esteso per mostrare più elementi nello stesso pasto.

## Integrazione diretta ChatGPT → Cucina Hub

L'integrazione diretta è una fase separata.

Quando verrà implementata:

- userà un endpoint autenticato, preferibilmente una Supabase Edge Function;
- riceverà lo stesso contratto `cucina-hub.menu-plan`;
- ricaverà `owner_user_id` dal JWT e non dal payload;
- creerà una richiesta di importazione/preview, non un menu attivo;
- manterrà obbligatoria la conferma esplicita nell'app prima del commit finale.

## Sicurezza e dati

- RLS su tutte le nuove tabelle personali;
- `owner_user_id = auth.uid()` su letture e scritture;
- verifica della proprietà delle ricette collegate;
- nessuna chiave o token nel frontend;
- nessuna scrittura automatica durante la sola anteprima;
- commit finale atomico dopo conferma.

## Conseguenze positive

- Il Planner rappresenta pasti composti senza forzare tutto in Biblioteca.
- Le ricette esistenti restano la fonte autorevole.
- Gli estratti Hurom non vengono duplicati.
- Il formato è idempotente e resistente ai retry.
- Il canale manuale e il futuro endpoint usano lo stesso contratto.
- Il modello resta compatibile con Meal Prep, lista spesa e Learning futuri.

## Conseguenze negative

- `planned_meals` deve essere evoluta senza perdere i dati esistenti.
- La UI deve gestire più elementi per pasto.
- L'importazione richiede un resolver dei riferimenti e un conflict engine.
- Una revisione del menu introduce logica di confronto e protezione delle modifiche manuali.

## Fuori ambito di questo ADR

- Generazione AI interna del menu.
- Attivazione dell'endpoint ChatGPT → Cucina Hub.
- Meal Prep automatico.
- Generazione della lista spesa.
- Calcolo nutrizionale automatico.
