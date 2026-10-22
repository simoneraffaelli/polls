# Stato dell'implementazione

Aggiornato: 22 ottobre 2026. Specifica di riferimento: [piano di implementazione](IMPLEMENTATION_PLAN.md).

## Metodo di lavoro

L'orchestratore assegna attività circoscritte, revisiona le modifiche e richiede correzioni prima di accettare una consegna. Su richiesta dell'utente, i sottoagenti usano Sol con ragionamento Medium per ricerche e attività ben delimitate, High per implementazione e problemi complessi. Ogni incarico specifica file di competenza, risultato atteso e controlli. Si riutilizzano gli agenti già informati; le revisioni aggiuntive si concentrano sui rischi rimasti, senza duplicare indiscriminatamente analisi e test.

La preferenza per l'orchestratore è Astra High, da selezionare nella chat; questo documento non certifica il modello effettivamente in esecuzione e non cambia le impostazioni dell'app.

L'utente autorizza commit e push degli incrementi verificati. Il branch di questo incremento è `codex/implementation-foundations`; le PR saranno usate quando serve revisione umana o quando il contesto lo richiede. Il push di un branch di sviluppo non è un'autorizzazione al rilascio in produzione.

## Consegne e verifiche

| Blocco | Fasi del piano | Verifica necessaria | Stato |
|---|---|---|---|
| Specifica e dipendenze | 0 | Perimetro, evidenze sulle fonti, ambiente e lacune dichiarate | In corso |
| Fondazioni locali | 1 | Typecheck, lint, test mirati, build e avvio documentato; controlli container separati | Incremento locale verificato; collaudo container ancora da eseguire |
| Persistenza e contratti | 2 | Migrazioni, revisioni e isolamento su PostgreSQL reale | Non iniziato |
| Raccolta e fonti ammesse | 3–4 | Fixture, retry, cursori, idempotenza e pubblicazioni ordinate | Non iniziato |
| Interfaccia e osservatorio | 5–6 | Accessibilità, provenienza, stati reali e autorizzazioni amministrative | Non iniziato |
| Modello e scenari | 7–8 | Riproducibilità, valutazione temporale e limiti di calcolo | Non iniziato |
| Collaudo e rilascio | 9–10 | Carico, ripristino, sicurezza e verifiche dell'ambiente finale | Non iniziato |

I blocchi non costituiscono nuove autorizzazioni al rilascio. La fase 5 può procedere dopo le fondazioni secondo le dipendenze del piano. Lo stato di un blocco cambia soltanto sulla base di evidenze; una configurazione scritta non equivale a una verifica eseguita.

### Controlli del primo incremento

- Node `24.22.1`: typecheck, lint e formattazione superati. Verificata anche la rigenerazione di `next-env.d.ts` prima del typecheck.
- **14 test automatici superati**: 5 per il catalogo, 6 per la configurazione worker e 3 per i confini degli import. La revisione ha aggiunto controlli mirati su alias, import relativi, dominio e presentazione.
- Build del worker e build web standalone riuscite. Sviluppo e build web usano Webpack: Turbopack ha prodotto un errore interno nell'elaborazione CSS sul sistema Windows anche con Node LTS; la causa non è stata attribuita con certezza.
- **2 test Playwright superati** contro l'avvio standalone: navigazione, stato senza dati, breadcrumb, URL canonico, `noindex` e rotte escluse. L'esecuzione fuori dalla sandbox ha consentito le connessioni locali bloccate nell'ambiente ristretto.
- Collaudo visivo di homepage ed edizione 2026 a 1280 e 390 pixel: nessun overflow orizzontale o errore JavaScript di pagina; skip link visibile al primo Tab e funzionante con Invio. Screenshot locali esaminati, esclusi da Git.
- Avvio del worker con configurazione invalida verificato: uscita con codice 1 e messaggio generico senza password. Collegamenti interni della documentazione e controllo whitespace Git superati.
- Dockerfile, Compose e workflow CI sono predisposti; la verifica locale non certifica ancora l'esecuzione dei container o il risultato della CI remota. PostgreSQL non è stato avviato né usato dai test di questo incremento.

La revisione ha corretto riferimenti contraffatti o incoerenti negli helper del catalogo, confini degli import, codifica delle credenziali del worker, esclusione dei file locali e avvio standalone. La fase 1 nel suo insieme rimane aperta fino al collaudo dell'ambiente container; questo incremento verifica le fondazioni applicative indipendenti da quel collaudo.

## Fase 0: perimetro iniziale

- Primo incremento: fondazioni locali dell'osservatorio, catalogo paese/sezione/edizione e navigazione `/` → `/usa` → `/usa/midterms` → `/usa/midterms/2026`.
- Nessuna fonte attiva, osservazione reale, previsione o scenario viene dichiarato disponibile prima della relativa verifica. Le prime pagine mostrano l'assenza di dati e lo stato di sviluppo.
- Domande previsionali candidate: controllo di Camera e Senato nell'edizione 2026. Le regole su seggi, indipendenti, vacanze e risoluzione devono essere formalizzate prima dell'attivazione del modello; le singole gare saranno catalogate nella fase 4 da fonti verificate.
- Termine preliminare conservativo per queste domande: `2026-11-03T00:00:00Z`, equivalente al 2 novembre 2026 alle 19:00 in `America/New_York`. È una scelta di prodotto precedente alla giornata elettorale, non l'orario ufficiale di chiusura dei seggi. Nessuna domanda previsionale viene attivata in questo incremento. Riferimento alla data elettorale: [FEC](https://www.fec.gov/help-candidates-and-committees/dates-and-deadlines/2026-reporting-dates/electioneering-communications-periods-general-election-2026/).
- Nessun impegno di pubblicazione prima del voto. L'edizione deve supportare anche un primo rilascio successivo, senza inventare uno storico previsionale.
- La [matrice delle fonti](SOURCES.md) distingue cataloghi disponibili, payload effettivamente verificati e condizioni ancora da chiarire; nessuna fonte è attiva. Il catalogo VoteHub mostra categorie di gare 2026, ma quantità e profondità storica dei sondaggi restano da misurare. Dati non sufficienti o condizioni non chiarite impediscono l'attivazione di quella fonte, non il lavoro locale indipendente dai provider.
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

La fase 0 resta aperta per le voci mancanti. Possono avanzare soltanto le fondazioni locali che non dipendono da provider, segreti o capacità del VPS, dopo revisione dell'orchestratore. Questa limitazione rende esplicito il lavoro indipendente consentito dal piano, senza considerare superati i requisiti delle fasi successive.
