# Contratto `cucina-hub.menu-plan` — versione 1

| Campo | Valore |
|---|---|
| Progetto | Cucina Hub |
| Data | 2026-08-12 |
| Stato | Attivo per sviluppo |
| Ambito | Planner / import menu |
| ADR | ADR-011 |

## Scopo

Questo contratto descrive il pacchetto strutturato usato per trasferire un menu nel Planner di Cucina Hub.

La versione 1 nasce per l'importazione manuale di menu quindicinali generati nella chat dedicata ad Allenamento e Dieta, ma non codifica una durata fissa di 14 giorni. Lo stesso contratto potrà essere riutilizzato in futuro da un endpoint autenticato ChatGPT → Cucina Hub.

Il contratto descrive il contenuto del menu. Non autorizza scritture automatiche.

## Guardrail obbligatori

Ogni pacchetto deve includere esattamente:

```json
"guardrails": {
  "preview_only": true,
  "automatic_save": false,
  "requires_user_confirmation": true
}
```

Un pacchetto che non rispetta tutti e tre i valori deve essere rifiutato prima dell'anteprima.

## Struttura generale

```json
{
  "contract": "cucina-hub.menu-plan",
  "version": 1,
  "menu": {
    "external_id": "diet-plan-2026-08-17",
    "revision": 1,
    "title": "Menu 17–30 agosto 2026",
    "period_start": "2026-08-17",
    "period_end": "2026-08-30",
    "source": {
      "type": "chatgpt_project",
      "label": "Allenamento e Dieta",
      "generated_at": "2026-08-16T18:30:00+02:00"
    }
  },
  "days": [],
  "guardrails": {
    "preview_only": true,
    "automatic_save": false,
    "requires_user_confirmation": true
  }
}
```

## Campi top-level

### `contract`

Obbligatorio. Valore esatto:

`cucina-hub.menu-plan`

### `version`

Obbligatorio. Intero. Per questo documento il valore è `1`.

### `menu`

Obbligatorio. Descrive identità, periodo e provenienza del pacchetto.

### `days`

Obbligatorio. Array dei giorni contenuti nel menu.

### `guardrails`

Obbligatorio. Deve rispettare i tre valori di sicurezza definiti sopra.

## Oggetto `menu`

### `external_id`

Obbligatorio. Stringa stabile assegnata dalla sorgente al menu.

Deve restare invariata tra revisioni dello stesso menu.

Esempio:

`diet-plan-2026-08-17`

### `revision`

Obbligatorio. Intero maggiore o uguale a 1.

Una modifica sostanziale allo stesso menu incrementa la revisione.

### `title`

Facoltativo. Etichetta leggibile dall'utente.

### `period_start`

Obbligatorio. Data locale `YYYY-MM-DD`.

### `period_end`

Obbligatorio. Data locale `YYYY-MM-DD`, non precedente a `period_start`.

Tutti i giorni presenti in `days` devono ricadere nel periodo dichiarato.

### `source`

Obbligatorio.

Campi:

- `type`: uno tra `chatgpt_project`, `manual`, `other`;
- `label`: stringa leggibile che identifica la provenienza;
- `generated_at`: facoltativo, timestamp RFC 3339.

`owner_user_id` non fa parte del contratto e non deve essere accettato dal payload.

## Oggetto `day`

Ogni elemento di `days` ha la forma:

```json
{
  "date": "2026-08-17",
  "meals": []
}
```

### `date`

Obbligatorio. Data locale `YYYY-MM-DD`, unica all'interno del pacchetto.

### `meals`

Obbligatorio. Array dei pasti del giorno.

## Oggetto `meal`

```json
{
  "key": "2026-08-17-breakfast",
  "slot": "breakfast",
  "time": "07:00",
  "servings": 1,
  "note": null,
  "items": []
}
```

### `key`

Obbligatorio. Identificativo stabile del pasto all'interno del menu. Deve essere unico nell'intero pacchetto e mantenuto tra revisioni quando il pasto rappresenta lo stesso elemento logico.

### `slot`

Obbligatorio. Valori supportati:

- `breakfast`
- `morning_snack`
- `lunch`
- `afternoon_snack`
- `dinner`
- `other`

Sono gli stessi valori del Planner Core.

### `time`

Facoltativo. Orario locale `HH:MM` in formato 24 ore.

### `servings`

Facoltativo. Intero tra 1 e 50.

### `note`

Facoltativo. Nota testuale del pasto.

### `items`

Obbligatorio. Array non vuoto degli elementi che compongono il pasto.

## Oggetto `item`

Ogni elemento possiede sempre:

- `key`: identificativo stabile e unico nel pasto;
- `type`: `recipe`, `food` oppure `preparation`.

La semantica dei campi successivi dipende da `type`.

## Item `recipe`

Rappresenta un riferimento a una ricetta esistente della Biblioteca.

```json
{
  "key": "morning-juice",
  "type": "recipe",
  "recipe_code": "RC-003",
  "label": "Good Boy"
}
```

Campi:

- `recipe_code`: obbligatorio; codice stabile della Biblioteca;
- `label`: facoltativo e solo descrittivo.

Vincoli:

- `ingredients` non è ammesso;
- `procedure` non è ammesso;
- la quantità degli ingredienti non viene duplicata nel menu;
- il resolver deve trovare una sola ricetta del proprietario con quel codice.

Se il codice non è risolto, l'importazione genera `missing_library_reference`.

Se il codice risolve più di una ricetta, l'importazione genera `ambiguous_library_reference`.

## Regola specifica Hurom

Quando un estratto del Manuale Personale Hurom E30ST dispone di un codice stabile in Biblioteca, deve essere espresso come item `recipe` tramite `recipe_code`.

Il pacchetto non deve duplicare ingredienti o procedimento dell'estratto.

La modifica del nome visualizzato non cambia l'identità: il codice è il riferimento autorevole.

## Item `food`

Rappresenta un alimento semplice che non richiede una ricetta della Biblioteca.

```json
{
  "key": "greek-yogurt",
  "type": "food",
  "label": "Yogurt greco",
  "quantity": 170,
  "unit": "g",
  "note": null
}
```

Campi:

- `label`: obbligatorio;
- `quantity`: facoltativo, numero positivo;
- `unit`: facoltativo se `quantity` è assente, obbligatorio quando `quantity` è presente;
- `note`: facoltativo.

La versione 1 non impone un catalogo globale delle unità. Il validatore normalizza almeno `g`, `kg`, `ml`, `l`, `piece`, `slice`, `portion` e conserva le altre unità come testo controllato.

## Item `preparation`

Rappresenta una preparazione autonoma strutturata che resta nel Planner e non crea automaticamente una ricetta in Biblioteca.

```json
{
  "key": "quick-salad",
  "type": "preparation",
  "label": "Insalata veloce",
  "quantity": 1,
  "unit": "portion",
  "ingredients": [
    {
      "name": "Insalata mista",
      "quantity": 120,
      "unit": "g"
    },
    {
      "name": "Olio EVO",
      "quantity": 10,
      "unit": "g"
    }
  ],
  "procedure": [
    "Condisci l'insalata subito prima di servire."
  ],
  "note": null
}
```

Campi:

- `label`: obbligatorio;
- `quantity`: facoltativo;
- `unit`: facoltativo se `quantity` è assente, obbligatorio quando `quantity` è presente;
- `ingredients`: facoltativo, array di ingredienti strutturati;
- `procedure`: facoltativo, array ordinato di stringhe non vuote;
- `note`: facoltativo.

Ogni ingrediente strutturato usa:

- `name`: obbligatorio;
- `quantity`: facoltativo, numero positivo;
- `unit`: facoltativo se `quantity` è assente, obbligatorio quando `quantity` è presente.

Una `preparation` non viene promossa automaticamente a ricetta. Un eventuale comando futuro “Salva in Biblioteca” sarà un workflow separato e confermato dall'utente.

## Esempio completo minimo

```json
{
  "contract": "cucina-hub.menu-plan",
  "version": 1,
  "menu": {
    "external_id": "diet-plan-2026-08-17",
    "revision": 1,
    "title": "Menu 17–30 agosto 2026",
    "period_start": "2026-08-17",
    "period_end": "2026-08-30",
    "source": {
      "type": "chatgpt_project",
      "label": "Allenamento e Dieta",
      "generated_at": "2026-08-16T18:30:00+02:00"
    }
  },
  "days": [
    {
      "date": "2026-08-17",
      "meals": [
        {
          "key": "2026-08-17-breakfast",
          "slot": "breakfast",
          "time": "07:00",
          "servings": 1,
          "items": [
            {
              "key": "juice",
              "type": "recipe",
              "recipe_code": "RC-003",
              "label": "Good Boy"
            },
            {
              "key": "yogurt",
              "type": "food",
              "label": "Yogurt greco",
              "quantity": 170,
              "unit": "g"
            }
          ]
        }
      ]
    }
  ],
  "guardrails": {
    "preview_only": true,
    "automatic_save": false,
    "requires_user_confirmation": true
  }
}
```

## Validazione strutturale

Il pacchetto viene rifiutato prima della preview se almeno una delle seguenti condizioni è vera:

- contratto o versione non supportati;
- guardrail diversi dai valori obbligatori;
- periodo non valido;
- giorno fuori dal periodo;
- date duplicate;
- `meal.key` duplicati;
- `item.key` duplicati nello stesso pasto;
- slot non supportato;
- `items` vuoto;
- item con tipo non supportato;
- item `recipe` senza `recipe_code`;
- item `recipe` che incorpora ingredienti o procedimento;
- quantità non positive;
- unità mancante quando è presente una quantità.

## Risoluzione Biblioteca

Dopo la validazione strutturale e prima della preview, tutti gli item `recipe` vengono risolti contro la Biblioteca dell'utente.

Il pacchetto originale conserva il codice esterno; il database salva l'UUID effettivo della ricetta nel relativo `planned_meal_item`.

La risoluzione non crea ricette mancanti.

## Idempotenza

Il motore calcola un `payload_hash` sul JSON canonicalizzato.

La chiave logica è:

```text
owner_user_id + source.type + menu.external_id + menu.revision
```

Regole:

1. Chiave uguale e hash uguale → `already_imported`, nessuna scrittura.
2. Chiave uguale e hash diverso → `same_revision_payload_mismatch`, conflitto bloccante.
3. Stesso `external_id`, revisione maggiore → nuova revisione in preview.
4. Nuovo `external_id` → nuovo menu.

## Conflitti

La preview deve poter distinguere almeno:

- `missing_library_reference`;
- `ambiguous_library_reference`;
- `same_revision_payload_mismatch`;
- `overlapping_menu_package`;
- `existing_manual_meal`;
- `user_modified_imported_meal`;
- `user_modified_imported_item`.

Nessun conflitto autorizza un overwrite automatico.

## Stato di importazione

La versione 1 prevede almeno gli stati logici:

- `preview`;
- `confirmed`;
- `superseded`;
- `cancelled`.

Un pacchetto ricevuto o analizzato resta `preview` finché l'utente non conferma.

## Conferma

La conferma deve avvenire tramite un'azione esplicita dell'utente nell'interfaccia di Cucina Hub.

Solo dopo la conferma il sistema esegue la transazione atomica che crea o aggiorna menu, pasti ed elementi secondo le risoluzioni scelte nella preview.

## Compatibilità con l'import manuale

La prima implementazione accetta il JSON incollato o caricato dall'utente nel Planner.

Il parser può rimuovere un singolo blocco Markdown ```json ... ``` quando il contenuto viene copiato direttamente da una chat, come già avviene nel workflow Chat → Wizard.

## Integrazione diretta futura

Un futuro endpoint autenticato userà lo stesso payload.

Il trasporto non modifica il contratto: l'endpoint valida, risolve e prepara la preview, ma non attiva il menu senza conferma.

`owner_user_id` viene sempre derivato dal JWT autenticato e non dal JSON.

## Versionamento futuro

Qualsiasi modifica incompatibile richiede una nuova versione del contratto. La versione 1 deve continuare a essere riconoscibile e validabile anche dopo l'introduzione di versioni successive.
