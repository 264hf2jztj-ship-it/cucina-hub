# Struttura iCloud per Cucina Hub

Usare una cartella radice unica:

```text
Cucina Hub/
└── Corsi/
    └── Corso Barbieri/
        ├── 01_Dispense/
        │   ├── Supabase_sotto_50MB/
        │   └── Esterni_oltre_50MB/
        ├── 02_Video_Lezioni/
        ├── 03_Video_Pillole/
        ├── 04_Immagini/
        ├── 05_Extra/
        └── 99_Archivio_Originali/
```

## Regole pratiche

- I nomi delle cartelle iniziano con un numero per mantenere un ordine stabile.
- I file sotto 50 MB possono essere caricati su Supabase.
- I file oltre 50 MB e i video restano su iCloud e vengono collegati tramite URL.
- Non rinominare i file dopo averli collegati, salvo aggiornare anche il link in Cucina Hub.
- Conservare gli ZIP originali in `99_Archivio_Originali` solo come backup.
- Per ogni file esterno creare un link di condivisione e registrarlo nella pagina “Collega file esterno”.

## Nomi consigliati

Usare titoli leggibili e stabili:

```text
Glossario di cucina - A-M.pdf
Glossario di cucina - N-Z.pdf
Pasta fresca - video lezione.mp4
Emulsioni - video pillola.mp4
```

Evitare caratteri speciali inutili, versioni duplicate come `finale2`, e nomi generici come `video1.mp4`.

## Strategia ibrida

```text
Supabase Storage
- PDF e immagini fino al limite del piano
- apertura diretta nella web app

iCloud Drive
- video
- PDF oltre 50 MB
- archivi originali
- apertura tramite link esterno
```
