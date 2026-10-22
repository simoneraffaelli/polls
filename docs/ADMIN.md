# Amministrazione locale

L'area `/admin` usa sessioni Better Auth e controlla il ruolo amministratore nel database a ogni richiesta. La registrazione pubblica è disabilitata. L'area richiede `BETTER_AUTH_SECRET` (almeno 32 caratteri), `BETTER_AUTH_URL` e le variabili PostgreSQL del runtime. `BETTER_AUTH_URL` deve essere l'origine HTTPS effettiva; HTTP è ammesso soltanto per `localhost` e `127.0.0.1` nei test locali. Non inserire segreti nel repository.

## Predisporre un account

Dopo la migrazione, eseguire `pnpm worker:build`, impostare `ADMIN_EMAIL`, `ADMIN_NAME` e `ADMIN_PASSWORD` nell'ambiente del processo e avviare `pnpm admin:provision` in un terminale locale fidato. La password non va passata come argomento della riga di comando o salvata in un file versionato. Il comando crea soltanto un account nuovo e la sua appartenenza amministrativa; se l'indirizzo esiste già si arresta senza promuoverlo. Il provisioning non è disponibile come endpoint web.

Per revocare l'accesso, eliminare la sessione o l'appartenenza amministrativa nel database attraverso una procedura operativa controllata. La verifica delle richieste successive legge entrambi dal database, quindi la revoca non attende la scadenza del cookie.

## Fonti e raccolte

La pagina consente di attivare o sospendere una fonte, correggere l'abilitazione del collegamento a una sezione, escludere una fonte dai futuri pronostici, consultare le esecuzioni recenti e chiedere un nuovo tentativo. Ogni scrittura richiede una sessione amministrativa viva, controllo dell'origine della richiesta e motivazione; le modifiche e i tentativi richiesti sono registrati nell'audit. Una fonte può essere attivata per raccolta HTTP solo se ha un adapter registrato. L'attivazione non cancella osservazioni o revisioni precedenti. La fonte di import manuale non avvia raccolte HTTP.

Un nuovo tentativo è accodato al worker: la risposta con l'ID del run conferma l'accodamento, non l'avvenuto salvataggio dei dati. Consultare lo stato del run e la quarantena per l'esito. Le fonti seed restano disabilitate finché un amministratore non le attiva consapevolmente.

## Import controllato

L'import web accetta soltanto sondaggi normalizzati per la fonte manuale, verso una sezione/edizione e un'eventuale gara esistenti e attivi. Il JSON contiene un array di osservazioni; il CSV contiene una colonna `record_json` per riga. I limiti sono 1 MB e 500 righe. L'anteprima verifica forma e provenienza e restituisce solo metadati ed errori limitati, senza pubblicare dati. Un'anteprima valida ha durata di 15 minuti. Il salvataggio richiede il medesimo contenuto e una motivazione: osservazioni, ricevuta del run, avanzamento del cursore e audit sono confermati nella stessa transazione. Un nuovo invio della stessa anteprima già completata restituisce la ricevuta senza duplicare dati.

L'import non crea una previsione pubblica e non sostituisce i dati già pubblicati. Ogni correzione alle osservazioni produce una nuova revisione. Le associazioni e le esclusioni amministrative valgono per future selezioni di input; i riferimenti dei run già sigillati restano immutabili.

L'area amministrativa permette anche di escludere o reincludere un singolo sondaggio dai futuri pronostici e di correggere il collegamento di un sondaggio a una gara della stessa edizione. Ogni azione richiede una motivazione, verifica lato server l'ambito e l'appartenenza amministrativa e registra una decisione append-only con audit. Le letture storiche rispettano il momento in cui un collegamento o una decisione sono stati registrati; i nuovi run rispettano anche l'ultima decisione amministrativa. Le revisioni dei dati e i riferimenti dei run già pubblicati non sono riscritti.
