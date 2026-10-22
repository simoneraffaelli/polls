# Architettura iniziale

Questo documento descrive il primo incremento locale. Per specifica completa e stato dei controlli vedere [piano](IMPLEMENTATION_PLAN.md) e [avanzamento](IMPLEMENTATION_STATUS.md).

## Confini

| Area | Responsabilità attuale |
|---|---|
| `src/platform/catalog.ts` | Contratti e registrazione di paesi, sezioni ed edizioni; validazione dei riferimenti; URL e breadcrumb. Nessuna dipendenza da Next.js, React o database. |
| `src/modules/usa/midterms/definition.ts` | Definizione dichiarativa della sezione USA/Midterms e dell'edizione 2026; nessuna formula o fonte attiva. |
| `src/composition/catalog.ts` | Collegamento delle definizioni al catalogo e origine canonica del sito. |
| `src/app/` | Pagine Next.js per hub, paese, sezione ed edizione. Risolvono il catalogo e mostrano dati di presentazione o una risposta 404. |
| `src/ui/patterns/` | Componenti comuni per navigazione e stati di assenza dati; nessuna query, credenziale o regola elettorale. |
| `src/infrastructure/config/` | Validazione della configurazione tecnica del processo worker, separata dalla build web. |
| `src/worker/` | Avvio separato del worker; raccolta, coda e accesso al database saranno introdotti nelle rispettive fasi. |

Il catalogo è configurazione interna tipizzata: gli ID sono distinti dai codici paese e dagli slug pubblici. La registrazione controlla unicità e appartenenza e conserva copie delle definizioni, così una modifica agli oggetti originari non altera le rotte già registrate. Gli helper usano la gerarchia canonica del catalogo e rifiutano riferimenti incoerenti. Le future osservazioni ricevute da provider richiederanno contratti e validazione separati.

Le rotte dinamiche rappresentano paese, sezione ed edizione; una rotta esiste solo se il catalogo contiene la corrispondente gerarchia. Nella registrazione iniziale sono presenti esclusivamente USA/Midterms/2026. `/italy`, `/midterms`, edizioni sconosciute e amministrazione non implementata restituiscono 404. Le pagine preparatorie sono `noindex` e non mostrano osservazioni o percentuali dimostrative.

## Evoluzione prevista

La fase 2 introdurrà schema PostgreSQL, repository e provenienza verificati su un database reale. La fase 3 collegherà il worker alla coda e alla raccolta ritentabile. La fase 4 abiliterà soltanto provider ammessi dalle verifiche. Non sono stati anticipati ORM, autenticazione, SDK delle fonti o motori previsionali senza comportamento utilizzabile.

Web e worker condividono il repository, non lo stato in memoria. Il worker ha un proprio artefatto di build; le future pubblicazioni transazionali e le letture web passeranno da PostgreSQL. Le regole di import e la revisione controllano la direzione delle dipendenze: il dominio non conosce framework o adapter, e la composizione collega le implementazioni.
