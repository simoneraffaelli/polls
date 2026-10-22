# Backup e prova di ripristino

Stato: strumenti e procedura preparati, nessun backup esterno né ripristino operativo eseguito. Destinazione, capacità e credenziali restano da configurare fuori da Git. Obiettivi proposti: RPO 24 ore, RTO 4 ore; devono essere misurati sul volume reale.

## Copia esterna cifrata

Lo script `scripts/operations/backup.sh` richiede Bash, Docker Compose e restic sul sistema di gestione. Restic cifra il dump prima di salvarlo nel repository remoto. Configurare `RESTIC_REPOSITORY` per una destinazione esterna SFTP, S3 compatibile o altro backend supportato e `RESTIC_PASSWORD_FILE` per un file protetto fuori dal checkout. Scegliere una destinazione realmente disponibile; nessun servizio a pagamento viene attivato dal progetto. Inizializzare il repository restic solo dopo aver verificato destinazione e credenziali.

Il dump PostgreSQL custom viene inviato in streaming, senza creare una copia in chiaro sul disco. `--stdin-from-command` permette a restic di controllare l'esito di pg_dump e non pubblicare uno snapshot se il dump fallisce, come descritto nella [documentazione del backup](https://restic.readthedocs.io/en/stable/040_backup.html#reading-data-from-a-command). Il comando verifica anche la struttura del repository; una verifica dei dati completa richiede periodicamente `restic check --read-data` e la prova di restore. Pianificare il comando giornaliero sul sistema operativo o in Coolify, impedire sovrapposizioni fra esecuzioni e controllarne gli errori. Una copia sul disco del VPS non è accettata come backup esterno.

Conservazione iniziale proposta: 7 giornalieri e 4 settimanali per questo database. Dopo la prima prova riuscita, verificare l'elenco e applicare esplicitamente `restic forget --tag polls --keep-daily 7 --keep-weekly 4 --prune`. Il comando elimina snapshot e dati non più referenziati: usarlo soltanto sul repository corretto e mantenere copie sufficienti a rilevare corruzioni tardive.

## Restore isolato

Eseguire `bash scripts/operations/restore-check.sh ID_SNAPSHOT` indicando un ID immutabile restituito da restic. Lo script crea un PostgreSQL temporaneo senza rete né volumi del servizio, ripristina schema e dati con controllo degli errori e legge le principali tabelle. Rimuove solo il container temporaneo creato dal comando. Il limite tmpfs iniziale di 2 GiB è adatto alle prove iniziali: per dataset maggiori preparare un volume di test dedicato, mai quello di produzione.

Registrare data, ID snapshot, versione applicativa, dimensione, durata, conteggi verificati e risultato. Controllare a campione revisioni, input e risultati congelati, sessioni e audit. Il solo successo di `pg_restore` non prova che siano disponibili DNS, segreti, immagini o configurazione Coolify: mantenerne un inventario cifrato separato e provarne il recupero. I backup possono contenere credenziali hash e sessioni: limitarne accesso e conservazione, revocare le sessioni dopo un recupero reale.

La procedura di recupero in produzione richiede un database nuovo e isolato, restore verificato, segreti ripristinati e versioni applicative compatibili. Non sovrascrivere il database corrente durante una prova. Eseguire il passaggio di connessione soltanto dopo i controlli, conservando la precedente istanza per il tempo stabilito dal piano di recupero.
