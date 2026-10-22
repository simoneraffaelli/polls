import type { NewsCoverage as Coverage } from "@/platform/observatory/news-coverage";

export function NewsCoverage({ coverage }: { coverage: Coverage }) {
  return (
    <section className="content-section" aria-labelledby="news-coverage-title">
      <h2 id="news-coverage-title" className="section-heading">
        Copertura raccolta
      </h2>
      <p>
        Prime acquisizioni negli ultimi {coverage.days} giorni, per fonte e
        argomento assegnato. Le rettifiche non aumentano il conteggio. Questi
        volumi descrivono il nostro archivio: non misurano il tono delle notizie
        o l&apos;opinione degli elettori.
      </p>
      <p>
        Cambi di attivazione delle fonti o delle loro associazioni nel periodo:{" "}
        {coverage.sourceChanges}. Possono modificare il volume osservato. Una
        giornata senza acquisizioni non prova assenza di notizie.
      </p>
      {coverage.rows.length ? (
        <div className="table-scroll">
          <table>
            <caption>
              Acquisizioni per giorno UTC; argomenti secondo la classificazione
              attuale
            </caption>
            <thead>
              <tr>
                <th scope="col">Giorno</th>
                <th scope="col">Fonte</th>
                <th scope="col">Argomento</th>
                <th scope="col">Articoli</th>
              </tr>
            </thead>
            <tbody>
              {coverage.rows.map((row) => (
                <tr key={`${row.sourceId}:${row.day}:${row.topic ?? ""}`}>
                  <td>{row.day}</td>
                  <td>{row.sourceName}</td>
                  <td>{row.topic ?? "Non classificato"}</td>
                  <td>{row.articles}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Nessuna prima acquisizione nel periodo selezionato.</p>
      )}
      {coverage.truncated ? (
        <p>
          Vista limitata alle prime 1.000 combinazioni; non rappresenta il
          totale completo.
        </p>
      ) : null}
    </section>
  );
}
