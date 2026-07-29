# Mappatura JSON → Supabase

**Macrostep:** 5 — Migrazione dei dati JSON  
**Sottostep:** 5.1 — Definizione della mappatura  
**Stato:** in corso  
**Branch:** `agent/macrostep-5-json-mapping`

## Principi

- L'import deve essere idempotente: esecuzioni successive non devono creare duplicati.
- Le chiavi naturali da usare per gli upsert sono:
  - `recipes.code`
  - identificatore/slug per categorie, elettrodomestici e tag
  - nome normalizzato per gli ingredienti
- `owner_user_id` deve essere l'UUID dell'amministratore autenticato.
- I file JSON restano temporaneamente come backup fino alla verifica finale del Macrostep 5.
- Le relazioni molti-a-molti devono essere importate solo dopo la creazione delle entità principali.

## 1. `ricette.json` → `recipes`

| JSON | Colonna Supabase | Trasformazione |
|---|---|---|
| `codice` | `code` | Copia diretta; chiave naturale per upsert |
| `titolo` | `title` | Copia diretta |
| `stato` | `status` | `certificata` → `approved`; `da-testare` → `testing` |
| `categoria` | `description` | Usata inizialmente come descrizione sintetica; la categoria strutturata va in `recipe_categories` |
| `procedimento` | `instructions` | Array JSONB ordinato |
| `preparazione_serale` | `preparation_requirements` | JSONB, es. `{ "preparazione_serale": "..." }` |
| `resa` | `yield_text` | Copia diretta |
| `perche_funziona` | `method_summary` | Copia diretta |
| `nutrienti` | `nutrition_notes` | Copia diretta |
| `abbinamento` | `nutrition_notes` | Accodato in una sezione distinta quando presente |
| `nota_degustatore` | `personal_notes` | Copia provvisoria; sarà anche migrata in `tasting_notes` |
| `data_prova` | `last_cooked_at` | Data ISO `YYYY-MM-DD` |
| `filtro` | `temperature_notes` | Non compatibile semanticamente: non importare qui; conservare nel riferimento sorgente finché non si definisce un campo dedicato |
| `icona` | — | Non esiste una colonna verificata; conservare temporaneamente nel riferimento sorgente |
| `valutazione_globale` | — | Migrare in `tasting_notes`, non nella tabella principale |
| `sezioni` | — | Migrare tramite `recipe_categories` |
| `elettrodomestici` | — | Migrare tramite `recipe_appliances` |
| `ingredienti` | — | Migrare tramite `ingredients` e `recipe_ingredients` |
| `tags` | — | Migrare tramite `tags` e `recipe_tags` |

### Valori generati o predefiniti in `recipes`

| Colonna | Valore iniziale |
|---|---|
| `id` | generato da Supabase |
| `owner_user_id` | UUID dell'utente amministratore |
| `servings` | `null`, perché i JSON attuali descrivono soprattutto estratti in ml |
| `prep_time_minutes` | `null` |
| `cook_time_minutes` | `null` |
| `rest_time_minutes` | `null` |
| `passive_time_minutes` | `null` |
| `total_time_minutes` | `null` |
| `practical_signals` | `[]` |
| `tips` | `[]` |
| `variations` | `[]` |
| `substitutions` | `[]` |
| `meal_moments` | derivato da `categoria` e `tags` quando riconoscibile: `colazione`, `pomeriggio`, `post-corsa` |
| `storage_notes` | `null` |
| `family_notes` | `null` |
| `source_type` | `legacy_json` |
| `source_reference` | ID JSON originale, es. `rc-001-ace-zenzero`; può includere anche `icona` e `filtro` finché non esistono campi dedicati |
| `is_favorite` | `false` |
| `created_at`, `updated_at` | default database |
| `archived_at` | `null` |

## 2. `ingredienti[]` → `ingredients` + `recipe_ingredients`

Per ogni elemento:

```json
{
  "quantita": "1/2",
  "nome": "cetriolo"
}
```

- `ingredients`: upsert per nome normalizzato.
- `recipe_ingredients`: collega la ricetta all'ingrediente e conserva ordine e quantità testuale.
- Non convertire automaticamente quantità descrittive come `q.b.`, `un micro-pezzetto`, `qualche foglia` in valori numerici.
- La quantità originale deve restare integra per non perdere informazione.

La struttura esatta delle colonne di `ingredients` e `recipe_ingredients` deve ancora essere verificata.

## 3. `sezioni[]` → `categories` + `recipe_categories`

Esempio:

```json
"sezioni": ["hurom"]
```

- upsert della categoria per identificatore stabile;
- collegamento molti-a-molti in `recipe_categories`;
- la stringa libera `categoria` resta descrittiva e non sostituisce la relazione strutturata.

La struttura esatta delle colonne deve ancora essere verificata.

## 4. `elettrodomestici[]` → `appliances` + `recipe_appliances`

Esempio:

```json
"elettrodomestici": ["hurom-e30st"]
```

- upsert o lookup per identificatore stabile;
- collegamento in `recipe_appliances`;
- il primo elettrodomestico può essere marcato come principale solo se la tabella dispone di un campo dedicato.

La struttura esatta delle colonne deve ancora essere verificata.

## 5. `tags[]` → `tags` + `recipe_tags`

- normalizzazione prudente: trim, minuscole per lo slug, ma etichetta originale conservata;
- upsert per slug/nome normalizzato;
- collegamento in `recipe_tags`.

La struttura esatta delle colonne deve ancora essere verificata.

## 6. Dati di prova → `tasting_notes`

Campi sorgente:

- `nota_degustatore`
- `valutazione_globale`
- `data_prova`

Regola iniziale:

- una nota di degustazione per ogni ricetta che possiede almeno uno di questi campi;
- la valutazione resta numerica 1–5;
- la data usa `data_prova` quando disponibile;
- `personal_notes` in `recipes` conserva temporaneamente la nota anche durante la migrazione, ma potrà essere ripulito dopo il passaggio completo alla tabella dedicata.

La struttura esatta di `tasting_notes` deve ancora essere verificata.

## 7. Campi JSON senza destinazione definitiva

Questi dati non devono essere persi:

- `icona`
- `filtro`
- eventuali metadati futuri non presenti nello schema

Finché non viene aggiunta una colonna dedicata, saranno conservati in forma strutturata dentro `source_reference` oppure in un payload di import documentato. Non devono essere forzati in colonne semanticamente errate.

## 8. Ordine previsto di import

1. categorie
2. elettrodomestici
3. tag
4. ingredienti
5. ricette
6. `recipe_ingredients`
7. `recipe_categories`
8. `recipe_appliances`
9. `recipe_tags`
10. `tasting_notes`
11. changelog
12. metadati manuali

## 9. Verifiche ancora necessarie per chiudere il sottostep 5.1

- colonne e vincoli di `ingredients`
- colonne e vincoli di `recipe_ingredients`
- colonne e vincoli di `categories` e `recipe_categories`
- colonne e vincoli di `appliances` e `recipe_appliances`
- colonne e vincoli di `tags` e `recipe_tags`
- colonne e vincoli di `tasting_notes`
- colonne di `changelog_entries`
- colonne di `manuals` e `appliance_manuals`

Solo dopo queste verifiche verrà scritto lo script idempotente del sottostep 5.2.
