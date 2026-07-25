# Cucina Hub

Web app personale per ricette, elettrodomestici, manuali e appunti pratici del progetto Cucina.

## Web Edition 1.0

La prima versione include:

- dashboard generale;
- archivio centralizzato delle ricette;
- sezione Hurom E30ST con ricette certificate e ricette in prova;
- sezioni predisposte per Ninja TB401EU e Pizza/Impasti;
- elenco degli elettrodomestici posseduti e stato dei manuali;
- ricerca e filtri;
- layout responsive per iPhone, iPad e computer;
- manifest e service worker per l’uso come web app.

## Struttura

```text
cucina-hub/
├── index.html
├── css/style.css
├── js/app.js
├── data/
│   ├── ricette.json
│   ├── elettrodomestici.json
│   ├── categorie.json
│   └── changelog.json
├── assets/icon.svg
├── manifest.json
└── sw.js
```

## Fonte dei contenuti

Le ricette Hurom iniziali derivano dal *Manuale Personale Hurom E30ST v3.0* e dalle note del progetto Cucina. I manuali completi degli elettrodomestici non vengono pubblicati nel repository; l’app contiene solo riferimenti e sintesi operative.

## Pubblicazione con GitHub Pages

1. Aprire **Settings** nel repository.
2. Selezionare **Pages**.
3. In **Build and deployment**, scegliere **Deploy from a branch**.
4. Selezionare il ramo `main` e la cartella `/ (root)`.
5. Salvare e attendere la pubblicazione.

Il sito sarà disponibile all’indirizzo indicato da GitHub Pages.
