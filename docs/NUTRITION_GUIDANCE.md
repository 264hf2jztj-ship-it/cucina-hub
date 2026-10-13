# Indicazioni del piano nella vista giornaliera

Il Planner legge il piano nutrizionale validato della stessa settimana e dello stesso proprietario. Mostra alcol, elenco frutta pubblicato, colazione per allenamento mattutino e alternative. Non produce nuove prescrizioni né modifica il pacchetto.

## Convenzioni compatibili con il contratto v1

Per ogni `meal.alternatives[].label` specificare l'ambito:

- `Pasto completo — <descrizione>`: sostituisce tutto il pasto.
- `Solo <alimento o quota> — <descrizione>`: sostituisce l'alimento o quota indicata; il resto rimane invariato.

Specificare componenti e quantità dell'opzione. Per allenamenti mattutini usare, ad esempio, `Pasto completo — Allenamento mattina presto` e descrivere in `note` cosa mangiare prima e dopo, senza duplicare gli altri pasti. L'interfaccia riconosce anche condizioni come `allenamento entro 60 minuti`.

Le alternative storiche `Alternativa frutta/carboidrati/proteine` identificano solo quella quota. Un singolo componente con lo stesso nome del componente principale cambia solo quell'alimento. In tutti gli altri casi l'ambito è segnalato come non specificato: non dedurlo dal numero di ingredienti.

Usare `day.alcohol` per l'opzione facoltativa del giorno con eventuali quantità e note, e `shopping_list.categories[key=fruit]` per la frutta prevista. La UI mostra anche idee stagionali generali per il clima mediterraneo basate sul [calendario della Commissione europea](https://agriculture.ec.europa.eu/farming/crops/fruit-and-vegetables/calendar_it), consultato il 13 ottobre 2026. Il raggruppamento per mesi è indicativo (marzo–maggio, giugno–agosto, settembre–novembre, dicembre–febbraio). Non rende equivalenti le porzioni: le sostituzioni devono essere stabilite nella chat nutrizionale e incluse nel piano pubblicato.

Nessun campo nuovo, migrazione o dato personale in GitHub. Per aggiornare contenuti usare solo il ponte privato di pubblicazione, con revisione incrementata e stop su conflitti.
