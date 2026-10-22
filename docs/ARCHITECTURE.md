# Architettura

Questo documento descrive i confini implementati. Per specifica completa e stato dei controlli vedere [piano](IMPLEMENTATION_PLAN.md) e [avanzamento](IMPLEMENTATION_STATUS.md).

## Confini

| Area | Responsabilità attuale |
|---|---|
| `src/platform/catalog.ts` | Contratti e registrazione di paesi, sezioni ed edizioni; validazione dei riferimenti; URL e breadcrumb. Nessuna dipendenza da Next.js, React o database. |
| `src/modules/usa/midterms/definition.ts` | Definizione dichiarativa della sezione USA/Midterms e dell'edizione 2026; nessuna formula o fonte attiva. |
| `src/composition/catalog.ts` | Collegamento delle definizioni al catalogo e origine canonica del sito. |
| `src/app/` | Pagine Next.js per hub, paese, sezione ed edizione. Risolvono il catalogo e mostrano dati di presentazione o una risposta 404. |
| `src/ui/patterns/` | Componenti comuni per navigazione e stati di assenza dati; nessuna query, credenziale o regola elettorale. |
| `src/infrastructure/config/` | Validazione della configurazione tecnica del processo worker, separata dalla build web. |
| `src/platform/data/`, `src/elections/polling/` | Contratti runtime di provenienza, sondaggi, mercati e articoli, indipendenti dal database. |
| `src/platform/publication/` | Contratti e regole pure per termine, stato e ordine delle pubblicazioni. |
| `src/infrastructure/database/` | Schema Drizzle, migrazioni e repository per revisioni dei sondaggi e run; vincoli relazionali e transazioni PostgreSQL. |
| `src/worker/` | Raccolta tramite pg-boss, riconciliazione dei job e comandi operativi espliciti; nessuna elaborazione pesante nelle visite web. |
| `src/infrastructure/auth/`, `src/platform/admin/` | Sessioni, ruolo amministrativo, comandi validati, anteprime e audit. |
| `src/integrations/` | Adapter HTTP e import locali, con validazione, limiti e provenienza. |
| `src/elections/model/`, `src/modules/usa/midterms/model/` | Motore puro, snapshot tipizzati, simulazione riproducibile, valutazione e scenari separati. |

Il catalogo è configurazione interna tipizzata: gli ID sono distinti dai codici paese e dagli slug pubblici. La registrazione controlla unicità e appartenenza e conserva copie delle definizioni, così una modifica agli oggetti originari non altera le rotte già registrate. Gli helper usano la gerarchia canonica del catalogo e rifiutano riferimenti incoerenti. Le osservazioni ricevute dai provider passano da contratti e validazione separati.

Le rotte dinamiche rappresentano paese, sezione ed edizione; una rotta esiste solo se il catalogo contiene la corrispondente gerarchia. Nella registrazione iniziale sono presenti esclusivamente USA/Midterms/2026. `/italy`, `/midterms` ed edizioni sconosciute restituiscono 404. `/admin` richiede autenticazione e ruolo verificati sul server; senza configurazione mostra indisponibilità. Le pagine preparatorie sono `noindex` e non mostrano osservazioni o percentuali dimostrative.

## Persistenza e processi

I repository salvano osservazioni, revisioni, ricevute e input dei run. I test reali del database sono separati dai test ordinari e vengono eseguiti in CI; il loro esito è nel documento di avanzamento. Il registro in composition collega soltanto gli adapter ammessi; fonte e associazione devono essere abilitate esplicitamente. Il seed conserva le decisioni amministrative esistenti. Autenticazione e letture pubbliche sono implementate; la disponibilità di previsioni richiede input verificati e un run pubblicato, non la sola presenza del motore.

Le osservazioni hanno identità globali per fonte e ID esterno; associazioni esplicite permettono il riuso fra edizioni. I sondaggi conservano revisioni, domande e opzioni normalizzate. Una ricevuta per acquisizione distingue il retry da una rettifica successiva; un sigillo impedisce anche aggiunte tardive ai figli di revisioni e run. I riferimenti degli input collegano revisione, associazione ed edizione con chiavi esterne composite.

La pubblicazione passa attraverso una transazione PostgreSQL: il database blocca la domanda, legge il proprio orologio dopo l'attesa del lock, controlla termine e ordine degli input e aggiorna storico e puntatore atomicamente. La lettura applica il termine anche con worker fermo. Le migrazioni sono esplicite, protette da lock e non partono nelle richieste web. Tipi, tabelle e registro delle migrazioni dei test risiedono in schemi temporanei isolati.

Web e worker condividono il repository, non lo stato in memoria. Il worker ha un proprio artefatto di build; pubblicazioni transazionali e letture web passano da PostgreSQL. Le regole di import e la revisione controllano la direzione delle dipendenze: il dominio non conosce framework o adapter, e la composizione collega le implementazioni. Le pagine distinguono archivio non configurato, errore, assenza di osservazioni e fonte sospesa. I limiti di lettura e le finestre temporali sono espliciti.

Compose separa il ruolo proprietario, usato soltanto da `migrate`, dal ruolo applicativo di web e worker. La coda è predisposta una sola volta per rilascio. La prova automatica dei container usa un progetto CI temporaneo; non equivale al collaudo delle risorse e dei backup sul VPS. Procedure in [DEPLOYMENT.md](DEPLOYMENT.md).
