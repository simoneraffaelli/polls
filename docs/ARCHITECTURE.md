# Architettura iniziale

Questo documento descrive le fondazioni e la persistenza locale. Per specifica completa e stato dei controlli vedere [piano](IMPLEMENTATION_PLAN.md) e [avanzamento](IMPLEMENTATION_STATUS.md).

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
| `src/worker/` | Avvio separato del worker; raccolta, coda e accesso al database saranno introdotti nelle rispettive fasi. |

Il catalogo è configurazione interna tipizzata: gli ID sono distinti dai codici paese e dagli slug pubblici. La registrazione controlla unicità e appartenenza e conserva copie delle definizioni, così una modifica agli oggetti originari non altera le rotte già registrate. Gli helper usano la gerarchia canonica del catalogo e rifiutano riferimenti incoerenti. Le future osservazioni ricevute da provider richiederanno contratti e validazione separati.

Le rotte dinamiche rappresentano paese, sezione ed edizione; una rotta esiste solo se il catalogo contiene la corrispondente gerarchia. Nella registrazione iniziale sono presenti esclusivamente USA/Midterms/2026. `/italy`, `/midterms`, edizioni sconosciute e amministrazione non implementata restituiscono 404. Le pagine preparatorie sono `noindex` e non mostrano osservazioni o percentuali dimostrative.

## Evoluzione prevista

La fase 2 introduce contratti, schema PostgreSQL e repository per sondaggi e run. I test reali del database sono separati dai test ordinari e vengono eseguiti in CI; il loro esito è nel documento di avanzamento. La fase 3 collegherà il worker alla coda e alla raccolta ritentabile. La fase 4 abiliterà soltanto provider ammessi dalle verifiche. Autenticazione e motore previsionale non sono ancora operativi.

Le osservazioni hanno identità globali per fonte e ID esterno; associazioni esplicite permettono il riuso fra edizioni. I sondaggi conservano revisioni, domande e opzioni normalizzate. Una ricevuta per acquisizione distingue il retry da una rettifica successiva; un sigillo impedisce anche aggiunte tardive ai figli di revisioni e run. I riferimenti degli input collegano revisione, associazione ed edizione con chiavi esterne composite.

La pubblicazione passa attraverso una transazione PostgreSQL: il database blocca la domanda, legge il proprio orologio dopo l'attesa del lock, controlla termine e ordine degli input e aggiorna storico e puntatore atomicamente. La lettura applica il termine anche con worker fermo. Le migrazioni sono esplicite, protette da lock e non partono nelle richieste web. Tipi, tabelle e registro delle migrazioni dei test risiedono in schemi temporanei isolati.

Web e worker condividono il repository, non lo stato in memoria. Il worker ha un proprio artefatto di build; le future pubblicazioni transazionali e le letture web passeranno da PostgreSQL. Le regole di import e la revisione controllano la direzione delle dipendenze: il dominio non conosce framework o adapter, e la composizione collega le implementazioni.
