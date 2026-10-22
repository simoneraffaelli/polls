# Distribuzione su Coolify

Stato: configurazione preparata; nessun deployment o accesso al VPS eseguito. La procedura va completata sul server dall'utente. La CI applicativa e i test PostgreSQL non certificano le risorse o i backup di produzione.

## Immagini e avvio

Il Dockerfile produce `web`, `worker` e `migrate` dalla stessa revisione. Il target migrate contiene le migrazioni versionate e installa pg-boss; web e worker non eseguono DDL all'avvio. Compose attende il successo del servizio migrate prima dei processi applicativi, secondo le [condizioni di avvio Docker](https://docs.docker.com/compose/how-tos/startup-order/). L'entrypoint di rilascio serializza gli aggiornamenti con un lock PostgreSQL e riapplica in modo idempotente i permessi runtime.

Il database usa `polls_owner` per inizializzazione e migrazioni; i processi applicativi ricevono soltanto `polls_app`, senza privilegi di superuser, creazione database o ruoli. Il ruolo applicativo dispone di lettura/scrittura sulle tabelle dell'applicazione e della coda, con i vincoli di immutabilità del database. Le credenziali sono distinte. Non usare questo Compose per adottare un volume preesistente inizializzato con un altro utente: richiede una migrazione operativa esplicita, senza cancellare il volume.

Copiare `.env.example` in `.env` solo per lo sviluppo locale, sostituire tutti i placeholder e usare `docker compose up --build`. Il web risponde sulla sola interfaccia locale, porta 3000. Per un rilascio successivo: costruire le immagini, fermare il worker, applicare il servizio migrate una volta e avviare servizi compatibili della stessa revisione. Conservare la precedente immagine; un rollback applicativo non annulla lo schema.

## GitHub App e configurazione

Usare un'applicazione Coolify da repository con build pack Compose, collegata tramite GitHub App e webhook. Selezionare esplicitamente il branch di rilascio: il branch di sviluppo `codex/implementation-foundations` non deve attivare produzione. Il [Compose da repository](https://coolify.io/docs/applications/builds/docker-compose) rimane il riferimento versionato. Verificare nel Compose risolto che `migrate` sia un servizio temporaneo e che web/worker attendano il suo successo; evitare un secondo comando automatico di migrazione.

Associare `https://polls.simone.ooo:3000` al solo servizio web nel proxy Coolify. Nessuna porta pubblicata per PostgreSQL o worker. La porta del file locale è vincolata a loopback; in produzione il proxy usa la rete interna. Verificare la rete effettivamente generata da Coolify e l'assenza di accesso pubblico al database prima dell'apertura. Configurare HTTPS e origine di autenticazione identica al dominio pubblico.

Variabili protette: `POSTGRES_PASSWORD` (owner), `APP_DATABASE_PASSWORD` (runtime, almeno 16 caratteri, distinta), `BETTER_AUTH_SECRET` (almeno 32 caratteri casuali), `BETTER_AUTH_URL` (origine HTTPS). Nessun segreto nel build o in Git. Web/worker ricevono le variabili `PG*` derivate dal Compose; il database non deve usare URL pubblici.

## Risorse e controlli

Il VPS dichiarato ha 4 vCore, 4 GB RAM e 120 GB NVMe. I limiti iniziali sono 768 MiB ciascuno per web, worker e PostgreSQL, 512 MiB per il servizio temporaneo migrate; restano da misurare memoria del sistema, Coolify e altri servizi. Sono limiti di partenza, non evidenze di capacità. Le build possono richiedere più memoria dei processi runtime: preferire una macchina di build separata se il margine misurato non basta. Nessun registro o piano a pagamento è presupposto.

I log hanno rotazione 10 MiB × 3 file per servizio. `/api/health/live` verifica il processo web; `/api/health/ready` verifica una lettura dello schema applicativo e restituisce 503 in caso di indisponibilità. Non certificano freschezza delle fonti, attività del worker o correttezza statistica. Questi stati vanno controllati nell'amministrazione e nei log dei run.

Prima dell'apertura pubblica: eseguire i controlli del [runbook](RUNBOOK.md), la prova di [backup e ripristino](BACKUP_RESTORE.md), verificare sessioni e origine HTTPS, raccogliere misure di carico web/worker simultanei e documentare le differenze rispetto alla CI. Le fonti partono disabilitate e vengono attivate soltanto dopo seed, attribuzione e verifica della configurazione. Non attivare mercati o altri provider ancora privi delle verifiche richieste.
