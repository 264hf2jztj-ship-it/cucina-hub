# Release 1.0 — Registro verifiche sicurezza S01 / S02

**Aggiornato:** 23 ottobre 2026. **Release 1.0 non chiusa.**

Questo addendum operativo distingue implementazione, test simulati e collaudo live. Il report iniziale `CUCINA_HUB_RELEASE_1.0_SECURITY_QUALITY_AUDIT.md` del 22 ottobre 2026 è un deliverable esterno al repository: non è presente nella baseline Git esaminata. Questo registro non presume che quel report sia versionato e non ne riscrive retroattivamente le conclusioni.

## S01 — PARTIALLY VERIFIED

Remediation backend unita con [PR #196](https://github.com/264hf2jztj-ship-it/cucina-hub/pull/196), commit distribuito [`76de8766689708995b4752a9a1138d21ba747330`](https://github.com/264hf2jztj-ship-it/cucina-hub/commit/76de8766689708995b4752a9a1138d21ba747330).

| Edge Function | Versione live registrata dopo il deploy |
|---|---|
| `fermentation-assistant` | v3 |
| `chef-assistant` | v2 |
| `planner-assistant` | v2 |

La utility [`require-administrator.ts`](../supabase/functions/_shared/require-administrator.ts) verifica l'identità con Supabase Auth e legge il ruolo attuale da `profiles`, usando il JWT del chiamante e rispettandone la RLS. Il controllo precede health, retrieval e provider. `verify_jwt=true` resta attivo. Nessuna modifica backend è inclusa in S02.

### Evidenze del 22 ottobre 2026

Test HTTP sul runtime di produzione, dopo il deploy S01, per tutte e tre le funzioni:

| Credenziale / percorso | Esito osservato | Livello del rifiuto |
|---|---|---|
| Nessuna credenziale | 401 | Gateway JWT |
| Sola publishable key, senza sessione | 401 | Handler |
| Publishable key come Bearer | 401 | Handler |
| Chiave anon legacy, health e generazione | 401 | Handler |
| JWT invalido | 401 | Gateway JWT |
| Preflight OPTIONS dal frontend | 200 | Handler CORS |

La suite S01 risultava **401/401 test automatici superati**, zero fallimenti. I casi non admin e ruolo revocato risultavano superati con mock sintetici: non sono prove runtime. Type-check e bundling Deno delle tre funzioni erano stati verificati prima del merge; non vengono presentati come nuovi controlli S02.

### Collaudo live iPhone — 23 ottobre 2026

Eseguito realmente dal proprietario del progetto da iPhone, Safari, con sessione amministrativa dell'app e Comando Rapido Apple **Cucina Hub — Test S01**. Il comando ha raggiunto il client Supabase nel contesto JavaScript della pagina e invocato le tre funzioni. Evidenze comunicate dal proprietario nella richiesta Step 1B.2; non rieseguite dall'agente durante S02 e non ottenute tramite mock.

| Funzione | Health | Provider | Tempo health | Generazione sintetica | Tempo generazione |
|---|---|---|---|---|---|
| fermentation-assistant | 200 | configured=false | 871 ms | 503 provider_not_configured | 245 ms |
| chef-assistant | 200 | configured=false | 871 ms | 503 provider_not_configured | 230 ms |
| planner-assistant | 200 | configured=false | 880 ms | 503 provider_not_configured | 268 ms |

- 3/3 health amministrativi riusciti sul runtime live.
- 3/3 generazioni respinte per provider non configurato; non è stata richiesta una generazione OpenAI.
- Nessun token o credenziale incluso nell'output del comando.
- Nessuna configurazione OpenAI modificata; nessun salvataggio applicativo previsto dal test. Non viene attribuita a questo test una verifica indipendente di tutte le scritture nei log DB.
- I tempi sono misure complessive del browser, non latenze isolate di Auth e `profiles`.
- L'invocazione con il client nella pagina verifica sessione e comunicazione browser/Edge; non certifica tutti i flussi delle tre interfacce né la generazione con provider attivo.

### Casi runtime ancora NON VERIFICATI

1. Utente sintetico autenticato non amministratore: health e generazione → 403 su tutte e tre le Edge.
2. Amministratore sintetico con ruolo revocato, conservando lo stesso JWT valido: health e generazione → 403 su tutte e tre le Edge.

Usare soltanto un ambiente isolato autorizzato con identità sintetiche. Al controllo del 22 ottobre non risultavano branch isolati disponibili per `cucina-hub`. Non creare ambienti/account a pagamento né modificare ruoli reali per completarli.

Procedura: distribuire in ambiente isolato la stessa correzione S01; verificare prima l'admin sintetico (health 200), poi il non admin (403); revocare solo il ruolo dell'admin sintetico senza refresh o sostituzione del JWT e ripetere (403). Verificare nei log controllati che i casi negati non raggiungano retrieval e provider. Non riportare JWT, header o payload personali. Il test deve distinguere il rifiuto del gateway da quello dell'handler. Non sostituirlo con i mock esistenti.

**Non dichiarare S01 CLOSED prima di queste verifiche.**

## S02 — Implementata sul branch, validata automaticamente; non distribuita

Baseline: main `76de8766689708995b4752a9a1138d21ba747330`. Branch: `fix/s02-ai-session-lifecycle`. Il completamento operativo resta subordinato a review, merge autorizzato e collaudo del frontend pubblicato.

### Debolezze affrontate

- Chef, Planner e AI Hub verificavano solo la sessione iniziale, senza ruolo amministrativo corrente né gestione della fine sessione.
- Fermentation aveva il guard iniziale ma conservava contesto, fonti, prompt e preview e consentiva completamenti asincroni dopo il cambio di accesso.
- I risultati di richieste già avviate potevano ripopolare l'interfaccia dopo logout/cambio account.

### Meccanismo frontend

`auth-guard.js` mantiene `requireAdministrator` compatibile con i consumatori precedenti e aggiunge `watchAdministrator` per le quattro interfacce AI. Il watcher usa il client Supabase esistente: verifica l'utente tramite `getUser`, il ruolo da `profiles`, la sessione e la scadenza. Nessuna autorizzazione basata su `user_metadata`, nessun nuovo storage o client Auth.

- `onAuthStateChange` invalida immediatamente l'interfaccia su logout, perdita sessione e cambio identità, inclusi gli eventi propagati dal SDK da altre schede. Le chiamate Supabase successive sono differite fuori dal callback Auth sincrono.
- Una revisione in memoria invalida i ticket delle operazioni avviate dalla sessione precedente. Successi, errori e `finally` tardivi non possono riaprire risultati o riabilitare comandi.
- Ruolo e identità sono riletti prima dei comandi protetti e prima di visualizzare risultati asincroni. Risposte Edge 401/403 bloccano e puliscono l'interfaccia.
- Un controllo ogni 30 secondi nelle pagine visibili rileva la revoca senza eventi Auth; focus, ritorno in primo piano e `pageshow` richiedono una nuova verifica. `pagehide` pulisce i contenuti prima della conservazione nel back/forward cache.
- Il refresh del token dello stesso account e il semplice ritorno del focus non eliminano una bozza ancora autorizzata. Logout, cambio account o accesso non verificabile cancellano risposte, citazioni, input temporanei e preview; Fermentation cancella anche il contesto caricato in memoria.
- I parametri di cache dei soli script interessati e la shell PWA v57 evitano di mantenere la precedente versione del frontend. Nessuna cache di risposte personali viene introdotta.

La revisione invalida l'uso dei risultati; non garantisce l'interruzione di una richiesta già ricevuta dal server né annulla uno staging già autorizzato. Lo staging Planner rimane un'azione esplicita, distinta dal commit. Contratti, backend, RLS, Menu Package e Piano Alimentare non vengono modificati.

### Test automatici — 23 ottobre 2026

| Tipo | Comando / ambito | Risultato |
|---|---|---|
| Suite Node completa | `node --test` | **436 superati, 0 fallimenti, 0 saltati** |
| Nuovi test S02 | `node --test release/ai-session-lifecycle.test.js` | **35 superati** |
| Regressioni esistenti | Auth legacy, guardrail AI, Menu Package, conflitti/idempotenza, Piano Alimentare, PWA | Incluse nella suite completa superata |
| Diff | `git diff --check` | Superato |
| Smoke browser locale | Chromium / sessioni simulate | **NON ESEGUITO**: browser assente; download ufficiale dell'archivio non valido |

I nuovi test eseguono guard e controller effettivi in Node/VM, con DOM, timer, Auth, profili, retrieval e provider simulati e identità sintetiche. Coprono accesso admin, assenza sessione, non admin, errori Auth/profili, scadenza, eventi logout della stessa/altra scheda, cambio account, refresh valido, revoca, risposte tardive, pulizia citazioni/preview, blocco comandi e mancata navigazione dopo staging tardivo. La propagazione reale fra schede del SDK e il comportamento Safari non sono certificati dal DOM simulato.

### Checklist manuale S02 ancora da eseguire

Su Safari iPhone e iPad, dopo eventuale pubblicazione autorizzata del frontend (preferire un ambiente di preview isolato con sessioni sintetiche per revoca/cambio account):

- [ ] Verificare caricamento della shell v57 e dei nuovi script anche dopo un precedente utilizzo della PWA.
- [ ] Accesso admin: AI Hub, Chef, Fermentation e Planner visibili; comandi e guardrail invariati.
- [ ] Accesso assente/non admin: workspace nascosti, risultati vuoti, comandi bloccati.
- [ ] Logout nella stessa scheda e in una seconda scheda: nessun contenuto personale residuo nelle quattro pagine.
- [ ] Perdita/scadenza sessione, errore Auth/profili e ritorno dal background: accesso bloccato e contenuti puliti.
- [ ] Cambio account sintetico: nessun contenuto dell'identità precedente, anche con richieste lente ancora in corso.
- [ ] Risposte e errori AI ritardati dopo logout: nessuna ricomparsa di citazioni, preview o pulsanti attivi; nessuna navigazione da staging tardivo.
- [ ] Revoca di un admin sintetico, stesso JWT: rifiuto prima di nuove azioni e al successivo controllo; pulizia della preview anche senza evento Auth.
- [ ] Refresh valido e ritorno del focus: bozza autorizzata mantenuta.
- [ ] Indietro/avanti Safari, background e riapertura PWA: nessuna resurrezione di contenuti della sessione terminata.
- [ ] Menu Package: preview, conflitti e conferma esplicita; Piano Alimentare: navigazione e lettura invariate. Nessuna scrittura su dati reali per il collaudo sicurezza.

Non configurare OpenAI per eseguire questi test. Non modificare account o ruoli reali. Il confine di sicurezza server resta S01: nascondere il frontend non sostituisce l'autorizzazione Edge.

### Preparazione preview privata Safari — 23 ottobre 2026

Aggiunto un harness separato in [`release/s02-preview`](../release/s02-preview/README.md), a partire dal commit PR `adbef719af9bd8f363978abe3dd674dba37385e7`. Usa Node senza dipendenze aggiuntive e legge gli asset applicativi originali dal commit Git servito; modifica solo il trasporto del SDK nell'HTML della preview e aggiunge mock sintetici. Il codice applicativo S02 non viene modificato.

Il server limita gli asset, sostituisce la configurazione Supabase, impedisce connessioni applicative con CSP/trasporti bloccati e verifica la porta Codespaces PRIVATE tramite GitHub CLI. L'interfaccia touch distingue PASS, FAIL e NOT TESTED; tutti i casi partono NOT TESTED. Identità, profili, retrieval e risposte provider sono simulati, inclusa la comunicazione Auth fra schede del harness. I risultati restano in memoria e vengono copiati manualmente dal proprietario.

**Verifica di preparazione:** suite completa **444/444 test superati**, zero fallimenti e zero saltati (436 precedenti + 8 HTTP/Node del server/mock), sintassi degli script controllata; nessun test browser attribuito a queste prove. Codespace non creato né avviato; quota residua, accesso `gh`, URL privato e integrazione del tunnel da verificare dopo autorizzazione. La cache Safari v57 dopo distribuzione, Menu Package/Piano Alimentare completi e la propagazione del SDK Auth reale restano fuori dalle evidenze di questo harness.

**S02 rimane NOT READY FOR MERGE**, non distribuita, in attesa del collaudo Safari eseguito dal proprietario e del relativo report. Invariate tutte le evidenze S01 sopra: PARTIALLY VERIFIED, collaudo iPhone live 3 health 200/3 generazioni 503 del 23 ottobre, due test negativi backend runtime isolati ancora mancanti.

### Rischi e punto di arresto (confermati)

**Raccomandazione pre-merge: NOT READY**, in attesa almeno di uno smoke test delle pagine effettive in un browser reale su branch/preview isolata. I test Node/VM sono superati, ma non sostituiscono una verifica DOM e del ciclo di vita browser. La PR viene aperta come bozza per rendere revisionabili codice, test ed evidenze; nessun merge automatico.

La revoca di `profiles.role` non produce da sola un evento Auth: l'aggiornamento visivo dipende dalla lettura successiva (poll nominale 30 secondi, soggetto a sospensione del browser, più verifiche su azioni/risultati/ritorno). I contenuti già letti non possono essere ritirati da screenshot o appunti copiati volontariamente. I controlli aggiungono richieste Auth/profili e richiedono rete; l'accesso non verificabile viene rifiutato.

S01 resta **PARTIALLY VERIFIED**; S02 è **validata automaticamente sul branch, in attesa di review e collaudo manuale**, non completata in produzione. Nessun merge/deploy Supabase, secret, migration, configurazione Auth/RLS o avvio S03 autorizzato da questo step.
