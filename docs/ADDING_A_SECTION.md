# Aggiungere un paese e una sezione

Il catalogo distingue codice paese (`US`, `IT`), ID interno e slug pubblico (`usa`, `italy`). Le sezioni appartengono a un paese e le edizioni a una sezione; il medesimo slug locale in paesi diversi è ammesso.

1. Definire il modulo in `src/modules/<country>/<section>/` con regole proprie e registrazione nel catalogo di composition. Non introdurre una classe universale di elezione né importare gli interni di Midterms.
2. Definire paese, sezione, edizioni e viste con ID univoci. Usare gli helper del catalogo per URL, breadcrumb e canonici. Registrare i contenuti soltanto quando pronti: la presenza di un modulo vuoto non richiede una pagina pubblica.
3. Versionare catalogo delle gare, date, regole delle domande e termini. Il paese, l'edizione e gli esiti non si deducono dal nome pubblico o dalla posizione in un array.
4. Collegare fonti esistenti tramite binding oppure implementare un adapter per la famiglia necessaria, con condizioni e attribuzione documentate. Le acquisizioni possono essere condivise; le associazioni restano esplicite e isolate per edizione.
5. Riutilizzare persistenza, revisione, coda, amministrazione e componenti di presentazione. Le formule restano nel dominio, le query nei repository, le dipendenze concrete in composition. Le letture web non chiamano provider.
6. Per un modello nuovo definire snapshot, esiti, disponibilità temporale e criteri di validazione propri. Una baseline USA non è automaticamente appropriata a un sistema proporzionale o a una coalizione diversa.
7. Aggiungere fixture di isolamento: stesso slug sezione in due paesi, riferimenti incoerenti rifiutati, job/cursori distinti dove necessario, nessuna contaminazione di risultati o cache. Verificare anche secondo paese con il layout comune senza modificare componenti condivisi per colori/partiti locali.

I test del catalogo includono un secondo paese e viste con lo stesso slug ma responsabilità differenti. Le fixture non pubblicano una sezione Italia: `/italy` rimane indisponibile finché il modulo reale non è registrato.
