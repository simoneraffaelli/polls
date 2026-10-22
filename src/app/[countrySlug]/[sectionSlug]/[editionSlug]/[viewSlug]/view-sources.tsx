import { SourceList } from "@/ui/patterns/source-list";
import { DataNotice } from "@/ui/patterns/data-notice";
import type { SourcesRead } from "./view-shared";

export function SourcesView({ sources }: { sources: SourcesRead }) {
  return (
    <section className="content-section" aria-labelledby="sources-title">
      <h2 className="section-heading" id="sources-title">
        Fonti e metodo
      </h2>
      <p className="section-intro">
        Una fonte configurata può essere in pausa, in errore o non ancora
        acquisita. La sospensione non cancella lo storico. Le fonti tecniche non
        associate all’edizione non appaiono come dati osservati.
      </p>
      {sources.status === "ready" ? (
        <SourceList items={sources.value.items} />
      ) : (
        <DataNotice
          state={{
            status: sources.status === "error" ? "error" : "empty",
            message: sources.message,
          }}
        />
      )}
      <div className="method-grid">
        <article>
          <span className="eyebrow">Misure</span>
          <h3>Significati distinti</h3>
          <p>
            Sondaggi in percentuali, probabilità del modello e prezzi di mercato
            sono misure differenti. Non vengono convertite implicitamente.
          </p>
        </article>
        <article>
          <span className="eyebrow">Modello</span>
          <h3>Baseline sperimentale</h3>
          <p>
            Il motore richiede gare, regole e input verificati. Non esiste oggi
            una previsione validata o un punteggio di accuratezza dimostrato.
          </p>
        </article>
        <article>
          <span className="eyebrow">Storico</span>
          <h3>Revisioni conservate</h3>
          <p>
            Le correzioni producono nuove revisioni e non modificano gli input
            già usati in un run pubblicato.
          </p>
        </article>
      </div>
    </section>
  );
}
