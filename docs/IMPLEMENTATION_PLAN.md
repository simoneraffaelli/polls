# Polls — Piano di implementazione

**Dominio:** `polls.simone.ooo`

**Primo paese:** `/usa`

**Prima sezione:** `/usa/midterms`

**Estensione prevista:** `/italy` come pagina del paese, con proprie sezioni di pronostici

**Data:** 22 ottobre 2026

**Stato:** implementazione avviata per incrementi verificabili; avanzamento e limiti in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Nessuna distribuzione eseguita.

## 1. Obiettivo e decisioni definitive

Realizzare un hub pubblico per consultare pronostici, sondaggi, mercati previsionali, notizie e loro evoluzione nel tempo. La prima sezione riguarderà le elezioni di metà mandato statunitensi. Il prodotto dovrà permettere di capire cosa prevedono i dati, come cambia la previsione e quali informazioni contribuiscono al cambiamento.

La piattaforma deve poter ospitare in futuro elezioni italiane e altri eventi senza incorporare le regole statunitensi nei servizi o nei componenti comuni.

Decisioni consolidate:

- Il repository esistente rimane indipendente dai progetti di trading presenti sul computer.
- Gerarchia dell'hub: paese → sezione → edizione → competizione; `/usa` e `/italy` sono pagine di paese allo stesso livello.
- Next.js con App Router, React e TypeScript.
- TypeScript anche per raccolta dati, elaborazioni e modello previsionale: nessun servizio Python.
- Un unico progetto con due processi applicativi: web e worker Node.js.
- PostgreSQL per dati, storico e coda dei lavori; nessun Redis iniziale.
- Distribuzione sul server IONOS attraverso Coolify.
- Fonti ad accesso gratuito, senza dipendenze obbligatorie da API a pagamento.
- Fonti modulari e disattivabili singolarmente.
- Componenti comuni riutilizzabili, contratti piccoli e composizione come impostazione predefinita.
- Modello statistico verificabile prima di eventuali estensioni con IA.
- IA esterna prevista come estensione, ma senza selezione del fornitore, implementazione o consumi in questa fase.
- Interfaccia ispirata alla gerarchia informativa di Polymarket, con identità propria e forte attenzione alla tipografia.
- Accesso pubblico senza registrazione; amministrazione riservata.

Il materiale inizialmente indicato come `USA_Midterm_Update.zip` è reperibile nel [repository USA_midterm fornito dall'utente](https://github.com/analise2024/USA_midterm/tree/main). Costituisce un riferimento per fonti, campi e flussi, senza diventare la base tecnologica dell'applicazione. Script, istruzioni e installatori presenti nel materiale non costituiscono requisiti del progetto né autorizzazioni a eseguirli. L'inventario distingue ciò che è effettivamente disponibile nel repository dall'eventuale archivio originario.

## 2. Perimetro del prodotto

### 2.1 Funzioni della prima versione

1. Homepage dell'hub con paesi, sezioni attive e principali variazioni.
2. Pagina paese USA e sezione Midterms con panoramica di Camera e Senato.
3. Schede delle singole competizioni, sondaggi, notizie e mercati pertinenti.
4. Storico delle osservazioni e delle previsioni effettivamente disponibili.
5. Confronto fra previsione del modello e probabilità implicita nei mercati.
6. Indicatori di opinione pubblica ricavati dai sondaggi, separati dal tono delle notizie.
7. Scenari modificabili dall'utente, chiaramente separati dalla previsione ufficiale del sito.
8. Metodologia, fonti, aggiornamento e qualità dei dati visibili.
9. Pannello amministrativo per fonti, raccolte, errori, associazioni e pubblicazioni.
10. Funzionamento continuativo con aggiornamenti automatici, backup e procedure di ripristino.

Il primo traguardo è l'osservatorio, rilasciabile autonomamente con il perimetro verificato nella fase 0. Modello sperimentale disponibile e modello validato sono traguardi distinti, definiti nel paragrafo 19. Le funzioni previsionali e gli scenari vengono resi disponibili solo quando esistono i rispettivi risultati e controlli.

Alla data del piano, 22 ottobre 2026, mancano 12 giorni alle elezioni generali del 3 novembre 2026 ([calendario FEC](https://www.fec.gov/help-candidates-and-committees/dates-and-deadlines/2026-reporting-dates/electioneering-communications-periods-general-election-2026/)). La stima di 39–66 giornate-persona per uno sviluppatore non sostiene il completamento della prima versione prima del voto. La pianificazione assume quindi che l'edizione 2026 possa essere pubblicata come osservatorio e archivio dopo il voto; un eventuale rilascio ridotto precedente richiede una verifica di fattibilità nella fase 0 e tutti i controlli delle fasi 9 e 10. Le ricostruzioni successive non saranno presentate come pronostici pubblicati prima dell'evento.

### 2.2 Estensioni successive

- Pagina paese Italia con sezioni elettorali dotate di proprie regole e fonti.
- Altre famiglie di eventi previsionali.
- IA esterna per analisi testuale o altre funzioni dimostrate utili.
- Account pubblici, notifiche, preferiti sincronizzati e abbonamenti, solo se richiesti.
- Risultati elettorali in tempo reale, se saranno disponibili fonti adeguate: non sono un requisito della prima versione.

### 2.3 Quattro grandezze da mantenere distinte

| Grandezza | Significato | Presentazione |
|---|---|---|
| Sondaggio | Stima di intenzioni di voto, approvazione o altra opinione su una popolazione | Percentuale, domanda, campione, periodo e fonte |
| Previsione | Probabilità stimata dal nostro modello per un esito definito | Probabilità, incertezza, versione e data |
| Mercato | Prezzo di un contratto interpretato come probabilità implicita | Fonte, condizioni del contratto, liquidità e aggiornamento |
| Tono delle notizie | Caratteristica dei contenuti raccolti | Copertura, metodo e limiti del campione |

Il tono delle notizie non rappresenta automaticamente il sentiment dell'elettorato. Non costruire inizialmente un unico numero che mescoli queste quattro grandezze.

## 3. Organizzazione dell'hub e degli URL

Un **paese** raggruppa le sezioni pertinenti, una **sezione** identifica un prodotto, un'**edizione** identifica un evento e una **competizione** identifica la specifica elezione o domanda da prevedere.

La gerarchia è `hub → paese → sezione → edizione → competizione`. `/usa` e `/italy` sono pagine di paese equivalenti; `/usa/midterms` è una sezione all'interno degli USA. La pagina paese presenta le sezioni disponibili e una selezione dei loro indicatori, riutilizzando lo stesso layout e gli stessi componenti.

| Percorso | Contenuto |
|---|---|
| `/` | Homepage dell'hub |
| `/usa` | Pagina paese USA con sezioni e indicatori principali |
| `/usa/midterms` | Introduzione e accesso all'edizione corrente |
| `/usa/midterms/2026` | Panoramica stabile dell'edizione |
| `/usa/midterms/2026/house` | Camera |
| `/usa/midterms/2026/senate` | Senato |
| `/usa/midterms/2026/races/[raceSlug]` | Competizione specifica |
| `/usa/midterms/2026/polls` | Archivio dei sondaggi |
| `/usa/midterms/2026/news` | Notizie e argomenti |
| `/usa/midterms/2026/scenarios` | Scenari |
| `/usa/midterms/2026/methodology` | Metodo e limiti |
| `/sources` | Catalogo pubblico delle fonti utilizzate |
| `/admin` | Amministrazione autenticata |
| `/italy` | Futura pagina paese Italia; non pubblicare pagine vuote nella prima versione |
| `/italy/[sectionSlug]` | Futura sezione italiana; nome da definire con il suo perimetro |
| `/italy/[sectionSlug]/[editionSlug]` | Edizione della futura sezione italiana |

L'edizione corrente viene scelta dalla configurazione della sezione. Le edizioni concluse mantengono URL e risultati. Le pagine indicizzabili avranno metadati e URL canonici coerenti per evitare duplicazioni fra introduzione ed edizione.

Centralizzare la costruzione degli URL e dei breadcrumb usando il catalogo: per esempio `Home → USA → Midterms → 2026 → Senate`. Lo slug pubblico del paese (`usa`, `italy`) resta distinto dal codice paese (`US`, `IT`) e dagli identificativi interni. Lo slug della sezione è univoco all'interno del paese, non necessariamente nell'intero hub.

Il percorso `/midterms` viene sostituito nel progetto da `/usa/midterms`. Poiché il sito non è ancora pubblicato, non serve introdurre una rotta legacy o un redirect per il vecchio percorso.

Non serve un sistema di multitenancy: le sezioni appartengono alla stessa applicazione e condividono infrastruttura e amministrazione.

## 4. Architettura e principi di programmazione

### 4.1 Tre livelli di riuso

| Livello | Responsabilità | Vincolo |
|---|---|---|
| Piattaforma | Fonti, lavori, storico, pubblicazione, catalogo paesi e sezioni | Non conosce regole elettorali nazionali |
| Funzioni elettorali comuni | Sondaggi, candidati, partiti, territori, periodi | Non presume due partiti o un particolare sistema elettorale |
| Modulo specializzato | Regole dell'evento, modello, associazioni e viste specifiche | Usa i contratti comuni senza modificare altri moduli |

Il modulo Midterms implementa le regole statunitensi. Un futuro modulo Italia potrà riutilizzare la gestione dei sondaggi ma definirà autonomamente coalizioni, soglie e attribuzione dei seggi.

### 4.2 SOLID e KISS applicati

- **Responsabilità singola:** un adapter recupera e normalizza; un servizio applicativo coordina; un modello calcola; un componente mostra.
- **Estensione:** una nuova fonte aggiunge un adapter e una registrazione, senza modificare il coordinatore della raccolta.
- **Sostituibilità:** gli adapter della stessa famiglia rispettano gli stessi significati, errori e requisiti temporali, non soltanto lo stesso tipo TypeScript.
- **Interfacce piccole:** sondaggi, notizie e mercati hanno contratti specifici. Nessuna interfaccia enorme con metodi inutilizzati.
- **Inversione delle dipendenze:** regole e operazioni dipendono da contratti; database e API esterne ne implementano i dettagli.
- **Semplicità:** un repository, un database, nessun bus distribuito, nessun caricamento dinamico di plugin e nessun contenitore di dependency injection iniziale.
- **Composizione:** preferire funzioni e oggetti configurabili a gerarchie di classi. L'ereditarietà richiede una relazione stabile e dimostrata, non soltanto codice simile.
- **Riuso concreto:** estrarre la logica realmente comune; evitare una generica classe `BaseElection` piena di eccezioni per paese.

### 4.3 Regole delle dipendenze

1. Il dominio contiene tipi e regole pure; non importa React, Next.js, database o client HTTP.
2. I servizi applicativi coordinano il dominio attraverso contratti espliciti.
3. Le integrazioni e l'infrastruttura implementano i contratti esterni.
4. `composition/` collega le implementazioni concrete ai servizi.
5. Le pagine Next.js chiamano servizi di lettura e presentano risultati; non eseguono raccolte o simulazioni pesanti durante una visita.
6. I moduli non importano gli interni di altri moduli. Il codice condiviso vive nella piattaforma o nelle funzioni elettorali comuni.
7. I componenti grafici ricevono modelli di presentazione: nessuna formula previsionale o credenziale nella UI.

I confini saranno controllati con regole sugli import, oltre alla revisione del codice.

## 5. Stack e struttura del repository

### 5.1 Stack scelto

| Esigenza | Scelta |
|---|---|
| Web e API | Next.js App Router, React, TypeScript strict |
| Runtime | Node.js LTS compatibile con le dipendenze selezionate |
| Gestione dipendenze | pnpm con lockfile versionato |
| Database | PostgreSQL |
| Accesso ai dati e migrazioni | Drizzle con driver PostgreSQL |
| Validazione esterna | Zod |
| Lavori asincroni | pg-boss su PostgreSQL |
| Stili | Tailwind CSS e variabili CSS per i token grafici |
| Grafici | Recharts; SVG dedicati per visualizzazioni elettorali specifiche |
| Autenticazione amministrativa | Better Auth, account predisposto, registrazione pubblica disabilitata |
| Test | Vitest, test di integrazione con PostgreSQL, Playwright |
| Qualità | Typecheck, ESLint, formattazione automatica |
| Distribuzione | Dockerfile multistadio e Docker Compose gestiti da Coolify |

Le versioni esatte vengono fissate nella fase di avvio dopo una verifica di compatibilità. Non usare tag mobili `latest` per le immagini di produzione.

Next.js supporta il self-hosting, quindi non richiede Vercel. Drizzle permette schema e accesso ai dati in TypeScript. pg-boss usa PostgreSQL come supporto alla coda. Riferimenti: [Next.js](https://nextjs.org/docs/app/guides/self-hosting), [Drizzle](https://orm.drizzle.team/docs/overview), [pg-boss](https://github.com/timgit/pg-boss).

Better Auth fornisce autenticazione email/password; la configurazione del progetto deve limitare l'accesso agli amministratori e chiudere la registrazione anche lato server. [Documentazione](https://better-auth.com/docs/authentication/email-password).

### 5.2 Struttura prevista

```text
src/
  app/                         # Rotte, layout, pagine, handler HTTP
    page.tsx
    usa/
      page.tsx                 # Pagina paese USA
      midterms/
    admin/
    api/
  platform/
    countries/                 # Catalogo paesi e metadati di presentazione
    sections/                  # Sezioni collegate ai paesi, edizioni, funzionalità
    sources/                   # Contratti e configurazioni
    ingestion/                 # Coordinamento della raccolta
    history/                   # Provenienza e revisioni
    publication/               # Pubblicazione coerente dei risultati
  elections/
    entities/                  # Concetti elettorali condivisi
    polling/                   # Regole condivise sui sondaggi
  modules/
    usa/
      midterms/
        definition.ts
        domain/
        application/
        forecasting/
        presentation/
  integrations/
    polymarket/
    votehub/
    rss/
    imports/                   # Import controllati CSV/JSON
  infrastructure/
    database/
    jobs/
    storage/
    auth/
  ui/
    primitives/
    charts/
    patterns/
  composition/
  worker/
tests/
  fixtures/
  integration/
  e2e/
migrations/
deploy/
docs/
```

Le integrazioni opzionali, come FRED e Census, e le sezioni sotto `modules/italy/` verranno aggiunte quando attivate. Il raggruppamento per paese non introduce una classe base nazionale: catalogo e layout paese sono comuni, le regole restano nei moduli delle sezioni. Non creare anticipatamente strutture prive di comportamento.

## 6. Contratti principali

| Contratto | Responsabilità | Informazioni essenziali |
|---|---|---|
| `CountryDefinition` | Registrare un paese | ID, codice paese, slug pubblico, nome e metadati di presentazione |
| `SectionDefinition` | Registrare una sezione di un paese | ID, riferimento al paese, slug locale, titolo, edizioni, funzionalità disponibili |
| `SourceAdapter<T>` | Recuperare e normalizzare una famiglia di dati | Input, cursore, osservazioni, errori tipizzati, versione parser |
| `SourceBinding` | Collegare una fonte a una sezione | Filtri, corrispondenze, abilitazione e politica d'uso |
| `ForecastEngine<Input, Output>` | Calcolare una previsione | Input congelato, versione, seed, output e diagnostica |
| `ScenarioEngine<Input, Output>` | Calcolare ipotesi alternative | Run di partenza, modifiche ammesse, risultato separato |
| Repository specifici | Leggere e scrivere entità | Operazioni necessarie, senza esporre l'ORM al dominio |
| Modelli di presentazione | Alimentare UI comuni | Valore, unità, tipo di metrica, provenienza, freschezza |

I registri dei paesi e delle sezioni saranno espliciti e tipizzati nel codice, con verifica dei riferimenti fra loro. La configurazione amministrativa potrà abilitarli e modificarne parametri consentiti, ma non caricare codice arbitrario. Il layout paese riceve le sezioni registrate e i rispettivi modelli di presentazione, senza conoscere le formule previsionali.

Una sezione può avere sondaggi senza avere ancora previsioni. Le funzionalità disponibili governano navigazione e componenti: nessun obbligo di implementare metodi fittizi.

Per ogni famiglia di dati il contratto comprenderà uno schema di validazione eseguito al momento della ricezione. Un cast TypeScript non certifica la validità di una risposta esterna.

## 7. Modello dati e provenienza

### 7.1 Gruppi di entità

| Gruppo | Entità indicative |
|---|---|
| Catalogo | Paesi, sezioni associate ai paesi, edizioni, competizioni, domande previsionali |
| Elezioni | Camere, territori e loro versioni, partiti, candidati, candidature |
| Fonti | Provider, fonti configurate, associazioni alle sezioni, esecuzioni |
| Sondaggi | Rilevazioni, domande, popolazioni, opzioni e risultati |
| Mercati | Contratti, esiti/token, regole di risoluzione, osservazioni con tipo di prezzo, bid/ask, spread, tempi e politica di qualità versionata |
| Notizie | Articoli, provenienza, associazioni, argomenti, gruppi di duplicati |
| Previsioni | Input congelati, run, risultati, diagnostica, pubblicazioni |
| Operazioni | Utenti amministrativi, audit, stato dei lavori |

Usare colonne e relazioni per i dati interrogati e i vincoli importanti. Riservare JSONB a payload originali consentiti, configurazioni versionate e diagnostica strutturata. Evitare una tabella universale che nasconda tutte le differenze in JSON.

Gli identificativi interni non dipendono dall'ID di un provider. Le associazioni esterne sono versionate e riconciliabili. La stessa etichetta geografica non prova che due collegi di anni diversi siano equivalenti.

Ogni sezione appartiene a un paese tramite riferimento esplicito; il database garantisce l'unicità della coppia paese/slug della sezione. Ogni edizione appartiene a una sezione. Usare questi riferimenti per ricavare il paese dei risultati, senza duplicare il campo in ogni tabella quando non necessario.

### 7.2 Dimensione temporale

Conservare separatamente:

- data o periodo a cui il dato si riferisce;
- data di pubblicazione dichiarata dalla fonte, se disponibile;
- momento in cui il sistema lo ha effettivamente acquisito;
- versione o rettifica della fonte;
- versione del parser e della trasformazione;
- hash del contenuto rilevante e riferimento all'esecuzione di raccolta.

Per i sondaggi distinguere inizio/fine rilevazione, pubblicazione e acquisizione. Per le serie economiche distinguere periodo osservato e versione pubblicata. Le date senza orario non diventano artificiosamente timestamp precisi.

Le correzioni creano revisioni. Le previsioni pubblicate mantengono i riferimenti agli input originali: rielaborare oggi non deve cambiare ciò che il sito mostrava ieri.

### 7.3 Storico, isolamento e conservazione

- Ogni risultato e job pertinente usa identificativi globali di sezione ed edizione, collegati al paese. Le chiavi di cache e di navigazione distinguono paese, sezione ed edizione; il solo slug locale non basta.
- Le notizie e le osservazioni condivise possono avere associazioni a più sezioni senza duplicare la raccolta.
- La struttura dei vincoli impedisce associazioni accidentali fra edizioni incompatibili.
- Conservare i run pubblicati e gli input necessari a ricostruirli.
- Definire budget per payload, log e storico dei prezzi; evitare crescita senza limiti.
- Qualunque riduzione della risoluzione storica è esplicita e non elimina input referenziati da run conservati.
- Per contenuti editoriali conservare soltanto ciò che le condizioni della fonte consentono; non archiviare automaticamente il testo integrale.

## 8. Fonti e politica di gratuità

L'obiettivo è un costo ricorrente di accesso ai dati pari a zero. L'accesso gratuito attuale non garantisce permanenza, copertura completa o libertà di ripubblicazione. Il sistema deve poter disabilitare una fonte senza attivare automaticamente un'alternativa a pagamento.

| Fonte | Ruolo | Decisione |
|---|---|---|
| Polymarket, endpoint pubblici di dati | Contratti, prezzi e confronto con il modello | Prima versione; nessuna funzione di trading |
| VoteHub, API pubblica documentata | Sondaggi e opinione pubblica | Prima versione, dopo verifica della copertura necessaria |
| RSS selezionati | Notizie e argomenti | Prima versione, per fonte e condizioni d'uso |
| Dataset elettorali pubblici e risultati ufficiali | Storico e riferimenti delle competizioni | Necessari al modello; selezione per copertura e licenza |
| FRED/ALFRED | Variabili economiche e relative versioni storiche | Opzionale, solo se giustificate dal modello |
| Census | Variabili territoriali e demografiche | Opzionale, solo se utili e correttamente associate ai territori |
| Import CSV/JSON controllato | Dati pubblici non disponibili via API | Supportato con validazione, provenienza e audit |
| GDELT | Eventuale ampliamento delle notizie | Rinviato; valutare volume e utilità |
| Cook e altri servizi a pagamento | Rating editoriali | Esclusi dalle dipendenze obbligatorie |
| Scraper presenti nello ZIP | Spunti per campi e raccolta | Riutilizzo solo dopo verifica indipendente |

La documentazione pubblica di VoteHub presenta un'API beta con licenza CC BY 4.0: attribuzione e verifica della copertura restano necessarie. [VoteHub](https://votehub.com/polls/api/).

La verifica documentale del 22 ottobre 2026 conferma queste indicazioni, ma non dimostra una copertura sufficiente delle singole gare Camera/Senato o degli archivi necessari alla valutazione. La fase 0 deve misurare separatamente copertura per competizione, tipi di sondaggio, profondità storica e disponibilità delle revisioni. Se VoteHub non copre una famiglia di dati, limitarne l'uso alle famiglie verificate e cercare una fonte gratuita autorizzata o un import controllato. In assenza di alternative, ridurre esplicitamente il perimetro dell'osservatorio e mantenere aperto il modello che dipende dai dati mancanti.

Polymarket documenta endpoint per eventi, mercati, prezzi, spread e storico. Il connettore deve usare soltanto i servizi di lettura previsti, rispettando i limiti correnti. [API Polymarket](https://docs.polymarket.com/api-reference/predictions/overview).

FRED richiede una chiave applicativa; Census documenta il rilascio gratuito della chiave. Prima di attivarli verificare le condizioni delle serie effettivamente usate e l'eventuale redistribuzione. [FRED](https://fred.stlouisfed.org/docs/api/api_key.html), [Census](https://www.census.gov/data/developers/guidance/api-user-guide.API_Key.html).

Ogni fonte avrà una scheda con URL, condizioni, attribuzione richiesta, disponibilità gratuita verificata, data della verifica, frequenza, limiti, campi attesi e comportamento in caso di indisponibilità. Una fonte non ancora verificata non è una dipendenza garantita del rilascio.

### 8.1 Definizione del prezzo di mercato

Per il confronto iniziale usare il punto medio fra migliore proposta di acquisto e migliore proposta di vendita (`(bid + ask) / 2`) dello stesso esito/token, acquisiti nello stesso snapshot. Conservare anche i due prezzi, lo spread, il tempo dichiarato dal provider quando disponibile e il momento di acquisizione. Il valore visualizzato come percentuale mantiene l'etichetta di probabilità implicita di mercato.

Prima di implementare l'adapter, la fase 0 deve fissare nella scheda della fonte le soglie di spread e freschezza e verificare che l'endpoint scelto restituisca questa misura senza sostituirla con l'ultimo scambio. Quotazioni mancanti, non valide, incrociate o oltre le soglie rendono indisponibile il confronto corrente; l'ultimo dato valido può restare visibile con età e stato espliciti. Nessun ripiego silenzioso sull'ultimo scambio o su un solo lato del book.

Gli archivi importati conservano il tipo di prezzo effettivamente fornito: una serie di ultimi scambi non viene unita a una serie di punti medi. Quando la misura storica è diversa o non documentata, mostrarla separatamente oppure escluderla dal confronto omogeneo con il modello. Versionare ogni cambiamento della politica e segnalare le discontinuità. Il confronto con una previsione usa un'osservazione di mercato valida disponibile entro il medesimo istante di riferimento, senza usare prezzi successivi.

## 9. Raccolta e aggiornamento

### 9.1 Flusso

```text
Pianificazione
  -> richiesta al provider con limiti
  -> validazione del payload
  -> normalizzazione e riconciliazione
  -> salvataggio delle osservazioni e delle revisioni
  -> valutazione della qualità
  -> eventuale nuovo calcolo
  -> pubblicazione atomica
  -> lettura da parte del sito
```

Distinguere integrazione tecnica, fonte configurata e associazione alla sezione. Un connettore Polymarket può servire più moduli; il significato del singolo contratto appartiene alla sezione che lo utilizza.

### 9.2 Comportamento dei lavori

- pg-boss coordina lavori persistenti e pianificazione; nessun timer affidato alla visita di una pagina.
- Assumere che un lavoro possa essere ritentato: deduplicazione e idempotenza devono essere garantite dall'applicazione e dai vincoli del database.
- Avanzare il cursore soltanto dopo aver salvato i dati corrispondenti.
- Gestire pagine duplicate, ordine variabile, rettifiche e aggiornamenti tardivi.
- Timeout, numero massimo di pagine, dimensione massima delle risposte e budget temporale per job.
- Retry con attesa crescente e variazione casuale; rispettare `Retry-After` quando presente.
- Errori di schema distinti da errori di rete; non ritentare indefinitamente dati strutturalmente incompatibili.
- Limitare inizialmente la concorrenza a un lavoro pesante; misurare prima di aumentarla.
- Isolare gli errori per fonte. Una fonte guasta non deve bloccare tutte le altre.
- Riavvio e arresto del worker non devono generare raccolte duplicate o perdita dello stato.

### 9.3 Frequenze iniziali proposte

| Dato | Frequenza iniziale | Nota |
|---|---|---|
| Metadati dei mercati | Ogni 6 ore | Più frequente solo quando necessario |
| Prezzi dei mercati selezionati | Ogni 15 minuti | Richieste aggregate e budget per fonte |
| Sondaggi | Ogni 60 minuti | Adeguare al ritmo reale di pubblicazione |
| RSS | Ogni 30 minuti | Richieste condizionali quando supportate |
| Dati strutturali ed economici | Giornaliera o su calendario | Evitare richieste inutili |
| Previsioni | Dopo input rilevanti, con accorpamento; almeno verifica giornaliera | Non ricalcolare per ogni visita |

Sono valori iniziali di configurazione, da validare con limiti delle fonti e capacità del server. La UI mostrerà l'età effettiva del dato, non l'orario previsto dello scheduler.

### 9.4 Pubblicazione e cache

Un nuovo risultato viene pubblicato solo se completo rispetto alla sua politica di qualità. Una transazione aggiorna il riferimento al risultato pubblicato; un job più vecchio terminato in ritardo non deve sostituire quello più recente.

Per le previsioni, la stessa operazione verifica anche lo stato della domanda e il termine di pubblicazione del paragrafo 10.5, usando il tempo del database. Un job iniziato prima del termine ma concluso dopo non può pubblicare un nuovo pronostico corrente. La lettura applica il termine anche se il worker è fermo; cache e UI non devono mantenere l'etichetta di previsione corrente oltre la scadenza.

Le pagine leggono dati preparati. Per il primo rilascio, cache a durata breve con budget di ritardo dichiarato, indicativamente 60–300 secondi; nessuna dipendenza da invalidazioni in memoria fra web e worker. Cache e dataset sono sempre contestualizzati al paese e, quando pertinenti, alla sezione e all'edizione. Le pagine paese aggregano soltanto le sezioni che appartengono a quel paese.

In caso di guasto resta disponibile l'ultimo risultato valido con indicazione di obsolescenza. Se manca un input indispensabile, il nuovo run non viene pubblicato. La politica specifica stabilisce quando mostrare soltanto lo storico o sospendere la previsione corrente.

## 10. Modello previsionale Midterms

### 10.1 Definire prima l'esito

Per ogni domanda fissare esito, finestra temporale e regola di risoluzione. Distinguere vittoria in una competizione, seggi complessivi e controllo di una camera.

La configurazione dell'edizione deve rappresentare seggi in elezione, seggi non in elezione, eventuali elezioni speciali, indipendenti e relative regole di appartenenza. Le regole di maggioranza e gli eventuali criteri di spareggio devono essere versionati e verificati su riferimenti autorevoli.

Un mercato esterno è confrontabile solo quando la sua definizione coincide con la domanda del modello. Non basta che il titolo contenga “House” o “Senate”.

### 10.2 Modello iniziale

1. Costruire una baseline semplice e riproducibile.
2. Aggregare i sondaggi pertinenti, distinguendo popolazione, domanda e periodo.
3. Gestire la dipendenza fra sondaggi dello stesso istituto e dello stesso campione; non sommare ingenuamente tutte le numerosità.
4. Introdurre pesi temporali e di qualità motivati e versionati.
5. Usare informazioni strutturali disponibili al momento previsto quando mancano sondaggi locali, aumentando l'incertezza.
6. Stimare distribuzioni dei margini o degli esiti delle competizioni.
7. Simulare errori condivisi nazionali e regionali, oltre a quelli specifici: le competizioni non sono indipendenti.
8. Aggregare le simulazioni nella distribuzione dei seggi e nella probabilità di controllo.

Il modello sarà implementato in TypeScript con funzioni testabili, generatore casuale con seed e dipendenze numeriche limitate. Il numero di simulazioni sarà scelto misurando errore Monte Carlo e consumo di risorse; la UI non mostrerà precisione superiore a quella sostenuta dal calcolo.

### 10.3 Uso di mercati, economia e notizie

- Pubblicare inizialmente il mercato come confronto indipendente.
- Confrontare baseline, modello e mercato su esiti equivalenti.
- Introdurre un modello combinato soltanto se migliora la valutazione fuori campione.
- Aggiungere variabili economiche o demografiche soltanto quando esiste una motivazione verificabile e una disponibilità storica corretta.
- Non inserire automaticamente il tono delle notizie nel modello: richiede una validazione aggiuntiva.

### 10.4 Validazione e limiti

- Separare sviluppo, selezione dei parametri e valutazione finale per periodo elettorale.
- Evitare che dati rivisti successivamente, esiti finali o rating futuri entrino nelle ricostruzioni storiche.
- Per il periodo operativo usare il momento di acquisizione effettivo; per archivi importati distinguere disponibilità storica documentata da ricostruzioni basate su ipotesi.
- Non spacciare l'importazione odierna di un archivio come storico delle previsioni che il sito avrebbe realmente pubblicato.
- Misurare Brier score e log loss per gli esiti probabilistici, calibrazione e copertura degli intervalli; valutare separatamente errori sui seggi.
- Tenere conto della dipendenza fra competizioni: molte gare nella stessa elezione non equivalgono a molte elezioni indipendenti.
- Confrontare con baseline esplicite e documentare l'incertezza della valutazione.
- Definire e versionare prima della valutazione finale i criteri per la qualifica di modello validato: copertura minima, periodi di valutazione, metriche, confronto con baseline e limiti accettabili. Il rapporto documenta il superamento o il mancato superamento di ciascun criterio.
- Se i dati non bastano per una validazione attendibile, rendere disponibile un modello sperimentale chiaramente etichettato oppure rinviare la previsione, mantenendo operativo l'osservatorio. La disponibilità sperimentale non completa l'obiettivo del modello validato.

Nessun criterio di completamento può promettere che il modello anticiperà correttamente una specifica elezione.

### 10.5 Termine delle previsioni e archivio

Per ogni domanda previsionale registrare un termine di pubblicazione con fuso orario originario, istante UTC e riferimento ufficiale al calendario. Fissarlo nella fase 0 non oltre la prima chiusura dei seggi delle competizioni che concorrono alla domanda; per il controllo di una camera considerare tutte le competizioni incluse. Eventuali turni successivi richiedono domande e termini espliciti. Versionare le modifiche al calendario senza riaprire automaticamente una domanda già chiusa.

Gli stati della domanda sono `aperta`, `chiusa alle previsioni` e `archiviata`. Raggiunto il termine, bloccare nuove pubblicazioni previsionali e congelare il riferimento all'ultimo run effettivamente pubblicato prima della scadenza, insieme a input e metodologia. Se non esiste, dichiarare che il sito non ha pubblicato una previsione prima del termine. Il controllo deve valere anche in caso di riavvio, job in ritardo o mancata esecuzione dello scheduler; una domanda registrata dopo il proprio termine nasce già chiusa.

Una domanda chiusa può essere archiviata anche in attesa del risultato: distinguere esito non ancora disponibile da esito verificato. L'eventuale acquisizione successiva dei risultati ufficiali segue provenienza e revisioni e serve alla valutazione; non modifica i run congelati. Un'edizione passa in archivio quando tutte le sue domande sono chiuse. Questo ciclo non richiede risultati elettorali in tempo reale.

Notizie, prezzi e rettifiche possono continuare ad alimentare l'osservatorio come dati successivi alla chiusura, senza generare pronostici correnti. URL e storico restano consultabili; la UI distingue previsione congelata, dato successivo all'evento e ricostruzione retrospettiva. Gli scenari su run congelati sono etichettati come scenari storici e mantengono l'eventuale stato sperimentale del modello di partenza.

Le ricostruzioni possono essere pubblicate nell'archivio con data reale di elaborazione, istante storico ricostruito e ipotesi sulla disponibilità degli input, senza occupare il riferimento al run previsionale congelato. Possono alimentare scenari storici soltanto se identificabili e riproducibili; l'etichetta di ricostruzione rimane visibile anche nello scenario.

## 11. Opinione pubblica, notizie e scenari

### 11.1 Opinione pubblica

Presentare serie distinte per intenzioni di voto, generic ballot, approvazione e favore verso soggetti specifici. Conservare domanda e popolazione: misure diverse non diventano intercambiabili perché espresse in percentuale.

Mostrare variazioni su intervalli coerenti e indicare quando la composizione delle rilevazioni cambia. Un dato assente non è zero e un campione insufficiente non è sentiment neutrale.

### 11.2 Notizie e tono

Prima versione: raccolta, deduplicazione, associazione a competizioni e argomenti, andamento dei volumi. Titoli, brevi estratti consentiti e collegamenti alle fonti.

Un'eventuale classificazione deterministica locale del tono richiede un campione annotato manualmente, valutazione della qualità e indicazione del soggetto cui il tono si riferisce. In assenza di qualità sufficiente, mostrare soltanto notizie e copertura. Un lessico generico sui titoli non sarà presentato come misurazione affidabile dell'orientamento politico.

Registrare insieme agli indicatori il paniere di fonti: aggiungere o rimuovere un editore può alterare una serie senza che sia cambiato il contenuto del dibattito. Rendere visibili questi cambiamenti e, quando possibile, confrontare anche un insieme stabile di fonti.

### 11.3 Scenari

- Partire da un run pubblicato identificato, non da dati mutevoli.
- Esporre pochi parametri comprensibili, con limiti documentati.
- Usare lo stesso motore di calcolo della previsione, dove applicabile.
- Etichettare sempre il risultato come scenario dell'utente.
- Riportare lo stato sperimentale del modello di partenza, se presente, e la natura storica dello scenario quando la domanda è chiusa.
- Nessun effetto sui dati o sulle previsioni pubblicate.
- Eseguire nel browser i calcoli sufficientemente leggeri; per calcoli server imporre limiti, cache e protezione dagli abusi.
- Preferenze locali nel browser; nessun account pubblico necessario.

### 11.4 Estensione IA

Documentare il punto in cui un futuro servizio potrebbe produrre annotazioni testuali con fonte, versione e diagnostica. Il dominio deve ricevere dati validati, non risposte libere di un modello.

In questo progetto iniziale non implementare SDK, prompt, chiavi, chiamate, valutazioni di provider o stime di consumo IA. La futura attivazione avrà un piano e un budget separati. L'osservatorio e il modello statistico devono funzionare senza tale servizio.

## 12. Design e componenti

Riferimento visivo: [pagina Midterms di Polymarket](https://polymarket.com/it/predictions/midterms). Riprendere chiarezza, gerarchia e densità informativa, senza replicare marchio o risorse proprietarie.

Direzione grafica:

- fondo chiaro caldo, testo quasi nero, separatori netti;
- titoli ampi, numeri ben leggibili e griglia rigorosa;
- poche ombre, angoli contenuti e decorazione minima;
- carattere principale dal disegno deciso; monospaziato per date e metadati;
- token per spaziature, tipografia, colori, bordi e stati;
- colori politici forniti dal modulo, mai fissati nei componenti comuni;
- scelta definitiva dei font dopo una prova visiva e verifica della licenza.

Componenti comuni: `CountryOverview`, `SectionCard`, breadcrumb, `MetricCard`, `ProbabilityCard`, `DeltaBadge`, `FreshnessBadge`, `SourceAttribution`, `TimeSeriesChart`, `DistributionChart`, `PollTable`, `NewsList`, filtri, paginazione, stati vuoti, caricamento ed errore.

I nomi indicano responsabilità, non impongono un'API definitiva. Una scheda probabilistica deve ricevere anche il tipo e la definizione dell'esito; non basta passare un numero.

Le visualizzazioni specifiche, come mappa dei collegi o composizione delle camere, appartengono al modulo. Layout responsive, navigazione da tastiera, focus visibile, contrasto adeguato, alternativa testuale ai grafici e assenza di significati affidati soltanto al colore sono requisiti del rilascio.

## 13. Fasi di implementazione

Ogni fase produce risultati verificabili. Le dipendenze indicano l'ordine logico; attività indipendenti possono procedere insieme senza saltare i criteri di accettazione.

### Fase 0 — Specifica operativa e verifica delle dipendenze

**Attività**

- Congelare il perimetro della prima edizione Midterms e le domande da prevedere.
- Registrare termini di pubblicazione e calendario di riferimento secondo il paragrafo 10.5; definire il perimetro del primo osservatorio e la fattibilità di un eventuale rilascio ridotto prima del voto, senza assumerlo come scadenza garantita.
- Inventariare il materiale utile del repository di riferimento e degli eventuali ZIP senza eseguirne script o installatori.
- Verificare provider, schemi, copertura, gratuità e condizioni delle prime fonti.
- Verificare la copertura effettiva di VoteHub e fissare misura di prezzo, endpoint e soglie di qualità dei mercati secondo il paragrafo 8.1.
- Individuare archivi e risultati necessari alla valutazione del modello.
- Rilevare CPU, RAM, disco, sistema operativo, servizi esistenti e collocazione di Coolify sul server IONOS.
- Identificare dominio/DNS, destinazione dei backup e luogo di esecuzione delle build.
- Registrare le decisioni in documenti brevi di architettura.

**Consegne:** specifica del prodotto, matrice fonti, inventario dell'ambiente, rischi e alternative.

**Accettazione:** nessuna dipendenza essenziale classificata come gratuita senza verifica; copertura per famiglia e competizione, disponibilità e limiti dei dati storici espliciti; termini di pubblicazione e politica dei prezzi documentati. L'eventuale mancanza di dati previsionali non impedisce di procedere con un osservatorio dal perimetro ridotto dichiarato.

### Fase 1 — Fondazioni del progetto e distribuzione locale

**Dipende da:** fase 0.

**Attività**

- Inizializzare Next.js, TypeScript strict e comandi uniformi nel repository esistente, preservandone documentazione e indipendenza.
- Impostare struttura, confini degli import, catalogo paesi e registrazione del modulo USA/Midterms.
- Predisporre PostgreSQL locale e validazione delle variabili d'ambiente.
- Configurare typecheck, lint, test e build in integrazione continua.
- Preparare Dockerfile e Compose con avvii separati per web e worker.
- Definire versioni, lockfile e gestione dei segreti.

**Consegne:** scheletro eseguibile, ambiente locale riproducibile, pipeline di verifica.

**Accettazione:** un nuovo ambiente può avviare il progetto seguendo il README; build riuscita; nessuna credenziale nel repository; dominio privo di dipendenze dal framework.

### Fase 2 — Database, provenienza e contratti

**Dipende da:** fase 1.

**Attività**

- Implementare schema iniziale e migrazioni.
- Modellare paesi, sezioni, edizioni, competizioni, fonti, osservazioni e revisioni.
- Implementare repository specifici e schemi Zod.
- Definire identificativi, associazioni esterne, timestamp e deduplicazione.
- Definire struttura degli input di previsione e pubblicazione versionata.
- Modellare stati e termini delle domande, riferimento al run congelato e tipo di prezzo delle osservazioni di mercato.

**Consegne:** schema, dizionario dei dati, contratti e fixture rappresentative.

**Accettazione:** un dato rettificato conserva la versione precedente; dati di edizioni differenti non si mescolano; un input congelato continua a riferirsi alla sua versione originale.

### Fase 3 — Raccolta comune e coda dei lavori

**Dipende da:** fase 2.

**Attività**

- Configurare pg-boss e avvio del worker.
- Implementare client HTTP comune, limiti, retry e classificazione degli errori.
- Gestire cursori, idempotenza, stato dei job e salute delle fonti.
- Implementare normalizzazione, quarantena dei dati incompatibili e pubblicazione atomica.
- Predisporre il servizio interno di import CSV/JSON con validazione, riepilogo degli errori, provenienza e tracciamento dell'esecuzione, utilizzabile da test e strumenti locali controllati. Nessuna rotta web di import in questa fase; anteprima amministrativa e autorizzazioni vengono integrate insieme nella fase 6.

**Consegne:** pipeline completa verificata su fixture e integrazioni controllate.

**Accettazione:** ripetere un job non duplica i dati; un arresto seguito da riavvio riprende correttamente; una fonte guasta non blocca le altre; un risultato vecchio non sovrascrive uno più recente.

### Fase 4 — Prime fonti e catalogo Midterms

**Dipende da:** fase 3.

**Attività**

- Implementare adapter Polymarket, VoteHub e RSS per le sole famiglie e fonti ammesse dalla verifica della fase 0; documentare eventuali sostituzioni gratuite autorizzate.
- Creare catalogo dell'edizione, competizioni, candidati e associazioni.
- Verificare corrispondenza fra mercati e domande previsionali.
- Importare lo storico autorizzato e i risultati di riferimento disponibili; registrare le lacune che impediscono il modello senza bloccare il perimetro approvato dell'osservatorio.
- Gestire dati mancanti, ambiguità, duplicati e rettifiche.
- Attivare FRED/Census solo se necessari al modello scelto.

**Consegne:** dataset iniziale tracciabile e raccolta automatica configurabile.

**Accettazione:** ogni dato visualizzabile ha fonte e tempo; i mercati ambigui restano esclusi; copertura e lacune sono misurate; i parser hanno test su payload reali anonimizzati ove necessario e fixture di errore.

### Fase 5 — Sistema grafico e struttura dell'hub

**Dipende da:** fase 1; può procedere durante le fasi 2–4.

**Attività**

- Definire token, tipografia, griglia e layout responsive.
- Costruire componenti comuni, grafici e stati di errore/assenza dati.
- Implementare homepage dell'hub, layout paese riutilizzabile, pagina `/usa`, navigazione paese/sezione, breadcrumb e selezione edizione.
- Preparare viste Midterms e visualizzazioni specifiche.
- Usare fixture soltanto nello sviluppo, riconoscibili e non pubblicabili come dati reali.

**Consegne:** libreria interna di componenti e pagine strutturalmente complete.

**Accettazione:** buona leggibilità su telefono e desktop; flussi principali utilizzabili da tastiera; componenti comuni senza nomi di partiti o regole USA incorporati.

### Fase 6 — Osservatorio operativo e amministrazione

**Dipende da:** fasi 4 e 5.

**Attività**

- Collegare le pagine dell'osservatorio ai dati reali e alle rispettive provenienze; rendere disponibili le viste previsionali e gli scenari soltanto con le consegne pertinenti delle fasi 7 e 8.
- Implementare storico, filtri, confronto fra rilevazioni e indicatori di aggiornamento.
- Implementare autenticazione amministrativa, autorizzazioni server e audit.
- Collegare il servizio interno di import a un'anteprima amministrativa e a operazioni protette lato server; verificare autorizzazione sia per l'anteprima sia per il salvataggio.
- Permettere sospensione delle fonti, esclusione dai nuovi calcoli, correzione delle associazioni e riavvio controllato dei job.
- Implementare stati di chiusura e archivio e la loro presentazione, anche quando non esiste alcun run previsionale precedente al termine.
- Pubblicare fonti e metodologia descrittiva.
- Misurare interrogazioni, cache e crescita del database.

**Consegne:** prima versione dell'osservatorio completa nel perimetro della fase 0, distribuibile dopo il collaudo della fase 9 e le verifiche di rilascio della fase 10.

**Accettazione:** nessun dato inventato nelle pagine pubbliche; indisponibilità chiaramente mostrata; operazioni amministrative vietate agli anonimi anche chiamando direttamente le API; rimozione di una fonte senza perdita dello storico.

### Fase 7 — Modello statistico e valutazione

**Dipende da:** fase 4 e dati adeguati per il motore; fasi 5 e 6 per l'integrazione nella UI e nel ciclo di pubblicazione. La qualifica di modello validato richiede anche archivi adeguati alla valutazione temporale; in loro assenza è possibile soltanto il traguardo sperimentale del paragrafo 19, se ne sono rispettati i requisiti.

**Attività**

- Formalizzare esiti, regole e baseline.
- Implementare aggregazione dei sondaggi, distribuzioni e simulazione correlata.
- Versionare parametri, seed, codice e input.
- Definire e versionare criteri di pubblicabilità e validazione prima della valutazione finale, gestione delle lacune e stati sperimentali.
- Costruire valutazione temporale e confronto con baseline e mercato secondo quei criteri.
- Esporre risultati, incertezza e metodologia nella UI.
- Applicare il termine di pubblicazione anche ai job in corso; congelare i run e separare le ricostruzioni successive secondo il paragrafo 10.5.

**Consegne:** motore riproducibile, rapporto di valutazione e stato esplicito del traguardo sperimentale o validato; previsione corrente pubblicabile soltanto per domande ancora aperte.

**Accettazione:** stessi input e versione riproducono il risultato entro la tolleranza numerica documentata; nessuna contaminazione temporale nota; diagnostica e limiti riportati; termine rispettato anche con job tardivi e riavvii. La fase è completa come modello validato solo se il rapporto dimostra il superamento dei criteri fissati; il solo traguardo sperimentale lascia aperta la validazione, senza promesse di accuratezza.

### Fase 8 — Scenari ed evoluzione dell'opinione pubblica

**Dipende da:** fase 6 e motore riproducibile con run pubblicato della fase 7 per gli scenari; fase 6 per le serie descrittive. Gli scenari possono usare un run sperimentale mantenendone l'etichetta, senza dichiarare conclusa la validazione della fase 7.

**Attività**

- Implementare scenari limitati e riproducibili da un run pubblicato.
- Aggiungere serie di approvazione/intenzioni di voto e confronto nel tempo.
- Mostrare copertura delle notizie, argomenti e variazioni del paniere di fonti.
- Valutare un indicatore locale del tono solo se supera la verifica descritta nel piano.
- Documentare il futuro punto d'integrazione IA, senza attivarlo.

**Consegne:** simulatore e pannelli temporali con significati distinti.

**Accettazione:** uno scenario non modifica il modello pubblicato; limiti di calcolo rispettati; tono mediatico mai etichettato come opinione dell'elettorato; nessuna chiamata a IA esterna.

### Fase 9 — Verifiche complete e prova di estensibilità

**Dipende da:** funzioni da includere nel rilascio e configurazione di distribuzione preparata dalla fase 1. Non dipende dal rilascio pubblico della fase 10.

**Attività**

- Eseguire test end-to-end, accessibilità, sicurezza applicativa e carico rappresentativo.
- Predisporre un ambiente di collaudo isolato con immagini e configurazione rappresentative del rilascio; verificare reti private, persistenza, limiti di risorse, backup esterno e ripristino prima dell'apertura pubblica.
- Misurare gli obiettivi del paragrafo 15 con carico web e worker contemporanei e risorse equivalenti a quelle previste; documentare differenze dall'ambiente finale e controlli da ripetere nella fase 10.
- Provare errori delle fonti, timeout, dati malformati, riavvii e job ripetuti.
- Verificare prezzi mancanti o non omogenei, soglie di qualità, chiusura delle domande, job conclusi oltre il termine e archivio senza precedenti pronostici.
- Verificare migrazioni da versione precedente e isolamento delle edizioni.
- Creare una piccola fixture di un secondo paese e di una sua sezione per provare registrazione, layout comune e separazione delle regole, senza sviluppare le sezioni italiane complete.
- Verificare che sezioni di paesi diversi possano usare lo stesso slug locale senza collisioni di URL, cache, job o risultati; controllare breadcrumb e URL canonici sotto `/usa/midterms`.
- Verificare che budget e limiti impediscano ai calcoli di rendere il sito inutilizzabile.

**Consegne:** rapporto dei controlli, difetti risolti, limiti residui documentati.

**Accettazione:** nessun difetto bloccante nei flussi pubblici o amministrativi; nuove sezioni registrabili senza modificare formule o componenti Midterms; obiettivi operativi del paragrafo 15 misurati in collaudo; ripristino riuscito e differenze dall'ambiente finale documentate. Queste evidenze precedono la fase 10.

### Fase 10 — Coolify, rilascio e gestione operativa

**Dipende da:** fase 9 per le funzioni rilasciate. La configurazione può essere preparata dalla fase 1.

**Attività**

- Collegare il repository a Coolify tramite GitHub App e webhook, come indicato dall'utente; scegliere il luogo della build dopo la verifica delle risorse e delle eventuali quote esterne.
- Configurare ambiente, dominio, HTTPS, reti private, volumi e limiti.
- Eseguire migrazione controllata prima dell'avvio dei servizi compatibili.
- Abilitare soltanto le raccolte verificate, evitando doppia pianificazione.
- Attivare e verificare i backup esterni nell'ambiente finale; riutilizzare la prova di ripristino della fase 9 solo se rappresentativa, altrimenti ripeterla in isolamento prima dell'apertura pubblica.
- Confermare nell'ambiente finale limiti e misure della fase 9, ripetendo i controlli interessati dalle differenze di configurazione prima dell'apertura pubblica.
- Predisporre rollback prima dell'apertura pubblica ed eseguire controlli funzionali dopo il rilascio.
- Consegnare procedure operative e manutenzione.

**Consegne:** applicazione online, backup verificato, monitoraggio e runbook.

**Accettazione:** dominio funzionante in HTTPS; database non pubblico; dati persistenti dopo ricreazione dei container; ripristino riuscito; limiti di risorse adeguati; errori e obsolescenza distinguibili dal semplice stato “container avviato”.

La produzione è un'attività futura di questa fase: la redazione del presente piano non ha eseguito installazioni, modifiche DNS o deployment.

## 14. Distribuzione su Coolify

### 14.1 Servizi

| Servizio | Funzione | Esposizione |
|---|---|---|
| `web` | Next.js, pagine, API e amministrazione | Tramite proxy Coolify sul dominio pubblico |
| `worker` | Raccolta, calcoli e pianificazione | Rete privata |
| `postgres` | Dati e coda | Rete privata, volume persistente |
| `migrate` | Migrazioni del rilascio | Comando o servizio temporaneo, non processo permanente |

Web e worker sono prodotti dallo stesso repository e dalla stessa revisione, con avvii distinti. La build Next.js deve includere anche le dipendenze necessarie al worker nel relativo target; non presumere che l'output della sola applicazione web sia sufficiente.

Coolify supporta Compose da repository e la gestione delle relative impostazioni. Il file versionato rimane il riferimento della distribuzione. Il dominio viene associato al solo servizio web. [Docker Compose su Coolify](https://coolify.io/docs/applications/builds/docker-compose), [Next.js su Coolify](https://coolify.io/docs/applications/framework-examples/javascript/nextjs).

Il collegamento previsto, indicato dall'utente, è tramite GitHub App con webhook. Configurare il branch di rilascio e impedire che branch di sviluppo o pull request attivino la produzione; un webhook non sostituisce i controlli di rilascio e la migrazione eseguita una sola volta. La scelta del collegamento non determina se la build avverrà sul VPS o su infrastruttura esterna.

### 14.2 Risorse e build

L'utente ha indicato il piano IONOS **VPS 4-4-120: 4 vCore, 4 GB RAM e 120 GB NVMe SSD**. Sono risorse dichiarate, non una misura del margine disponibile. Prima del rilascio rilevare sistema operativo, consumo dei servizi esistenti e impatto di Coolify, se installato sullo stesso server; confermare spazio e memoria liberi con carico web e worker simultanei.

Partire con un'istanza web, un worker a concorrenza limitata, pool database contenuti e query indicizzate. Build in CI o su altra macchina se la memoria del VPS non offre margine. Anche le quote del servizio CI vanno verificate prima di classificarle come costo nullo.

Se il carico non rientra nei limiti: ridurre richieste e ricalcoli non necessari, ottimizzare query e caching, poi valutare un aumento di risorse. Nessuna garanzia di capacità basata soltanto sul prezzo del server.

### 14.3 Sicurezza e gestione

- Credenziali esclusivamente nelle variabili protette; mai esposte al browser o nei log.
- Account amministrativo creato tramite procedura controllata; iscrizione pubblica disabilitata.
- Sessioni revocabili, cookie sicuri, protezioni CSRF e limiti ai tentativi di autenticazione.
- Autorizzazione verificata in ogni operazione di scrittura, non soltanto nella pagina admin.
- Parser e renderer non eseguono HTML o istruzioni ricevuti dalle fonti.
- URL delle raccolte limitati a provider autorizzati: impedire richieste a indirizzi interni tramite configurazioni arbitrarie.
- Immagini e dipendenze aggiornate con rilascio controllato; segreti distinti tra ambienti.
- Ruoli database limitati ai compiti effettivi; migrazioni con identità separata quando necessario.
- Log strutturati con identificativo di run, sezione e fonte; rotazione per evitare saturazione del disco.

### 14.4 Backup, ripristino e rollback

Backup PostgreSQL coerente giornaliero, inizialmente con conservazione proposta di 7 giornalieri e 4 settimanali, da adeguare allo spazio. Copie cifrate in una destinazione esterna al VPS, con credenziali separate. Una copia sullo stesso disco non è il backup di recupero del servizio.

Provare un ripristino prima del rilascio e poi periodicamente. Obiettivi iniziali proposti: perdita massima di dati di 24 ore e ripristino entro 4 ore, da confermare con una prova reale. Documentare anche il ripristino della configurazione e dei segreti, senza inserirli nel repository.

Usare migrazioni additive quando possibile. Il ritorno alla precedente immagine applicativa non annulla automaticamente una migrazione: verificare compatibilità e prevedere recupero dei dati per le modifiche incompatibili.

## 15. Strategia di verifica

| Area | Controlli essenziali |
|---|---|
| Dominio | Regole elettorali, unità, percentuali, margini e incertezza |
| Contratti delle fonti | Payload validi, campi mancanti, cambi di schema, date, paginazione, tipo di prezzo e soglie di qualità |
| Persistenza | Revisioni, vincoli, migrazioni, input congelati |
| Worker | Retry, riavvio, deduplicazione, cursori, ordinamento delle pubblicazioni e blocco dei run oltre il termine |
| Web | Navigazione paese/sezione/edizione, breadcrumb, filtri, stati vuoti, aggiornamento, URL canonici, archivio e scadenza delle etichette previsionali anche in cache |
| Amministrazione | Accesso, autorizzazioni dirette alle API, audit e disattivazione fonti |
| Modello | Riproducibilità, causalità temporale, calibrazione e baseline |
| Operazioni | Risorse, crescita del disco, backup, restore e rollback |

I test automatici ordinari usano fixture versionate: non dipendono dalla disponibilità delle fonti esterne. Le verifiche dal vivo sono controlli separati, con limiti di richieste. Non introdurre test che ripetono banalmente l'implementazione; verificare soprattutto contratti, regole e modi di guasto.

Obiettivi iniziali del rilascio, da misurare e adattare al server:

- pagine principali utilizzabili su mobile e desktop senza scorrimento orizzontale involontario;
- nessuna chiamata ai provider nel percorso critico di una visita;
- risposta delle letture comuni dal server, con cache calda, orientativamente sotto un secondo al 95° percentile nel profilo di carico concordato;
- nessuna terminazione per memoria insufficiente durante raccolta e traffico ordinario simultanei;
- aggiornamento di una fonte entro la cadenza prevista più la tolleranza dichiarata quando il provider è disponibile;
- stato di obsolescenza visibile quando quella tolleranza viene superata.

## 16. Costi e stima dell'impegno

### 16.1 Costi ricorrenti

| Voce | A cosa serve | Previsione |
|---|---|---|
| VPS IONOS | Esegue applicazione, worker e database | Canone già sostenuto, circa 4–5 €/mese dichiarati; incremento solo se necessario |
| Vercel | Hosting gestito alternativo | Non necessario: 0 € previsti |
| Supabase/Render o altri hosting applicativi | Database o processi gestiti alternativi | Non necessari: 0 € previsti |
| Coolify | Gestione dei rilasci e dei servizi | Nessun nuovo piano incluso; considerare l'eventuale canone della modalità già usata |
| API dati selezionate | Alimentazione dell'osservatorio | Budget 0 €, con verifica per fonte e nessun passaggio automatico a pagamento |
| Dominio e DNS | Indirizzo pubblico | Riutilizzo di `simone.ooo`; normalmente il sottodominio non richiede un secondo dominio, verificare il provider |
| Backup esterno | Recupero da perdita del VPS | Da quantificare sulla destinazione disponibile e sul volume |
| Build e registro immagini | Produzione e conservazione delle immagini | Possibile uso di quote gratuite; verificarne i limiti |
| IA esterna | Future elaborazioni opzionali | Disabilitata: 0 € di consumo previsto |
| Monitoraggio esterno | Rilevare indisponibilità dell'intero server | Eventuale servizio gratuito entro quote; non obbligatorio un piano a pagamento |

Il worker non è un abbonamento: è un processo sul server. PostgreSQL e la coda non richiedono un servizio gestito separato. Il costo aggiuntivo può essere molto contenuto, ma non è possibile fissarlo a zero senza verificare risorse, backup e modalità di Coolify.

### 16.2 Impegno indicativo

Stime di giornate-persona per uno sviluppatore esperto, comprensive di sviluppo e verifiche della fase. Non sono un preventivo né giorni di calendario garantiti.

| Fase | Impegno indicativo |
|---|---:|
| 0 — Specifica, dati e ambiente | 1–2 giorni |
| 1 — Fondazioni | 2–3 giorni |
| 2 — Dati e contratti | 3–5 giorni |
| 3 — Raccolta comune | 2–4 giorni |
| 4 — Fonti e catalogo | 5–8 giorni |
| 5 — Design e hub | 4–7 giorni |
| 6 — Osservatorio e admin | 5–8 giorni |
| 7 — Modello e valutazione | 8–14 giorni |
| 8 — Scenari e serie temporali | 3–5 giorni |
| 9 — Verifiche finali | 3–5 giorni |
| 10 — Rilascio e operazioni | 3–5 giorni |
| **Totale** | **39–66 giornate-persona** |

L'indisponibilità di archivi storici adeguati o cambiamenti nelle fonti possono aumentare l'impegno, soprattutto nelle fasi 4 e 7. Il totale esclude il modulo Italia, l'IA esterna e la manutenzione successiva. Per un costo di sviluppo usare la tariffa effettiva moltiplicata per le giornate concordate, separando un eventuale margine per questi rischi.

L'osservatorio può essere rilasciato prima del modello, applicando alle funzioni già pronte i controlli delle fasi 9 e 10. Non promettere il completamento del modello prima di una specifica elezione sulla base di questa stima preliminare.

Le stime delle fasi 9 e 10 comprendono rispettivamente il collaudo operativo prima del rilascio e la conferma nell'ambiente finale, senza contare due volte la stessa prova. La fase 0 rivaluterà l'impegno in base a fonti, ambiente e perimetro effettivi. Per il calendario dell'edizione 2026 vale l'assunzione del paragrafo 2.1: nessuna consegna completa garantita prima del voto.

## 17. Rischi e decisioni operative

| Rischio | Risposta prevista |
|---|---|
| API gratuita rimossa o modificata | Adapter isolato, salute della fonte, disattivazione e alternativa gratuita verificata |
| Copertura insufficiente dei sondaggi | Lacune visibili, import controllato, incertezza maggiore o sospensione della previsione |
| Fonte disponibile ma licenza incompatibile | Esclusione dei dati o uso limitato consentito; nessuna presunzione di riutilizzabilità |
| Archivio storico non causale | Separare valutazione documentata da ricostruzione con ipotesi |
| Mercato non equivalente alla domanda | Nessun confronto o aggregazione automatica |
| Cambiamento del paniere delle notizie | Tracciamento della composizione e discontinuità visibili |
| VPS sottodimensionato | Build esterna, concorrenza ridotta, misurazioni, eventuale upgrade |
| Fonte guasta | Ultimo dato valido con età esplicita; niente valori inventati |
| Abuso degli scenari | Calcolo locale quando possibile, limiti server e cache |
| Perdita del server | Backup esterno e ripristino provato |
| Eccesso di generalizzazione | Contratti piccoli, moduli espliciti, estrazione del riuso quando dimostrato |

## 18. Aggiungere in futuro `/italy`

1. Registrare il paese Italia con codice `IT` e slug `italy`; predisporre `/italy` con il layout paese condiviso.
2. Definire la prima sezione italiana, il suo slug, le edizioni, le competizioni e le domande previsionali; aggiungere `modules/italy/<section>` e collegarlo al paese nel catalogo.
3. Implementare regole elettorali e modello propri, con configurazioni versionate.
4. Aggiungere le nuove fonti o associare quelle già disponibili.
5. Riutilizzare sondaggi, provenienza, scheduler, database e amministrazione.
6. Riutilizzare il sistema grafico, introducendo solo le viste specifiche necessarie.
7. Verificare i contratti comuni e la valutazione del nuovo modello.
8. Attivare `/italy` e le rotte `/italy/<section>/<edition>` quando i contenuti sono pronti. `/italy` rimane la pagina paese, coerente con `/usa`.

Non è richiesto un nuovo server, un nuovo frontend o un nuovo database per principio. L'eventuale aumento di risorse dipenderà dal carico misurato.

## 19. Documentazione e definizione di completamento

Documentazione da consegnare nel repository:

- `README.md`: avvio locale, comandi e struttura.
- `docs/ARCHITECTURE.md`: responsabilità, contratti e dipendenze.
- `docs/DATA_DICTIONARY.md`: campi, tempi, unità e versioni.
- `docs/SOURCES.md`: fonti, condizioni, attribuzioni e limiti.
- `docs/FORECAST_METHODOLOGY.md`: modello, valutazione e limiti.
- `docs/DESIGN_SYSTEM.md`: token e componenti.
- `docs/DEPLOYMENT.md`: Coolify, immagini, migrazioni e variabili.
- `docs/RUNBOOK.md`: errori, riavvio, manutenzione e monitoraggio.
- `docs/BACKUP_RESTORE.md`: backup, ripristino e prove effettuate.
- `docs/ADDING_A_SECTION.md`: procedura per registrare un paese e aggiungere una sua sezione, incluse rotte e contratti.

I traguardi sono distinti e vanno rendicontati separatamente:

| Traguardo | Criteri di completamento |
|---|---|
| Osservatorio completo | Hub e Midterms accessibili nel perimetro della fase 0, fonti verificate, provenienza e freschezza visibili, lacune dichiarate, amministrazione protetta, chiusura e archivio corretti, controlli delle fasi 9 e 10 superati e ripristino provato. Non richiede un modello previsionale. |
| Modello sperimentale disponibile | Motore riproducibile, input e codice versionati, controlli temporali e di pubblicazione superati, diagnostica e limiti documentati, etichetta sperimentale visibile su risultati e scenari. Valutazioni mancanti o insufficienti sono dichiarate; questo traguardo non equivale alla validazione. |
| Modello validato | Requisiti tecnici di riproducibilità, provenienza e pubblicazione sopra descritti e rapporto che dimostra il superamento dei criteri fissati prima della valutazione finale: copertura, separazione temporale, metriche probabilistiche, calibrazione, confronto con baseline e incertezza della valutazione. La qualifica vale soltanto per il perimetro valutato e non garantisce l'esito di una specifica elezione; non rietichetta retroattivamente i run sperimentali già pubblicati. |

La prima versione completa del prodotto richiede l'osservatorio, il modello validato, gli scenari separati e le serie descrittive previste, con i controlli delle fasi 9 e 10 applicati a tutte le funzioni rilasciate. Se la validazione resta insufficiente, l'osservatorio può essere concluso come consegna autonoma e il modello sperimentale può essere disponibile, ma il traguardo del modello validato e la prima versione completa restano aperti.

Per un'edizione già chiusa, i risultati del modello sono consultabili soltanto come run realmente congelati o ricostruzioni retrospettive dichiarate; nessun criterio di completamento richiede o consente di inventare una pubblicazione precedente al termine.
