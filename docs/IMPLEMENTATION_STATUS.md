# Stato dell'implementazione

Aggiornato: 22 ottobre 2026. Specifica: [piano di implementazione](IMPLEMENTATION_PLAN.md).

## Metodo e autorizzazioni

L'orchestratore assegna attività circoscritte ai sottoagenti Sol Medium/High richiesti dall'utente, revisiona il risultato e fa correggere i difetti prima della consegna. Gli agenti già informati vengono riutilizzati; i controlli aggiuntivi si concentrano sulle modifiche e sui rischi emersi. La preferenza Astra High per l'orchestratore è una scelta delle impostazioni della chat: questo documento non certifica il modello effettivamente in esecuzione.

L'utente ha autorizzato commit e push sul branch `codex/implementation-foundations` e ha chiarito che le fasi implementabili devono proseguire senza revisione umana ordinaria. Le PR sono riservate ai casi in cui servono. Il push non autorizza produzione, DNS o servizi a pagamento. Il collaudo operativo e il rilascio avverranno al deployment dell'utente, prima dell'apertura pubblica; i test automatici accompagnano invece lo sviluppo.

## Stato per fase

| Fase | Consegna applicativa | Verifiche e dipendenze residue |
|---|---|---|
| 0 — Specifica, fonti e ambiente | Audit del riferimento, condizioni delle fonti, perimetro e limiti documentati | Copertura dei dati e risorse effettive del VPS ancora da confermare |
| 1 — Fondazioni | Web e worker, runtime fissato, CI, immagini e Compose | Avvio container e permessi runtime verificati in CI; Coolify da configurare |
| 2 — Persistenza | Migrazioni, revisioni, sigilli, scope, input e pubblicazioni atomiche | Test PostgreSQL reale in CI; nuova serie di regressioni in verifica |
| 3 — Raccolta | HTTP limitato, quarantena, cursori, retry/riavvio, import e scheduler | Fonti disabilitate per impostazione predefinita; nessuna raccolta di produzione |
| 4 — Fonti e catalogo | VoteHub generic ballot, RSS Fed, import manuale, parser MEDSL Senate V8, 470 gare | Polymarket tecnico e inattivo; candidati, geometrie e prior completi non verificati |
| 5 — Sistema grafico | Hub, paese, sezione, edizione, componenti, grafici e tabelle alternative | Navigazione e mobile verificati; viste con dati sintetici riservate ai test |
| 6 — Osservatorio e admin | Letture reali, filtri e storico, provenienza, Better Auth, import con anteprima, audit ed esclusioni | Nuovi test HTTP amministrativi in verifica CI |
| 7 — Modello | Baseline correlata, input verificati, assemblatore DB, coda, pubblicazione, risultati e storico | Modello sperimentale; nessuna previsione 2026 pubblicata; validazione statistica aperta |
| 8 — Scenari e serie | Web Worker limitato e cancellabile, serie di sondaggi comparabili, copertura notizie e variazioni delle fonti | Nuovo flusso browser con run sintetico in verifica CI; tono e IA esterna disabilitati |
| 9 — Verifiche | Test dominio/provider/DB/browser, migrazione precedente, fixture secondo paese, controlli container e sonda di carico limitata | Misure rappresentative web+worker sul VPS, backup esterno e ripristino rinviati al collaudo operativo |
| 10 — Rilascio | Compose, ruoli DB separati, health check, limiti/rotazione log, script backup/restore e runbook | Nessun deployment, modifica DNS, backup remoto o prova di ripristino effettivo |

Il codice predisposto e una procedura descritta non dimostrano l'esito di un collaudo. I traguardi del piano rimangono distinti: disponibilità del motore sperimentale, validazione statistica e prodotto rilasciato non sono sinonimi.

## Evidenze di sviluppo

- Node `24.22.1` e pnpm `11.22.0`, dipendenze dirette esatte e lockfile versionato. Runtime locale portabile, senza sostituire quello globale.
- La [CI `dbc9c46`](https://github.com/simoneraffaelli/polls/actions/runs/39775227789) ha superato 68 test ordinari, 12 test PostgreSQL 17, build web/worker e 3 test browser. La successiva [CI del motore puro](https://github.com/simoneraffaelli/polls/actions/runs/39776462462) è passata integralmente.
- La [CI `52cde93`](https://github.com/simoneraffaelli/polls/actions/runs/39777968257) ha superato 85 test ordinari, 20 test PostgreSQL e build; una vecchia aspettativa browser su `/admin` è stata aggiornata al comportamento ora implementato.
- La [CI `8a08b60`](https://github.com/simoneraffaelli/polls/actions/runs/39782137191) ha superato typecheck, lint, formattazione e 94 test ordinari. I container si sono costruiti e avviati con PostgreSQL, migrazione, ruolo runtime limitato, readiness e rifiuto delle richieste anonime. La suite PostgreSQL ha eseguito 22 test con esito positivo e 4 con esito negativo: fixture prive di membership amministrativa, revisione del termine duplicata e tentativo di modificare una data storica immutabile. Le fixture sono state corrette senza indebolire i vincoli; l'incremento successivo ne verifica l'esito.
- Nell'ultimo controllo locale sono passati 94 test ordinari e la verifica della struttura delle migrazioni. Il primo avvio a freddo di ESLint su Windows ha superato il timeout di 15 secondi: aumentato a 60 secondi per quel solo test, senza cambiare le asserzioni. La suite limita a quattro i processi concorrenti.
- L'audit delle dipendenze runtime ha rilevato [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) nella dipendenza transitiva esbuild di drizzle-kit. Un override circoscritto a `@esbuild-kit/core-utils` usa `esbuild 0.25.12`; il successivo `pnpm audit --prod` non ha segnalato vulnerabilità note. Questo controllo non equivale a un audit di sicurezza completo.
- Build web standalone e worker eseguite durante lo sviluppo. Webpack è selezionato esplicitamente: Turbopack ha prodotto un errore interno CSS nel collaudo Windows anche con Node LTS. L'esecuzione fuori sandbox è stata necessaria per alcune operazioni locali sulla build e per i collegamenti del browser.
- Revisione visiva delle pagine senza dati a 1280 e 390 pixel: assenza di overflow orizzontale, skip link funzionante e nessun errore JavaScript rilevato. Grafici con alternative tabellari; nessun risultato numerico dimostrativo nelle pagine ordinarie.

Le suite PostgreSQL creano schemi casuali in un database di test dedicato e non usano credenziali di produzione. I test browser con amministrazione e scenario richiedono provisioning e dati sintetici nel database di CI; in locale senza PostgreSQL tali casi sono esplicitamente saltati. Le fixture sintetiche non fanno parte del seed di prodotto.

## Risultati della revisione

La revisione ha rafforzato idempotenza e ricevute delle acquisizioni, lock e sigilli dei dati, termine controllato dopo l'attesa dei lock, preservazione delle date prive di fuso, confronto esatto di struttura/opzioni/revisioni del modello, correzioni amministrative append-only e pubblicazione nella stessa transazione del run. I nuovi run rispettano le esclusioni correnti; quelli pubblicati restano ricostruibili.

Il modello distingue maggioranza dei seggi per partito e controllo per caucus; include shock condivisi nazionali e regionali. Lo scenario usa lo stesso nucleo di simulazione, riceve solo stime aggregate e non scrive la previsione pubblicata. Le letture controllano il termine anche con worker fermo. Nessun endpoint pubblico avvia simulazioni sul server.

La valutazione distingue metriche per gara e per ciclo, richiede evidenza strutturata della disponibilità storica e non interpreta una semplice attestazione come prova verificata. Il confronto con un mercato richiede identità e condizioni di risoluzione equivalenti, midpoint omogeneo e freschezza entro il limite. Il [rapporto di valutazione](FORECAST_EVALUATION.md) resta non valutabile con i dati attualmente verificati.

## Perimetro dei dati

- Il [riferimento esterno](REFERENCE_AUDIT.md) è stato inventariato a una revisione precisa senza eseguirne il codice.
- VoteHub: generic ballot implementato; campioni di due gare Senato non dimostrano copertura nazionale, distrettuale o storica. Le famiglie non supportate vengono messe in quarantena.
- Fed: RSS istituzionale Monetary Policy, con titoli e collegamenti; non rappresenta l'intera copertura della campagna elettorale.
- Polymarket: adapter, schema e gate tecnici; nessun mercato reale ammesso al confronto o raccolta attivata.
- MEDSL Senate V8: CSV completo verificato, parser/import e provenienza versionati. La release 2026 può fornire esiti, ma non certifica input disponibili per una previsione storica del 2024. House V15 richiede un passaggio di accesso non aggirato.
- Catalogo 2026: 435 gare Camera e 35 Senato, con particolarità Louisiana esplicita. Candidati, geometrie e assegnazioni individuali dei seggi non al voto restano da verificare; non vengono promossi automaticamente a input del modello.
- Nessun prior, orientamento politico o pronostico completo 2026 viene inventato. Il modello richiede registrazione esplicita di domanda, struttura e opzioni tramite [MODEL_OPERATIONS.md](MODEL_OPERATIONS.md).
- Tono mediatico disabilitato per assenza di validazione; nessun SDK, chiave, prompt o chiamata a IA esterna.

## Collaudo e rilascio a cura dell'utente

Il VPS dichiarato è IONOS 4-4-120: 4 vCore, 4 GB RAM, 120 GB NVMe. Restano da rilevare sistema operativo, risorse libere, altri servizi e posizione di Coolify. Il collegamento concordato è GitHub App con webhook e branch di rilascio esplicito. Il dominio previsto è `polls.simone.ooo`; DNS e HTTPS non sono stati modificati.

Restano da scegliere e verificare la destinazione dei backup esterni, il luogo delle build e le eventuali quote del registro. Gli script non costituiscono una prova di backup o ripristino. Gli obiettivi RPO 24 ore e RTO 4 ore sono proposti, non misurati. Una misura limitata in CI non certifica le prestazioni sul VPS con dati e raccolte simultanei.

Procedure: [distribuzione](DEPLOYMENT.md), [runbook](RUNBOOK.md), [backup e ripristino](BACKUP_RESTORE.md). Prima dell'apertura pubblica devono essere registrati gli esiti operativi mancanti. La validazione statistica richiede invece nuovi dati ed evidenze adeguate: non viene sostituita dal buon esito del deployment.
