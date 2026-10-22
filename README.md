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

Il primo incremento contiene web, catalogo e avvio separato del worker. Persistenza applicativa, Drizzle, pg-boss, autenticazione e raccolta saranno introdotti nelle rispettive fasi: non sono ancora operativi.

Le fonti iniziali previste includono Polymarket, VoteHub e RSS selezionati, con accesso gratuito e condizioni d'uso da verificare per i dati utilizzati. Sondaggi, previsioni del modello, prezzi dei mercati e tono delle notizie saranno presentati come misure distinte. L'IA esterna resta rinviata.

La copertura di VoteHub per singole gare e archivi storici non è ancora dimostrata: il perimetro dipenderà dalla verifica delle fonti. Il confronto con i mercati userà una misura di prezzo uniforme, con qualità e freschezza esplicite, secondo il piano.

## Stato e documentazione

L'implementazione delle fondazioni locali è iniziata: catalogo tipizzato, navigazione dell'hub e pagine in italiano con stati di assenza dati. **Nessuna fonte è attiva, nessuna previsione è disponibile e nessun deployment è stato eseguito.** Le pagine preparatorie sono `noindex`; rotte future e sconosciute restituiscono 404.

- [Piano di implementazione](docs/IMPLEMENTATION_PLAN.md): architettura, fasi, criteri di completamento, fonti, verifiche, costi e distribuzione.
- [Istruzioni per gli agenti](AGENTS.md): regole di sviluppo e vincoli del progetto.
- [Avanzamento e verifiche](docs/IMPLEMENTATION_STATUS.md): consegne, controlli eseguiti e dipendenze ancora aperte.
- [Architettura iniziale](docs/ARCHITECTURE.md): responsabilità e confini del primo incremento.
- [Fonti](docs/SOURCES.md): evidenze, condizioni e criteri di ammissione.
- [Audit del riferimento](docs/REFERENCE_AUDIT.md): inventario del materiale esterno, consultato senza eseguirlo.

La fase 0 resta aperta sulle verifiche dei provider e dell'ambiente di destinazione. Le fondazioni locali procedono per le parti indipendenti da quelle verifiche; il dettaglio dei controlli ancora necessari è nel documento di avanzamento.

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

I test ordinari non chiamano provider esterni. La prima installazione delle dipendenze e del browser richiede rete. I test del catalogo verificano isolamento tra paesi, riferimenti e rotte incoerenti, collisioni e mutazioni della configurazione; i test del browser coprono la navigazione essenziale, i metadati e le rotte escluse. Lo stato delle esecuzioni locali e della CI è riportato separatamente nel documento di avanzamento.

## Web, worker e PostgreSQL in container

La configurazione Compose è destinata allo sviluppo e al collaudo locale, non è un rilascio già verificato su Coolify. Occorre Docker con supporto Compose. Copiare `.env.example` in `.env` e sostituire i placeholder con valori esclusivamente locali prima dell'avvio; non versionare il file.

```sh
docker compose up --build
```

Solo il web pubblica una porta sull'interfaccia locale `127.0.0.1:3000`; PostgreSQL resta nella rete dei container con un volume persistente. Il worker ha una build distinta e in questo incremento verifica soltanto la propria configurazione e gestisce avvio/arresto: non apre connessioni al database, non pianifica raccolte e non certifica la salute del servizio dati. Fuori da Compose sono disponibili `pnpm worker:build` e `pnpm worker:start`, con la configurazione richiesta dal worker fornita nell'ambiente del processo.

| Variabile worker | Significato |
|---|---|
| `PGHOST` | Nome host o indirizzo del database |
| `PGPORT` | Porta PostgreSQL; predefinita `5432` |
| `PGDATABASE` | Nome del database |
| `PGUSER` | Utente database |
| `PGPASSWORD` | Password; non viene stampata nei log |

Compose fornisce questi valori al worker e usa `POSTGRES_PASSWORD` dal file `.env` locale. Il worker avviato direttamente legge l'ambiente del processo e non carica automaticamente `.env`; user e password vengono codificati quando si costruisce l'URL di connessione.

La distribuzione futura prevede Coolify collegato tramite GitHub App e webhook, con branch di rilascio esplicito e verifiche prima dell'apertura pubblica. Il VPS dichiarato dispone di 4 vCore, 4 GB RAM e 120 GB NVMe; margine disponibile, luogo della build e backup esterni restano da verificare.
