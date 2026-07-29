# Architettura prove ed evoluzione ricette

**Macrostep:** 5 — Migrazione dei dati JSON  
**Sottostep:** 5.1 — Modello dati per prove successive  
**Stato:** definito a livello concettuale  
**Branch:** `agent/macrostep-5-json-mapping`

## Obiettivo

Cucina Hub deve distinguere tra:

- la **ricetta corrente**, cioè la versione consolidata e consultabile;
- le **prove reali**, cioè gli esperimenti successivi che spiegano come la ricetta è migliorata.

La ricetta non deve contenere tutta la cronologia dei test. La cronologia deve restare separata e collegata alla ricetta.

## Modello generale

### `recipes`

Contiene la versione corrente della ricetta:

- titolo, codice e stato;
- procedimento approvato o corrente;
- tempi e temperature di riferimento;
- segnali pratici;
- consigli, varianti e sostituzioni;
- note nutrizionali, familiari e di conservazione;
- collegamenti a categorie, ingredienti, tag ed elettrodomestici.

### `tasting_notes`

Rappresenta una singola prova reale della ricetta.

Ogni nuova preparazione deve poter generare una nuova riga collegata alla stessa ricetta, senza sovrascrivere le prove precedenti.

La tabella dovrà conservare, nei limiti consentiti dallo schema effettivo:

- data della prova;
- numero o ordine progressivo del test;
- voto;
- risultato ottenuto;
- cosa ha funzionato;
- problemi riscontrati;
- cosa modificare nella prova successiva;
- tempi reali;
- note personali;
- eventuale elettrodomestico o configurazione utilizzata;
- eventuali fotografie collegate.

## Regola di evoluzione

1. Una ricetta nuova può nascere con stato `testing`.
2. Ogni prova viene registrata separatamente.
3. Le conclusioni della prova possono aggiornare la ricetta corrente.
4. Quando il risultato è approvato, la ricetta passa a `approved`.
5. Le vecchie prove restano consultabili come cronologia e non vengono eliminate.

## Migrazione dei JSON esistenti

Per ogni ricetta legacy che contiene almeno uno tra:

- `nota_degustatore`;
- `valutazione_globale`;
- `data_prova`;

l'import deve creare una prima prova in `tasting_notes`.

La regola iniziale è:

- `data_prova` → data della prova;
- `valutazione_globale` → voto 1–5;
- `nota_degustatore` → risultato o nota personale;
- assenza di `data_prova` → data nulla, senza inventare valori;
- assenza di nota → non creare testo artificiale.

Durante la migrazione `recipes.personal_notes` può conservare temporaneamente la nota legacy come ridondanza di sicurezza. Dopo la verifica dell'import, la cronologia ufficiale resta in `tasting_notes`.

## Weber Kettle

Il modulo Weber descritto nel documento di progetto introduce:

- configurazioni di cottura riutilizzabili;
- combustibili;
- quantità di combustibile;
- disposizione dei bricchetti;
- prese d'aria;
- temperature e tempi reali;
- fotografie per fase;
- confronto tra test successivi.

Queste funzioni non devono essere forzate subito dentro `recipes` o `tasting_notes` se lo schema attuale non dispone di campi semanticamente adatti.

### Decisione architetturale

- Il concetto generico **ricetta + prove successive** viene integrato ora.
- I dati Weber specifici saranno aggiunti con tabelle dedicate o campi strutturati solo dopo la migrazione base.
- Il modulo Weber completo verrà sviluppato in una macrofase dedicata.
- La stessa architettura di prove dovrà essere riutilizzabile anche per forno, friggitrice ad aria, Ninja, Hurom, microonde, impastatrice e sottovuoto.

## Vincoli

- Una nuova prova non deve sovrascrivere una prova precedente.
- La cronologia deve essere ordinabile per data e/o progressivo.
- Nessun dato Weber deve essere collocato in colonne con significato diverso solo per evitare modifiche allo schema.
- Lo script di import deve restare idempotente: una seconda esecuzione non deve duplicare la stessa prova legacy.
- La chiave idempotente della prova legacy dovrà essere costruita usando ricetta, data e sorgente legacy, oppure un vincolo equivalente disponibile nello schema.

## Prossima verifica richiesta

Prima di scrivere lo script di import è necessario verificare tutte le colonne e i vincoli effettivi della tabella `tasting_notes`.
