# Copertura delle notizie e futura analisi

La prima versione conta articoli distinti per prima acquisizione, giorno UTC, fonte e argomento assegnato. Le rettifiche non sono nuovi articoli; le fonti sospese conservano lo storico. La finestra pubblica è di 14 giorni, con massimo 31 nel repository e 1.000 combinazioni visualizzate. Un limite raggiunto viene dichiarato. Le categorie rappresentano la classificazione attuale, non una tassonomia storica ricostruita.

Il conteggio dei cambi di attivazione delle fonti e delle associazioni, ricavato dall'audit, accompagna i volumi. È un avvertimento sulla composizione del campione, non una correzione statistica automatica. Giorni senza acquisizioni possono derivare da indisponibilità o assenza di raccolta; non vengono interpretati come assenza di notizie. Il feed Fed ammesso contiene contesto economico istituzionale e non rappresenta una copertura della campagna elettorale. Gli argomenti non assegnati restano dichiarati tali.

## Decisione sul tono

Non è disponibile un campione annotato con soggetto, lingua e accordo fra valutatori sufficiente a valutare un classificatore locale. Il tono è quindi disabilitato. Non si applica un dizionario generico ai titoli e non si convertono i volumi in intenzioni di voto. Questa limitazione non viene compensata con contenuti dimostrativi.

## Punto di estensione IA

Un'eventuale analisi testuale futura sarà un adapter separato eseguito nel worker, dopo ingestione e autorizzazione dei diritti di uso. Riceverà soltanto revisioni identificate e contenuti utilizzabili; restituirà un'annotazione versionata con soggetto, metodo, confidenza e motivo di astensione. L'annotazione non cambierà il testo sorgente né i run già pubblicati. Serviranno un contratto runtime, budget, valutazione su campione separato e una decisione esplicita prima di usarla nel prodotto o nel modello.

Questa è una descrizione del confine futuro: non sono presenti SDK, credenziali, prompt o chiamate a servizi IA esterni.
