# Preview S02 privata — Safari iPad / iPhone

**Preparazione del 23 ottobre 2026. PR #197 in bozza, NOT READY FOR MERGE.**

Il repository è statico: non serve un build, un nuovo servizio, un `devcontainer.json` o una dipendenza npm. Usare Node già disponibile (18 o superiore) e GitHub CLI nell'immagine standard Codespaces. Nessun Codespace è stato creato o avviato durante la preparazione; compatibilità di quota, permessi `gh` e tunnel va confermata nel Codespace del proprietario.

## Prima di creare il Codespace

Questa preparazione non autorizza l'attivazione di risorse fatturabili. **Creare il Codespace solo dopo la conferma del proprietario e il controllo di quota/budget nell'account GitHub.** Non cambiare budget o aggiungere un metodo di pagamento automaticamente.

GitHub Free personale include 120 core-ore e 15 GB-mese; Pro personale 180 core-ore e 20 GB-mese. Una macchina a 2 core consuma due core-ore per ora attiva (quindi 120 core-ore corrispondono a 60 ore di quella macchina). Oltre quota: listino del 23 ottobre 2026, 2 core $0,18/ora e storage $0,07/GB-mese. La disponibilità residua dell'account non è stata verificata. Arrestare il Codespace interrompe il compute; lo storage rimane conteggiato finché il Codespace esiste.

Fonti ufficiali consultate il 23 ottobre 2026:

- [Billing Codespaces](https://docs.github.com/en/billing/concepts/product-billing/github-codespaces)
- [Sicurezza e porte private](https://docs.github.com/en/codespaces/reference/security-in-github-codespaces)
- [Inoltro porte](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace)
- [GitHub CLI: elenco porte](https://cli.github.com/manual/gh_codespace_ports)
- [GitHub CLI: visibilità porte](https://cli.github.com/manual/gh_codespace_ports_visibility)

## Avvio da Safari iPad

1. Aprire [PR #197](https://github.com/264hf2jztj-ship-it/cucina-hub/pull/197), poi il branch **fix/s02-ai-session-lifecycle** nel repository. Non premere Merge.
2. Dopo conferma e verifica costi, aprire **Code → Codespaces → New with options** (o il corrispondente comando di creazione), controllare repository e branch, scegliere la macchina più piccola disponibile (2 core) e la configurazione standard. Creare il Codespace personalmente con l'account proprietario. Non aggiungere segreti Cucina Hub.
3. Nell'editor web aprire **Terminal → New Terminal**. Incollare:

```bash
git switch fix/s02-ai-session-lifecycle
git pull --ff-only origin fix/s02-ai-session-lifecycle
git log -1 --oneline
node --version
gh --version
```

4. Nel pannello **PORTS / Porte**, scegliere **Add port / Aggiungi porta**, inserire **8787** e verificare **Port Visibility → Private**. Non scegliere Public o Private to Organization. La porta può comparire prima che il server sia avviato.
5. Nel terminale, impostare e verificare la visibilità con i comandi pronti:

```bash
gh codespace ports visibility 8787:private --codespace "$CODESPACE_NAME"
gh codespace ports --codespace "$CODESPACE_NAME" --json sourcePort,visibility
node release/s02-preview/server.cjs
```

Il server controlla la visibilità tramite GitHub CLI e rifiuta l'avvio se manca la porta PRIVATE o la verifica non riesce. La rilegge anche durante l'uso; non cambiare la visibilità mentre è attivo. Se `gh` non ha accesso sufficiente, **fermarsi e comunicare l'errore generico**: non incollare token in chat, non esportarli, non aggirare il controllo e non usare `--local` in Codespaces. Non avviare un server statico generico sulla root del repository: bypasserebbe le protezioni del test.

6. Tornare in **PORTS**, confermare ancora **Private**, usare **Open in Browser** sulla porta 8787. L'indirizzo esterno generato da GitHub deve iniziare con `https://`. La connessione HTTP al server Node sul loopback viene inoltrata tramite il tunnel HTTPS; lasciare HTTP come protocollo del servizio locale. Se compare una destinazione non trovata, aprire `/preview/` sullo stesso indirizzo generato da Ports. Non usare GitHub Pages di produzione.
7. Se GitHub chiede l'accesso, usare il normale login GitHub in Safari. Solo il creatore del Codespace può aprire la porta privata; non occorre il login di Cucina Hub. Non condividere cookie, header o credenziali. Se la sessione GitHub del tunnel scade, autenticarsi nuovamente tramite GitHub.
8. La pagina deve mostrare **Collaudo S02 — servizi SIMULATI**, il commit servito e tutti i risultati **NOT TESTED**. Se mostra STOP, non iniziare il test.

L'URL privato esiste solo dopo la creazione del Codespace e l'inoltro della porta: non è stato generato né verificato durante la preparazione.

## Eseguire il collaudo

Per ciascuno dei quattro moduli, selezionarlo e premere **Esegui scenari guidati del modulo**. Non interagire con la pagina incorporata durante la sequenza. Il test usa realmente quel DOM e i controller originali in Safari. La revoca senza evento Auth attende il poll di 30 secondi: prevedere circa 40–60 secondi per modulo, oltre al tempo di caricamento.

I controlli automatici nel browser coprono: accessi iniziali, uso autorizzato, sessione assente/non admin, logout, blocco dei comandi, cambio account, scadenza, invalidazione Auth, risposte tardive e rifiuti sintetici 401/403, pulizia di risposte/citazioni/preview, revoca e caricamento script. I casi risposta/provider dell'AI Hub, che non invoca AI, restano NOT TESTED con spiegazione “non applicabile”. Se un caso fallisce, il report conserva FAIL; non convertirlo manualmente in PASS.

Completare le prove manuali usando le istruzioni touch della pagina:

- [ ] **Seconda scheda:** admin con anteprima; aprire “controllo seconda scheda”, fare logout lì, tornare e premere “Verifica logout da seconda scheda”. Il trasporto è BroadcastChannel reale del browser; SDK Auth e identità sono simulati. Non certifica la propagazione del SDK Supabase reale.
- [ ] **Background:** premere “Inizia prova background”, passare a un'altra app e tornare; premere “Verifica ritorno”. È richiesto un ciclo `visibilitychange` reale osservato dal browser. Provare anche la revoca dalla seconda scheda mentre la prima è nascosta.
- [ ] **Navigazione:** seguire i link reali fra AI Hub e assistenti; usare Indietro/Avanti nel modulo e verificarne il ritorno. Ripetere dopo logout e cambio account; nessuna comparsa, nemmeno momentanea, di dati della precedente identità. Il pulsante di verifica non certifica da solo l'assenza di flash visivi né l'effettivo uso del bfcache da parte di Safari.
- [ ] **Fermentation:** caricare i dati sintetici, preparare la richiesta, verificare configurazione, generare, caricare l'esempio tecnico e validare la risposta con i controlli originali.
- [ ] **Planner:** generare senza staging automatico; solo con il pulsante esplicito inviare la preview simulata. La destinazione è un segnaposto isolato: Menu Package, conflitti, commit e Piano Alimentare completi restano NOT TESTED da questo harness.
- [ ] **Controllo visivo:** nessun contenuto dell'account A dopo logout o passaggio a B; comandi protetti nascosti/bloccati, risposta tardiva incapace di ripopolare i campi.

Il mock health dichiara intenzionalmente `configured=true` per esercitare il flusso normale senza chiamare provider: è **solo un provider sintetico**, non una nuova evidenza della configurazione live S01.

Premere **Prepara report senza dati privati** e copiare il JSON dalla casella di testo nella chat. Il report contiene SHA, hash degli asset, stati PASS/FAIL/NOT TESTED e motivazioni, senza credenziali, domande o contenuto delle risposte. Non carica automaticamente nulla e non salva risultati in localStorage/sessionStorage. Copiarlo prima di ricaricare il controllo: i risultati rimangono solo in memoria. Non digitare dati personali nei moduli di prova.

## Isolamento e limiti verificabili

- Le pagine HTML sono quelle del commit Git registrato. L'adattamento serve solo a rimuovere il caricamento CDN del SDK e aggiungere il bootstrap test all'inizio del documento. Gli script applicativi, incluso il codice inline Fermentation, vengono letti dal commit senza modifiche o copie della logica.
- La configurazione reale Supabase non viene servita; il client applicativo originale riceve un SDK sintetico. `profiles`, retrieval e provider rispondono in memoria. La revoca cambia il profilo senza emettere un evento Auth.
- CSP sulle pagine: `connect-src 'none'`, `worker-src 'none'`, `form-action 'none'`; gli script esterni sono esclusi. Fetch/XHR/WebSocket/EventSource/sendBeacon e navigazioni esterne sono bloccati anche dal bootstrap. Il server non fa proxy né usa segreti di applicazione.
- Sono serviti solo quattro HTML e gli asset esplicitamente ammessi. Configurazioni, backend, file arbitrari, API e richieste HTTP di scrittura non sono accessibili.
- La preview deve usare un'origine Codespaces pulita. Un service worker preesistente blocca l'avvio del controllo. I service worker restano disabilitati: **v57 è verificabile qui come configurazione Git, non come aggiornamento cache Safari dopo distribuzione**.
- Il wrapper iframe e il tunnel GitHub possono influenzare cookie, focus, cronologia e bfcache: questi test non sostituiscono il futuro collaudo diretto del frontend distribuito su Safari iPhone/iPad con servizi reali autorizzati.
- S01 resta PARTIALLY VERIFIED: i mock frontend non completano i test backend non admin e ruolo revocato con stesso JWT nel runtime isolato.

## Arresto

1. Copiare il report.
2. Nel terminale premere **Ctrl+C** (o terminare quel terminale) per fermare Node.
3. Da GitHub, pagina **Your codespaces**, menu del Codespace → **Stop codespace**. Chiudere soltanto Safari non basta a fermare il compute. Non affidarsi esclusivamente al timeout di inattività.
4. Lo storage continua a contare dopo Stop. Dopo aver conservato i risultati e verificato che non ci siano modifiche da salvare, si può eliminare personalmente quel Codespace per terminare anche lo storage; non viene eliminato automaticamente.

## Gate

Mantenere la PR in bozza e **NOT READY FOR MERGE** finché il proprietario non restituisce il report Safari: casi pertinenti PASS, nessun FAIL irrisolto, pulizia e blocco dei comandi verificati nei quattro moduli, risultati tardivi non ripristinati, più prove manuali fra schede/background/cronologia e controlli visivi. NOT TESTED deve restare esplicito per casi non applicabili e limiti fuori dal test. Qualunque difetto va analizzato sulla stessa PR, con test e suite completa prima di una nuova valutazione. Nessun merge automatico anche dopo il collaudo.

## Verifica tecnica del solo harness

```bash
node --test release/s02-preview/server.test.js
```

Nel workspace di preparazione (Node 24.19.0), **444/444 test della suite completa superati**, zero fallimenti e zero saltati: i precedenti 436 più 8 test del server/mock. Sono test HTTP/Node, **non un collaudo browser**. Nessun Codespace o Safari è stato avviato dall'agente.
