# Runbook

Le procedure seguenti sono preparate per la gestione dell'applicazione. Nessun controllo operativo sul VPS è stato eseguito. Documentare l'esito reale di ogni prova nel rapporto di rilascio.

## Prima apertura e aggiornamento

1. Eseguire i controlli CI della revisione scelta. Costruire web, worker e migrate dalla stessa revisione e conservare le immagini precedenti.
2. Verificare database privato, volume, segreti distinti e backup esterno; completare un restore isolato.
3. Fermare il worker durante le migrazioni incompatibili; avviare il servizio migrate una sola volta. Il suo fallimento impedisce l'avvio dei servizi dipendenti. Non cancellare volumi per risolvere un errore.
4. Eseguire il seed strutturale idempotente e predisporre l'account amministrativo con la CLI controllata. Il seed conserva le scelte di attivazione già esistenti.
5. Verificare l'accesso amministrativo, il rifiuto delle scritture anonime e le sessioni revocabili; attivare soltanto fonti ammesse e relative associazioni. Attendere un run completo, controllare acquisizione e attribuzione pubblica.
6. Verificare dominio HTTPS, navigazione, filtri, stati senza dati e errori. Con domanda chiusa il sito deve mostrare l'archivio effettivo, anche se non è mai esistita una previsione.

Il codice e il database distinguono materiale acquisito, revisioni, run sperimentali, run pubblicati e ricostruzioni. Non modificare dati storici con correzioni SQL ad hoc: usare le operazioni amministrative revisionate o una migrazione dedicata.

## Diagnosi

| Sintomo | Controllo e azione |
|---|---|
| Web vivo, readiness 503 | Verificare database, migrazione applicata e permessi runtime; non mostrare uno stato vuoto al posto dell'errore |
| Fonte obsoleta | Controllare ultima acquisizione, ultimo run completo, sospensione globale e binding; verificare cadenza e cooldown prima di un retry |
| Rate limit | Conservare il termine `Retry-After`; non eliminare cursore o cooldown per forzare una richiesta |
| Quarantene | Controllare codice motivo e versione parser, usare campioni consentiti; non introdurre mapping o zeri non verificati |
| Worker riavviato | Controllare riconciliazione dei run e coda persistente; i job già committati devono restituire la ricevuta senza nuovo fetch |
| Previsione assente | Verificare copertura, input e termine della domanda; un calcolo riuscito non equivale a pubblicabilità o validazione |
| Admin indisponibile | Controllare origine HTTPS, segreto, schema auth e membership; non abilitare registrazione pubblica come ripiego |
| Disco o memoria in crescita | Controllare log ruotati, dati, coda, backup e build; ridurre concorrenza, misurare e correggere prima di aumentare risorse |

Gli errori applicativi devono riportare codici e identità dei run, non password, URL di connessione o payload riservati. La disponibilità del container non prova la freschezza delle osservazioni. Un sistema di monitoraggio esterno potrà controllare readiness e raggiungibilità quando verrà scelto; non è configurato da questa consegna.

## Carico e ripristino

`node scripts/operations/load-check.mjs` esegue al massimo 100 richieste e 4 in parallelo per impostazione predefinita, contro localhost. `LOAD_BASE_URL`, `LOAD_REQUESTS` (massimo 1000) e `LOAD_CONCURRENCY` (massimo 16) scelgono esplicitamente il profilo; durata massima circa un minuto e timeout per richiesta di 5 secondi. Il rapporto misura latenza agli header, errori e richieste effettive: non è una prova completa del caricamento della pagina.

Eseguire in collaudo su dati rappresentativi, dopo riscaldamento della cache e durante raccolta/calcolo del worker. Registrare CPU/RAM, revisione, dataset, quota di pagine dinamiche, p95 e consumo massimo. Il riferimento iniziale è p95 delle letture comuni orientativamente sotto un secondo e nessuna terminazione per memoria. Una prova su pagine vuote o hardware differente non dimostra la capacità del VPS. Ripetere i controlli interessati dopo il deployment.

Seguire [BACKUP_RESTORE.md](BACKUP_RESTORE.md) per il recupero isolato. Nel rollback usare immagini compatibili con lo schema esistente; se non lo sono, ripristinare su un nuovo database e verificare prima del cambio di connessione. Mantenere traccia della perdita di dati effettiva e della durata del recupero.
