# Cucina Hub — Convenzioni Storage private

## Scopo

Queste regole definiscono i percorsi degli oggetti nei bucket privati Supabase di Cucina Hub.

Bucket previsti:

- `recipe-images`
- `appliance-images`
- `manuals`
- `course-materials`

I file personali non devono essere inseriti nel repository GitHub.

## Regole comuni

1. Il primo segmento del percorso è sempre `owner_user_id`.
2. Gli identificativi delle entità sono UUID Supabase, non titoli o nomi modificabili.
3. I nomi leggibili sono solo descrittivi e vengono normalizzati in slug.
4. Percorsi e nomi usano caratteri ASCII minuscoli, cifre e trattini.
5. Gli spazi diventano trattini; accenti e caratteri speciali vengono rimossi.
6. Ogni file usa un identificatore univoco prima dello slug per evitare collisioni.
7. L’estensione è minuscola e coerente con il MIME type reale.
8. Una nuova versione crea un nuovo oggetto; non si sovrascrive silenziosamente un file esistente.
9. La cancellazione del record applicativo deve essere coordinata con la cancellazione dell’oggetto Storage e del record `storage_files`.
10. URL pubblici permanenti non sono ammessi: i file si leggono tramite URL firmati temporanei.

## Struttura dei bucket

### `recipe-images`

```text
{owner_user_id}/recipes/{recipe_id}/{image_role}/{file_id}-{slug}.{ext}
```

Ruoli iniziali: `cover`, `preparation`, `cooking`, `result`, `inside`, `problem`, `other`.

### `appliance-images`

```text
{owner_user_id}/appliances/{appliance_id}/{image_role}/{file_id}-{slug}.{ext}
```

Ruoli iniziali: `cover`, `front`, `control-panel`, `accessory`, `setup`, `other`.

### `manuals`

```text
{owner_user_id}/appliances/{appliance_id}/manuals/{manual_id}/{file_id}-{slug}.pdf
```

Il formato iniziale ammesso è PDF. Il record `storage_files` deve esistere prima del record `manuals`, perché lo schema applica l’integrità referenziale.

### `course-materials`

```text
{owner_user_id}/courses/{course_id}/{asset_scope}/{scope_id}/{file_id}-{slug}.{ext}
```

`asset_scope` ammessi: `course`, `module`, `lesson`.

## Slug

Lo slug:

- viene convertito in minuscolo;
- rimuove segni diacritici;
- sostituisce sequenze non alfanumeriche con `-`;
- elimina trattini iniziali e finali;
- viene limitato a 80 caratteri;
- usa `file` come fallback.

## Metadati minimi in `storage_files`

La scrittura deve rispettare i nomi reali delle colonne dello schema. Concettualmente devono essere conservati almeno:

- proprietario;
- bucket;
- percorso oggetto;
- nome originale;
- MIME type;
- dimensione in byte;
- eventuale checksum;
- data di creazione.

## Sostituzione e versioni

1. Caricare il nuovo oggetto con un nuovo `file_id`.
2. Creare il nuovo record `storage_files`.
3. Aggiornare il collegamento dell’entità.
4. Verificare la lettura tramite URL firmato.
5. Eliminare il vecchio collegamento, record e oggetto solo dopo la verifica.

Questa convenzione sarà riutilizzata anche dal Modulo Weber per foto di configurazioni, prove e risultati, senza creare una struttura parallela incompatibile.
