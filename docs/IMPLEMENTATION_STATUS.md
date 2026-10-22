# Stato dell'implementazione

Aggiornato: 22 ottobre 2026. Specifica di riferimento: [piano di implementazione](IMPLEMENTATION_PLAN.md).

## Metodo di lavoro

L'orchestratore assegna attività circoscritte, revisiona le modifiche e richiede correzioni prima di accettare una consegna. Su richiesta dell'utente, i sottoagenti usano Sol con ragionamento Medium per ricerche e attività ben delimitate, High per implementazione e problemi complessi. Ogni incarico specifica file di competenza, risultato atteso e controlli. Si riutilizzano gli agenti già informati; le revisioni aggiuntive si concentrano sui rischi rimasti, senza duplicare indiscriminatamente analisi e test.

La preferenza per l'orchestratore è Astra High, da selezionare nella chat; questo documento non certifica il modello effettivamente in esecuzione e non cambia le impostazioni dell'app.

L'utente autorizza commit e push degli incrementi verificati. Il branch di questo incremento è `codex/implementation-foundations`; le PR saranno usate quando serve revisione umana o quando il contesto lo richiede. Il push di un branch di sviluppo non è un'autorizzazione al rilascio in produzione.

Chiarimento dell'utente del 22 ottobre: l'orchestratore deve continuare fino al completamento del lavoro implementabile, senza una revisione umana a ogni fase. Commit e resoconti sono tappe, non punti di arresto. Test di dominio, integrazione e browser accompagnano lo sviluppo; il collaudo operativo e il rilascio sull'ambiente finale avverranno quando l'utente eseguirà il deployment. Le relative evidenze e la validazione statistica non dimostrata rimangono distinte dal completamento del codice.

## Consegne e verifiche

| Blocco | Fasi del piano | Verifica necessaria | Stato |
|---|---|---|---|
| Specifica e dipendenze | 0 | Perimetro, evidenze sulle fonti, ambiente e lacune dichiarate | In corso |
| Fondazioni locali | 1 | Typecheck, lint, test mirati, build e avvio documentato; controlli container separati | Incremento locale verificato; collaudo container ancora da eseguire |
| Persistenza e contratti | 2 | Migrazioni, revisioni e isolamento su PostgreSQL reale | Verificato in CI PostgreSQL 17 sul commit `284f095` |
| Raccolta e fonti ammesse | 3–4 | Fixture, retry, cursori, idempotenza e pubblicazioni ordinate | Pipeline e adapter verificati in CI; collegamento del registro fonti in corso |
| Interfaccia e osservatorio | 5–6 | Accessibilità, provenienza, stati reali e autorizzazioni amministrative | Componenti e navigazione verificati; letture reali e amministrazione in corso |
| Modello e scenari | 7–8 | Riproducibilità, valutazione temporale e limiti di calcolo | Motore puro e criteri di valutazione in corso; nessun modello pubblicato |
| Collaudo e rilascio | 9–10 | Carico, ripristino, sicurezza e verifiche dell'ambiente finale | Non iniziato |

I blocchi non costituiscono nuove autorizzazioni al rilascio. La fase 5 può procedere dopo le fondazioni secondo le dipendenze del piano. Lo stato di un blocco cambia soltanto sulla base di evidenze; una configurazione scritta non equivale a una verifica eseguita.

### Controlli del primo incremento

- Node `24.22.1`: typecheck, lint e formattazione superati. Verificata anche la rigenerazione di `next-env.d.ts` prima del typecheck.
- **14 test automatici superati**: 5 per il catalogo, 6 per la configurazione worker e 3 per i confini degli import. La revisione ha aggiunto controlli mirati su alias, import relativi, dominio e presentazione.
- Build del worker e build web standalone riuscite. Sviluppo e build web usano Webpack: Turbopack ha prodotto un errore interno nell'elaborazione CSS sul sistema Windows anche con Node LTS; la causa non è stata attribuita con certezza.
- **2 test Playwright superati** contro l'avvio standalone: navigazione, stato senza dati, breadcrumb, URL canonico, `noindex` e rotte escluse. L'esecuzione fuori dalla sandbox ha consentito le connessioni locali bloccate nell'ambiente ristretto.
- Collaudo visivo di homepage ed edizione 2026 a 1280 e 390 pixel: nessun overflow orizzontale o errore JavaScript di pagina; skip link visibile al primo Tab e funzionante con Invio. Screenshot locali esaminati, esclusi da Git.
- Avvio del worker con configurazione invalida verificato: uscita con codice 1 e messaggio generico senza password. Collegamenti interni della documentazione e controllo whitespace Git superati.
- **CI Linux superata** sul commit applicativo `ce0e7ca`: installazione da clone pulito con lockfile, typecheck, lint, formattazione, 14 test, build worker/web e 2 test browser. [Esecuzione GitHub Actions](https://github.com/simoneraffaelli/polls/actions/runs/39754611289).
- Dockerfile e Compose sono predisposti, ma i container non sono ancora stati eseguiti. PostgreSQL non è stato avviato né usato dai test di questo incremento; la CI applicativa non ne certifica il funzionamento.

La revisione ha corretto riferimenti contraffatti o incoerenti negli helper del catalogo, confini degli import, codifica delle credenziali del worker, esclusione dei file locali e avvio standalone. Le fondazioni applicative consentono di proseguire con la fase 2; il collaudo container resta una voce operativa aperta, rinviata secondo il chiarimento dell'utente, e non viene considerato superato.

### Persistenza e contratti: incremento verificato

Contratti Zod e dizionario dei dati, schema Drizzle, migrazione iniziale e repository di sondaggi/run sono implementati. La revisione ha richiesto ricevute idempotenti per acquisizione, sigilli contro inserimenti tardivi, riferimenti coerenti fra fonti/edizioni, preservazione delle date senza fuso e controllo del termine dopo l'attesa dei lock.

Typecheck, lint, formattazione, controllo della struttura delle migrazioni e **23 test ordinari** superati. La [CI del commit `284f095`](https://github.com/simoneraffaelli/polls/actions/runs/39770292505) ha eseguito con successo anche **5 test su PostgreSQL 17 reale**, build worker/web e 2 test browser. La prima prova remota ha individuato una conversione errata dei timestamp nelle query dirette: corretta usando istanti numerici e confrontando il termine nel database. L'esclusione Git dei dati locali è stata limitata alla cartella radice per non nascondere i contratti applicativi.

La fase 3 può proseguire. I test PostgreSQL usano schemi temporanei isolati in CI; non certificano ancora backup, reti o risorse del VPS.

### Raccolta, adapter e componenti: CI superata

La [CI del commit `dbc9c46`](https://github.com/simoneraffaelli/polls/actions/runs/39775227789) ha superato typecheck, lint, formattazione, **68 test ordinari**, **12 test PostgreSQL 17**, build worker/web e **3 test browser**. I test di raccolta coprono retry, riavvio, pausa, rinvio persistente dopo rate limit, transazioni complete e conflitti del cursore. Il precedente incremento `0e096f9` è passato separatamente. Un errore di formattazione in una fixture del commit intermedio `52efe51` è stato corretto prima di questo esito.

### Motore sperimentale: implementazione pura

Motore e scenario usano snapshot espliciti, parametri inclusi nel digest, seed riproducibile e limiti di costo. La revisione ha corretto disponibilità temporale, orientamento comune degli shock, regole di maggioranza, validazione numerica e verifiche dei payload JSON. **13 test mirati** superati localmente. Le [scelte metodologiche](FORECAST_METHODOLOGY.md) precedono la valutazione; il [rapporto](FORECAST_EVALUATION.md) dichiara l'assenza degli archivi necessari per dimostrare validazione causale. Persistenza del modello, pubblicazione e collegamento allo scenario pubblico sono ancora in corso; nessun run 2026 viene inventato.

## Fase 0: perimetro iniziale

### Adapter e interfaccia: incremento locale

Sono presenti adapter conservativi VoteHub generic ballot e Fed Monetary Policy, adapter CLOB inattivo con verifiche esplicite richieste e parser MEDSL Senate V8 con provenienza temporale. Il catalogo strutturale contiene 435 gare Camera e 35 Senato; candidati, geometrie e assegnazioni individuali dei seggi non in voto non sono dichiarati verificati. La particolarità del calendario Camera in Louisiana è esplicita. Il CSV storico completo è stato controllato localmente, senza importarlo nel database.

Le viste dell'edizione e i componenti comuni distinguono intenzioni di voto, probabilità, mercati e notizie. I grafici hanno tabelle alternative, le attribuzioni rifiutano URL non sicuri e gli estratti senza permesso non vengono mostrati. Revisione visiva desktop/mobile eseguita su homepage, edizione, sondaggi e metodo; nessun overflow di pagina o errore JavaScript rilevato. Typecheck, lint, build e **3 test browser** superati dall'agente; l'orchestratore ha rieseguito **47 test mirati** di provider, dominio, catalogo e presentazione. Il collegamento ai dati reali e l'amministrazione sono la consegna successiva, ancora in corso.

- Primo incremento: fondazioni locali dell'osservatorio, catalogo paese/sezione/edizione e navigazione `/` → `/usa` → `/usa/midterms` → `/usa/midterms/2026`.
- Nessuna fonte attiva, osservazione reale, previsione o scenario viene dichiarato disponibile prima della relativa verifica. Le prime pagine mostrano l'assenza di dati e lo stato di sviluppo.
- Domande previsionali candidate: controllo di Camera e Senato nell'edizione 2026. Le regole su seggi, indipendenti, vacanze e risoluzione devono essere formalizzate prima dell'attivazione del modello; le singole gare saranno catalogate nella fase 4 da fonti verificate.
- Termine preliminare conservativo per queste domande: `2026-11-03T00:00:00Z`, equivalente al 2 novembre 2026 alle 19:00 in `America/New_York`. È una scelta di prodotto precedente alla giornata elettorale, non l'orario ufficiale di chiusura dei seggi. Nessuna domanda previsionale viene attivata in questo incremento. Riferimento alla data elettorale: [FEC](https://www.fec.gov/help-candidates-and-committees/dates-and-deadlines/2026-reporting-dates/electioneering-communications-periods-general-election-2026/).
- Nessun impegno di pubblicazione prima del voto. L'edizione deve supportare anche un primo rilascio successivo, senza inventare uno storico previsionale.
- La [matrice delle fonti](SOURCES.md) distingue cataloghi, payload verificati e condizioni ancora da chiarire; nessuna raccolta continuativa è attiva. Un campione live VoteHub ha restituito 2 record generic ballot, 5 Ohio Senato e 4 Michigan Senato; due gare Camera non hanno restituito dati. È disponibile una fixture minima attribuita sotto la licenza CC BY 4.0 dichiarata dal provider. Questi campioni consentono l'implementazione del relativo adapter, senza dimostrare copertura nazionale o profondità storica per il modello.
- L'[audit del riferimento](REFERENCE_AUDIT.md) ha identificato lo ZIP a un commit preciso ed esaminato indice e testi selezionati senza eseguirli. Il materiale fornisce campi e casi limite, non dati già ammessi alla pubblicazione in Polls.

## Ambiente e dipendenze ancora aperte

| Elemento | Evidenza o limite |
|---|---|
| Repository | Repository autonomo già esistente; nessun codice preesistente all'avvio di questo incremento |
| Ambiente locale | Windows/PowerShell; controlli di progetto eseguiti con una copia locale di Node LTS, senza sostituire il runtime globale |
| Runtime di progetto | Node `24.22.1` LTS e pnpm `11.22.0`, fissati nel repository; dipendenze dirette esatte e lockfile versionato |
| Docker e PostgreSQL | Comandi Docker, Podman, psql e pg_ctl non trovati sul PATH; servizi e container non ancora verificati |
| Materiale di riferimento | Inventario e lettura limitata del [repository USA_midterm](https://github.com/analise2024/USA_midterm/tree/main) completati; dettagli in [REFERENCE_AUDIT.md](REFERENCE_AUDIT.md), nessuno script eseguito |
| VPS IONOS e Coolify | Piano VPS 4-4-120: 4 vCore, 4 GB RAM e 120 GB NVMe SSD dichiarati dall'utente; sistema operativo, risorse libere, servizi e collocazione di Coolify ancora da rilevare. Nessun accesso remoto eseguito |
| Dominio e DNS | Nome previsto `polls.simone.ooo`; configurazione non verificata e non modificata |
| Backup esterno | Destinazione e capacità non ancora confermate; nessuna prova di ripristino |
| Collegamento Coolify | GitHub App con webhook, indicata dall'utente; integrazione non configurata in questa fase |
| Build e registro | Luogo delle build e quote da confermare prima del rilascio; con 4 GB RAM occorre misurare il margine effettivo e valutare build esterna |

La fase 0 resta aperta per le voci mancanti. Prosegue il lavoro implementabile senza credenziali di produzione o accesso al VPS, con test isolati e revisione dell'orchestratore. I provider non ancora ammessi rimangono disabilitati; nessun dato o risultato di validazione viene inventato per aggirare una dipendenza mancante.

### Amministrazione e letture persistenti

Implementati autenticazione riservata, provisioning locale, controllo server del ruolo, audit, import con anteprima vincolata e scadenza, seed idempotente e registro delle fonti. Le query dell'osservatorio leggono revisioni, provenienza, errori e paginazione stabile. Typecheck, lint, 85 test ordinari e build locale superati; i nuovi test PostgreSQL attendono la CI di questo incremento. Le fonti rimangono disabilitate per impostazione predefinita.
