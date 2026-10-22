# Polls

Hub di pronostici, sondaggi e notizie, pensato per mostrare come cambiano nel tempo le aspettative sui principali eventi elettorali.

Il sito previsto è **[polls.simone.ooo](https://polls.simone.ooo)**. La prima sezione sarà dedicata alle midterm statunitensi; seguiranno altri paesi ed eventi.

## Organizzazione

- `/` — homepage dell'hub.
- `/usa` — pagina paese USA.
- `/usa/midterms` — sezione Midterms.
- `/usa/midterms/2026` — edizione 2026.
- `/italy` — futura pagina paese Italia, con proprie sezioni.

Paesi, sezioni, edizioni e competizioni hanno identità distinte. Componenti, raccolta dati e infrastruttura sono condivisi; regole elettorali e modelli previsionali appartengono ai singoli moduli.

## Stack previsto

Next.js, React e TypeScript; worker Node.js nello stesso repository; PostgreSQL con Drizzle e pg-boss. Distribuzione tramite Docker Compose e Coolify sul server IONOS.

Le fonti iniziali previste includono Polymarket, VoteHub e RSS selezionati, con accesso gratuito e condizioni d'uso da verificare per i dati utilizzati. Sondaggi, previsioni del modello, prezzi dei mercati e tono delle notizie saranno presentati come misure distinte. L'IA esterna resta rinviata.

## Stato e documentazione

Il repository contiene le fondamenta documentali; **l'applicazione non è ancora implementata o distribuita**. Non sono ancora disponibili comandi di avvio o test applicativi.

- [Piano di implementazione](docs/IMPLEMENTATION_PLAN.md): architettura, fasi, criteri di completamento, fonti, verifiche, costi e distribuzione.
- [Istruzioni per gli agenti](AGENTS.md): regole di sviluppo e vincoli del progetto.

Il primo passo è la fase 0 del piano: definizione operativa, verifica delle fonti e dell'ambiente di destinazione.
