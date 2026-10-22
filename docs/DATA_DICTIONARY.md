# Dizionario dei dati — contratti iniziali

I contratti della fase 2 descrivono dati normalizzati e controllabili prima del salvataggio. Non certificano la copertura, il diritto di ripubblicazione o l'attivazione di una fonte. Il database deve aggiungere vincoli relazionali, revisioni immutabili e transazioni; le definizioni di paese, sezione ed edizione rimangono nel catalogo applicativo.

## Identità e associazioni

| Campo                                 | Significato                         | Regola                                                                                                            |
| ------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `countryId`, `sectionId`, `editionId` | ID interni del catalogo             | Stringhe stabili, distinte da codice paese (`US`) e slug (`usa`). L'edizione appartiene a una sezione tramite FK. |
| `sourceId`                            | Fonte configurata                   | UUID interno; non coincide con il nome del provider o con un ID remoto.                                           |
| `externalId`                          | ID nella fonte                      | Stringa significativa solo insieme a `sourceId`.                                                                  |
| `entityId`                            | Identità stabile di un'osservazione | UUID interno, invariato attraverso correzioni.                                                                    |
| `revisionId`                          | Versione immutabile di un'entità    | UUID interno; un run fa riferimento a questo ID, mai solo a `entityId`.                                           |
| `supersedesRevisionId`                | Revisione precedente rettificata    | UUID o `null`; non può essere uguale al nuovo `revisionId`.                                                       |
| `ingestionRunId`                      | Esecuzione di raccolta/import       | UUID per audit e deduplicazione.                                                                                  |

Una rilevazione o un articolo raccolto una sola volta può essere associato a più sezioni. Le associazioni sezione/edizione e le relative FK sono separate dalla revisione globale. Il collegamento a una gara richiede una corrispondenza verificata; lo stesso nome non prova l'equivalenza di territori o edizioni diverse. Gli input previsionali, invece, portano sempre la coppia `sectionId`/`editionId`, che deve coincidere con quella della domanda e delle revisioni collegate.

## Tempi e provenienza

| Campo                                    | Tipo e significato                                                                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `observed`                               | Unione discriminata: `date` (`YYYY-MM-DD`), `date_period` (`startDate`, `endDate`) o `instant` (`...Z`). Il periodo non può terminare prima dell'inizio. |
| `declaredPublication`                    | `null` se ignota, oppure data senza ora o istante UTC dichiarati dalla fonte. Una sola data non viene trasformata in mezzanotte.                         |
| `acquiredAt`                             | Istante UTC `...Z` in cui Polls ha ricevuto il dato. È distinto da osservazione e pubblicazione dichiarata.                                              |
| `sourceRevision`                         | Revisione/versione dichiarata dalla fonte, oppure `null`; separata dalla revisione interna.                                                              |
| `parserVersion`, `transformationVersion` | Versioni del codice che ha interpretato e normalizzato il dato.                                                                                          |
| `contentHash`                            | SHA-256 esadecimale minuscolo del contenuto rilevante definito dall'adapter.                                                                             |
| `sourceUrl`                              | URL HTTP(S) pubblico di attribuzione o del record originale; non deve contenere credenziali o token.                                                     |

Una data non valida, un periodo invertito o un **istante** di pubblicazione dichiarato dopo l'acquisizione falliscono la validazione e richiedono quarantena o revisione esplicita. Una pubblicazione dichiarata come sola data non ha un fuso orario: il contratto conserva la precisione originale e non ne deduce un ordine rispetto all'istante UTC di acquisizione. Non si correggono silenziosamente orari o date.

## Famiglie di osservazioni

| Famiglia   | Campi essenziali e unità                                                                                                                                                                                        | Limiti                                                                                                                                                                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sondaggio  | `pollster`, `sponsors[]`, domande con `questionId`, `kind`, `wording` nullable, popolazione, `sampleGroupId`, numerosità nullable, opzioni e `percentage` in **0–100**. `observed` è il periodo di rilevazione. | RV e LV dello stesso studio possono condividere `sampleGroupId`: non sono due campioni indipendenti. Domanda ignota resta `null`. Percentuali di opzioni non vengono forzate a sommare 100.                                                                                                  |
| Quotazione | `marketId`, `outcomeId`, `snapshotId`, `qualityPolicyVersion`, `price`. Bid, ask, midpoint, spread e last trade sono frazioni in **0–1**, non percentuali in 0–100. `observed` è un istante.                    | `bid_ask_midpoint` con bid/ask coerenti può essere `eligible` o `excluded` con motivo. `last_trade` resta una misura separata. `unavailable` conserva tipo atteso e motivo, senza inventare un prezzo. Soglie di qualità/freschezza sono versionate per fonte, non fissate da questo schema. |
| Articolo   | `publisher`, `title`, URL, `excerpt` nullable, `excerptReusePermitted`.                                                                                                                                         | Il titolo e l'estratto normalizzati non contengono markup HTML; un estratto è ammesso solo con riuso permesso. Il contratto non contiene un campo per il testo integrale. Le condizioni per fonte rimangono da verificare.                                                                   |

## Domande, run e pubblicazione

| Campo                                   | Significato                                                                                                                                                                                                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `forecastQuestion.scope`                | Sezione ed edizione della domanda. Nessun run di un'altra edizione può sostituirla.                                                                                                                                                                                   |
| `cutoff`                                | Versione, data/ora locale, fuso IANA, istante UTC e riferimento HTTPS al calendario. I valori locale e UTC devono coincidere.                                                                                                                                         |
| `storedState`                           | `open`, `closed` o `archived`. Le transizioni verso la chiusura sono monotone nel database; cambiare il calendario non riapre la domanda.                                                                                                                             |
| `latestPublished`                       | Ultimo **run realmente pubblicato**: ID, `runSequence`, `inputAsOf`, istante di pubblicazione, versione e istante del cutoff validi per quella pubblicazione. Non include ricostruzioni retrospettive.                                                                |
| `frozenRunId`                           | ID dell'ultimo run pubblicato congelato, oppure `null` se assente. `open` insieme a un run congelato è incoerente.                                                                                                                                                    |
| `resolutionStatus`, `verifiedOutcomeId` | Esito `pending` o `verified`; una domanda può essere archiviata senza risultato verificato.                                                                                                                                                                           |
| `forecastRun`                           | ID e scope della domanda, sequenza, tipo (`forecast` o `retrospective_reconstruction`), `inputAsOf`, creazione/completamento, UUID esatti delle revisioni di input, hash snapshot, versioni di modello e parametri, seed, qualità e stato `experimental`/`validated`. |

La guardia pura respinge pubblicazioni dopo il cutoff, domande già chiuse, run incompleti, ricostruzioni, scope diversi, sequenze vecchie e regressioni di `inputAsOf`. Il repository deve ripetere i controlli **nella stessa transazione** usando il tempo del database e pubblicare il riferimento solo dopo il salvataggio completo. La lettura applica il cutoff anche se il worker è fermo: dopo il termine mostra l'ultimo run realmente pubblicato come congelato, oppure l'assenza di una previsione pubblicata. Le ricostruzioni restano identificabili a parte e non occupano `frozenRunId`.

Gli schemi sono in `src/platform/data/`, `src/elections/polling/` e `src/platform/publication/`; test dei casi limite in `tests/domain/`. Nessuna osservazione reale o previsione è attiva con la sola presenza di questi contratti.

## Evidenze del modello e rettifiche amministrative

| Registro | Significato e vincoli |
| --- | --- |
| `structural_model_references` | Versione immutabile di catalogo, priori e regole, con fonte, disponibilità, acquisizione e attestazione amministrativa. La registrazione non genera priori e non prova da sola la validità scientifica del modello. |
| `poll_model_option_mappings` | Associazione esplicita fra opzioni di una revisione, gara e orientamento politico. Evita di dedurre il significato da etichette libere o dal segno di un margine. Le correzioni producono nuovi record; i nuovi run devono usare l'associazione vigente. |
| `run_model_snapshots` | Snapshot e risultato JSONB tipizzati, hash distinti, iterazioni e riferimenti al run. Inserimento prima del sigillo, nessuna modifica successiva. Il retry dello stesso snapshot con le stesse iterazioni riusa il risultato. |
| `historical_result_records`, `historical_result_revisions` | Identità DOI/gara e revisioni append-only con versione del dataset, checksum del file, parser, disponibilità e acquisizione. I risultati di una release successiva non diventano input disponibili in passato. |
| `poll_forecast_exclusions`, `poll_link_decisions` | Decisioni editoriali per futuri calcoli e associazioni, senza riscrivere revisioni o riferimenti dei run pubblicati. Attore e motivo libero rimangono amministrativi; lo storico pubblico espone soltanto stato e tempi. |
| `admin_import_previews` | Anteprima vincolata a contenuto, attore, destinazione e scadenza. Il consumo, l'import e l'audit sono atomici; nessun payload originale viene conservato in questa tabella. |

Le associazioni ai sondaggi conservano `createdAt`. La migrazione assegna alle associazioni precedenti un istante prudente di migrazione, senza inventarne la data originaria. I confronti temporali sensibili alla precisione usano PostgreSQL; le query SQL dirette trasportano gli istanti come millisecondi numerici validati, non come cast TypeScript di stringhe.

Le basi degli scenari pubblici contengono stime aggregate, regole e parametri necessari alla simulazione, senza sondaggi grezzi o riferimenti privati. Il risultato è sempre uno scenario dell'utente; non aggiorna il puntatore della previsione pubblicata.
