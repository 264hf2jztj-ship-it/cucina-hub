# Archivio esterno per cartelle

## Obiettivo
Ridurre il numero di link condivisi necessari per corsi con molti file pesanti.

## Modello
- `course_external_sources`: un link condiviso per cartella/categoria.
- `course_content_external_refs`: associa ogni contenuto alla sorgente e conserva il percorso relativo.
- `course_content_external_links`: resta disponibile per i link diretti al singolo file.

## Priorità di apertura
1. Link diretto al file, se presente.
2. File interno Supabase, se presente.
3. Sorgente di cartella: apre la cartella condivisa e mostra il nome/percorso del file da selezionare.

## Limite iCloud
Un link condiviso a una cartella iCloud non consente di generare in modo affidabile un link diretto a un file concatenando il nome. Per questo Cucina Hub non costruisce URL artificiali.

## Struttura consigliata

```text
Cucina Hub/
└── Corsi/
    └── Corso Barbieri/
        ├── 01_Dispense/
        ├── 02_Video Lezioni/
        ├── 03_Video Pillole/
        └── 05_Extra/
```

Per il Corso Barbieri bastano in genere tre sorgenti condivise: Dispense, Video lezioni e Video pillole. Un quarto link per Extra è facoltativo.
