# Polls

Hub di pronostici, sondaggi e notizie, pensato per mostrare come cambiano nel tempo le aspettative sui principali eventi elettorali.

Il sito previsto è **[polls.simone.ooo](https://polls.simone.ooo)**. La prima sezione sarà dedicata alle midterm statunitensi; seguiranno altri paesi ed eventi.

## Organizzazione

- `/` — homepage dell'hub.
- `/usa` — pagina paese USA.
- `/usa/midterms` — sezione Midterms.
- `/usa/midterms/2026` — edizione 2026.
- `/italy` — futura pagina paese Italia, con proprie sezioni.

Paesi, sezioni, edizioni e competizioni hanno identità distinte. Componenti, raccolta dati e infrastruttura sono condivisi; regole elettorali e modelli previsionali appartengono ai singoli moduli.

## Stack

Next.js, React e TypeScript; worker Node.js nello stesso repository; PostgreSQL con Drizzle e pg-boss. Distribuzione tramite Docker Compose e Coolify sul server IONOS.

Sono presenti web, catalogo, persistenza PostgreSQL/Drizzle con migrazioni, revisioni dei sondaggi e pubblicazione atomica dei run. Il worker usa pg-boss e una pipeline con cursori transazionali, limiti HTTP e import controllato; le fonti vengono collegate soltanto tramite registrazioni esplicite. L'amministrazione riservata consente gestione delle fonti, import con anteprima, rettifiche delle associazioni ed esclusioni dai futuri calcoli. Il motore sperimentale è collegato a input verificati, coda, archivio delle pubblicazioni e scenari nel browser.

Gli adapter ammessi al registro sono VoteHub generic ballot e RSS Monetary Policy della Federal Reserve; resta disponibile l'import controllato. L'adapter Polymarket è tecnico e inattivo, in attesa delle verifiche su riuso, timestamp ed equivalenza dei mercati. Il parser storico MEDSL Senate V8 conserva provenienza e limiti temporali. Sondaggi, previsioni del modello e prezzi dei mercati sono misure distinte. Il tono delle notizie e l'IA esterna restano disabilitati.

La copertura di VoteHub per singole gare e archivi storici non è ancora dimostrata: il perimetro dipenderà dalla verifica delle fonti. Il confronto con i mercati userà una misura di prezzo uniforme, con qualità e freschezza esplicite, secondo il piano.

## Stato e documentazione

Sono implementati catalogo tipizzato, navigazione dell'hub e viste Camera, Senato, sondaggi, notizie e metodo, in italiano. Le pagine leggono l'archivio PostgreSQL con provenienza, filtri, paginazione e stati espliciti di assenza o errore. Il catalogo strutturale comprende 470 gare; l'amministrazione consente gestione delle fonti e import controllato. **Nessuna fonte è stata attivata in produzione, nessuna previsione è disponibile e nessun deployment è stato eseguito.** Le pagine preparatorie sono `noindex`; rotte future e sconosciute restituiscono 404.

La [CI precedente al controllo della complessità](https://github.com/simoneraffaelli/polls/actions/runs/39786217506) ha superato 94 test ordinari, 29 test PostgreSQL, 6 test browser, build e controlli dei container. Il refactor successivo supera localmente 95 test ordinari, typecheck, lint, formattazione e build; tutti i file applicativi rispettano le nuove soglie descritte sotto. Le [esecuzioni CI del branch](https://github.com/simoneraffaelli/polls/actions?query=branch%3Acodex%2Fimplementation-foundations) riportano gli esiti remoti dei singoli commit. Il collaudo sul VPS e la validazione statistica rimangono separati da queste verifiche automatiche.

- [Piano di implementazione](docs/IMPLEMENTATION_PLAN.md): architettura, fasi, criteri di completamento, fonti, verifiche, costi e distribuzione.
- [Istruzioni per gli agenti](AGENTS.md): regole di sviluppo e vincoli del progetto.
- [Avanzamento e verifiche](docs/IMPLEMENTATION_STATUS.md): consegne, controlli eseguiti e dipendenze ancora aperte.
- [Architettura](docs/ARCHITECTURE.md): responsabilità e confini implementati.
- [Dizionario dei dati](docs/DATA_DICTIONARY.md): identità, provenienza, unità, revisioni e contratti di pubblicazione.
- [Raccolta e import](docs/COLLECTION.md): ricevute, cursori, quarantena e limiti delle acquisizioni.
- [Sistema grafico](docs/DESIGN_SYSTEM.md): token, componenti, accessibilità e significato delle misure.
- [Fonti](docs/SOURCES.md): evidenze, condizioni e criteri di ammissione.
- [Audit del riferimento](docs/REFERENCE_AUDIT.md): inventario del materiale esterno, consultato senza eseguirlo.
- [Regole Midterms 2026](docs/MIDTERMS_RULES.md): seggi, calendario, caucus e limiti da mantenere espliciti nel catalogo e nel modello.
- [Dataset storici](docs/HISTORICAL_DATA.md): fonti riusabili e limiti per la valutazione retrospettiva.
- [Amministrazione](docs/ADMIN.md): account predisposti, autorizzazioni, import e audit.
- [Metodologia sperimentale](docs/FORECAST_METHODOLOGY.md) e [valutazione](docs/FORECAST_EVALUATION.md): regole, criteri e limiti delle evidenze.
- [Operazioni del modello](docs/MODEL_OPERATIONS.md): registrazione di domande, struttura e opzioni; preparazione degli input e calcolo nel worker.
- [Contratti di valutazione](docs/EVALUATION.md) e [analisi delle notizie](docs/NEWS_ANALYSIS.md): evidenze richieste e significato dei pannelli descrittivi.
- [Distribuzione](docs/DEPLOYMENT.md), [backup e ripristino](docs/BACKUP_RESTORE.md), [runbook](docs/RUNBOOK.md): preparazione del rilascio e controlli da eseguire sul server.
- [Aggiungere una sezione](docs/ADDING_A_SECTION.md): estensioni senza collisioni fra paesi.

Restano aperte la copertura dei provider per le singole gare, la disponibilità di prior verificati e degli archivi necessari alla validazione, oltre alle verifiche dell'ambiente di destinazione. Non vengono creati automaticamente pronostici 2026 con dati mancanti. Il dettaglio dei controlli è nel documento di avanzamento.

Lo sviluppo prosegue per fasi revisionate dall'orchestratore, con test e commit intermedi, senza approvazione umana a ogni passaggio. Il collaudo operativo sul server e il rilascio saranno eseguiti in occasione del deployment dell'utente; la loro preparazione fa parte del lavoro, mentre il loro esito resta da verificare nell'ambiente reale.

Il primo traguardo previsto è l'**osservatorio completo** nel perimetro verificato; **modello sperimentale disponibile** e **modello validato** sono traguardi distinti. Un modello sperimentale non completa l'obiettivo della validazione né la prima versione completa del prodotto.

Il piano del 22 ottobre 2026 non garantisce un rilascio completo prima del voto del 3 novembre: assume che l'edizione 2026 possa essere pubblicata come osservatorio e archivio dopo il voto. Un eventuale rilascio ridotto precedente va valutato nella fase 0. Alla scadenza di ciascuna domanda si fermeranno le pubblicazioni previsionali e si conserverà l'ultimo run realmente pubblicato; eventuali ricostruzioni successive saranno dichiarate come tali.

## Sviluppo locale

Usare Node **24.22.1 LTS** (versione fissata in `.node-version`) e pnpm **11.22.0**. Le dipendenze dirette sono fissate in `package.json`; il lockfile va mantenuto versionato. Non occorrono account dei provider o credenziali database per avviare le pagine di questo incremento.

I comandi di sviluppo e build selezionano Webpack: nel collaudo Windows, Turbopack ha riprodotto un errore interno durante l'elaborazione CSS anche con Node LTS. Il controllo dei tipi genera prima i tipi delle rotte Next.js; `next-env.d.ts` è un file generato, escluso da Git.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Aprire [localhost:3000](http://localhost:3000). Per provare la build di produzione in locale:

```sh
pnpm build
pnpm start
```

`pnpm start` prepara gli asset accanto al server standalone e lo avvia; `HOSTNAME` e `PORT` possono essere impostati nell'ambiente. I test browser usano lo stesso comando. Nel container gli asset sono già copiati durante la build.

## Controlli

`pnpm lint` include controlli bloccanti ESLint su tutti i file TypeScript e TSX in `src/`: complessità ciclomatica **classic ≤ 20** per funzione, **≤ 200 righe** per funzione e **≤ 500 righe** per file. I limiti di righe escludono commenti e righe vuote; misurano la dimensione, non la complessità ciclomatica del modulo. La stessa configurazione è eseguita in CI, senza dipendenze aggiuntive o eccezioni per il codice esistente. Le soglie richiedono responsabilità più piccole quando vengono superate; non sostituiscono revisione e test di comportamento. La metrica è descritta nella [documentazione ESLint](https://eslint.org/docs/latest/rules/complexity).

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm worker:build
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

I test ordinari non chiamano provider esterni. La prima installazione delle dipendenze e del browser richiede rete. I test coprono catalogo e secondo paese, provider, modello, limiti di calcolo e presentazione. In CI i test browser includono amministrazione e scenari con fixture sintetiche in un database dedicato; senza tale configurazione quei flussi vengono esplicitamente saltati, mentre resta verificabile la navigazione senza dati. Lo stato delle esecuzioni locali e della CI è riportato separatamente nel documento di avanzamento.

I test di integrazione sono separati: `pnpm test:db` richiede `TEST_DATABASE_URL` verso un database PostgreSQL temporaneo dedicato, con `test` come segmento del nome. Il runner crea due schemi casuali, applica le migrazioni e rimuove soltanto quegli schemi; non usa `DATABASE_URL` come ripiego. La CI dispone del proprio servizio PostgreSQL 17. I test verificano rettifiche e retry, riferimenti fra edizioni, immutabilità degli input e termine/ordine delle pubblicazioni.

Le migrazioni si applicano esplicitamente con `pnpm db:migrate`, usando `DATABASE_URL` oppure le variabili `PG*` riportate sotto. Il comando non carica automaticamente `.env` e non viene eseguito all'avvio del web. Le migrazioni versionate sono in `drizzle/`; il registro e un lock PostgreSQL impediscono esecuzioni concorrenti. Per generare una nuova migrazione usare `pnpm exec drizzle-kit generate --name=nome_descrittivo`; i trigger SQL aggiunti a mano richiedono revisione oltre al confronto dello schema Drizzle.

Prima del worker eseguire anche `pnpm queue:install` con le variabili `PG*`: installa/aggiorna lo schema pg-boss e la definizione della coda una sola volta per rilascio. Il worker ordinario richiede database e coda già predisposti e non ne esegue le migrazioni. Il registro ammette VoteHub e RSS Fed, ma richiede seed e attivazione esplicita della fonte e della sua associazione; l'avvio da solo non attiva raccolte esterne.

## Web, worker e PostgreSQL in container

La configurazione Compose è destinata allo sviluppo e al collaudo locale, non è un rilascio già verificato su Coolify. Occorre Docker con supporto Compose. Copiare `.env.example` in `.env` e sostituire i placeholder con valori esclusivamente locali prima dell'avvio; non versionare il file.

```sh
docker compose up --build
```

Solo il web pubblica una porta sull'interfaccia locale `127.0.0.1:3000`; PostgreSQL resta nella rete dei container con un volume persistente. Il servizio temporaneo `migrate` applica schema, coda e permessi runtime prima dell'avvio di web e worker. Le credenziali del proprietario del database rimangono separate da quelle applicative. Il seed si esegue esplicitamente con `node dist-worker/composition/seed-cli.js` nell'immagine worker: crea catalogo e fonti disabilitate senza riattivare quelle sospese. Fuori da Compose sono disponibili `pnpm worker:build` e `pnpm worker:start`, con la configurazione richiesta dal worker fornita nell'ambiente del processo.

| Variabile worker | Significato |
|---|---|
| `PGHOST` | Nome host o indirizzo del database |
| `PGPORT` | Porta PostgreSQL; predefinita `5432` |
| `PGDATABASE` | Nome del database |
| `PGUSER` | Utente database |
| `PGPASSWORD` | Password; non viene stampata nei log |

Compose fornisce questi valori a web e worker usando `APP_DATABASE_PASSWORD`; `POSTGRES_PASSWORD` è riservata al proprietario e alle migrazioni. L'amministrazione richiede inoltre `BETTER_AUTH_SECRET` e `BETTER_AUTH_URL`. I processi avviati direttamente leggono l'ambiente e non caricano automaticamente `.env`; user e password vengono codificati quando si costruisce l'URL di connessione.

La distribuzione futura prevede Coolify collegato tramite GitHub App e webhook, con branch di rilascio esplicito e verifiche prima dell'apertura pubblica. Il VPS dichiarato dispone di 4 vCore, 4 GB RAM e 120 GB NVMe; margine disponibile, luogo della build e backup esterni restano da verificare.
