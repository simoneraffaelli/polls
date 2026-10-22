import Link from "next/link";
import type { Availability } from "@/platform/presentation/models";
import {
  forecastOutcomeLabel,
  forecastQuestionLabel,
  type PublishedForecastCard,
} from "@/platform/presentation/forecast";
import { DataNotice } from "./data-notice";

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Rome",
  }).format(new Date(value));

function Seats({
  title,
  rows,
}: {
  title: string;
  rows: PublishedForecastCard["partySeats"];
}) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <caption>{title} · intervallo centrale simulato all’80%</caption>
        <thead>
          <tr>
            <th scope="col">Gruppo</th>
            <th scope="col">Media seggi</th>
            <th scope="col">Intervallo 80%</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 10).map((row) => (
            <tr key={row.id}>
              <th scope="row">{row.id}</th>
              <td>{row.mean.toFixed(1)}</td>
              <td>
                {row.lower80}–{row.upper80}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RaceProbability({
  card,
  raceId,
}: {
  card: PublishedForecastCard;
  raceId: string;
}) {
  const race = card.raceOutcomes.find((item) => item.raceId === raceId);
  if (!race) return null;
  return (
    <p>
      Probabilità del modello per questa gara: {race.positivePartyId}{" "}
      {(race.positiveProbability * 100).toFixed(1)}%, {race.negativePartyId}{" "}
      {((1 - race.positiveProbability) * 100).toFixed(1)}%.
    </p>
  );
}

export function PublishedForecastList({
  state,
  scenarioPath,
  raceId,
}: {
  state: Availability<readonly PublishedForecastCard[]>;
  scenarioPath: string;
  raceId?: string;
}) {
  if (state.status !== "ready") return <DataNotice state={state} />;
  if (state.value.length === 0)
    return (
      <DataNotice
        state={{
          status: "empty",
          message:
            "Nessuna previsione sigillata e pubblicata per questo perimetro.",
        }}
      />
    );
  return (
    <div className="forecast-list">
      {state.value.map((card) => (
        <article className="content-section" key={card.questionId}>
          <h3>{forecastQuestionLabel(card.definition)}</h3>
          <p>
            {card.state === "frozen"
              ? "Previsione congelata"
              : "Previsione corrente"}
            {" · Modello "}
            {card.modelStatus === "experimental" ? "sperimentale" : "validato"}
            {" · Run "}
            {card.runSequence}
          </p>
          <dl className="facts-list">
            <div>
              <dt>Pubblicato</dt>
              <dd>
                <time dateTime={card.publishedAt}>
                  {dateTime(card.publishedAt)}
                </time>
              </dd>
            </div>
            <div>
              <dt>Input disponibili fino a</dt>
              <dd>
                <time dateTime={card.inputAsOf}>
                  {dateTime(card.inputAsOf)}
                </time>
              </dd>
            </div>
            <div>
              <dt>Termine registrato alla pubblicazione</dt>
              <dd>
                <time dateTime={card.cutoffAtPublication}>
                  {dateTime(card.cutoffAtPublication)}
                </time>{" "}
                · versione {card.cutoffVersion}
              </dd>
            </div>
            <div>
              <dt>Metodo</dt>
              <dd>
                {card.modelVersion} · parametri {card.parameterVersion} ·{" "}
                {card.iterations.toLocaleString("it-IT")} simulazioni
              </dd>
            </div>
            <div>
              <dt>Copertura</dt>
              <dd>
                {card.modeledRaces} gare simulate, {card.racesWithLocalPolls}{" "}
                con sondaggi locali
              </dd>
            </div>
          </dl>
          {raceId ? <RaceProbability card={card} raceId={raceId} /> : null}
          {card.outcomes.length > 0 ? (
            <div>
              <h4>Probabilità degli esiti</h4>
              <ul>
                {card.outcomes.map((outcome) => (
                  <li key={outcome.id}>
                    {forecastOutcomeLabel(outcome.id)}:{" "}
                    {(outcome.probability * 100).toFixed(1)}% · probabilità del
                    modello
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p>
              Nessuna probabilità di controllo pubblicabile per la copertura
              disponibile.
            </p>
          )}
          {card.quality === "complete" ? (
            <>
              {card.partySeats.length > 0 ? (
                <Seats
                  title="Distribuzione seggi per partito"
                  rows={card.partySeats}
                />
              ) : null}
              {card.caucusSeats.length > 0 ? (
                <Seats
                  title="Distribuzione seggi per caucus"
                  rows={card.caucusSeats}
                />
              ) : null}
              {card.partySeats.length > 10 || card.caucusSeats.length > 10 ? (
                <p>
                  Le tabelle mostrano i primi dieci gruppi; il run completo
                  resta identificato.
                </p>
              ) : null}
            </>
          ) : (
            <p>
              Distribuzione completa dei seggi indisponibile per copertura
              insufficiente.
            </p>
          )}
          <h4>Provenienza degli input</h4>
          {card.sources.length > 0 ? (
            <ul>
              {card.sources.map((source) => (
                <li key={source.id}>
                  {source.name}
                  {source.attribution ? ` · ${source.attribution}` : ""} ·{" "}
                  {source.revisions} revisioni usate
                </li>
              ))}
            </ul>
          ) : (
            <p>Nessuna revisione sorgente collegata al run.</p>
          )}
          {card.sourcesTruncated ? (
            <p>Elenco fonti limitato alle prime venti.</p>
          ) : null}
          <details>
            <summary>Cronologia delle pubblicazioni</summary>
            <ol>
              {card.history.map((item) => (
                <li key={item.publicationId}>
                  Run {item.runSequence}
                  {item.publicationId === card.publicationId
                    ? " · pubblicazione selezionata"
                    : ""}{" "}
                  · pubblicato{" "}
                  <time dateTime={item.publishedAt}>
                    {dateTime(item.publishedAt)}
                  </time>{" "}
                  · input{" "}
                  <time dateTime={item.inputAsOf}>
                    {dateTime(item.inputAsOf)}
                  </time>{" "}
                  ·{" "}
                  {item.modelStatus === "experimental"
                    ? "sperimentale"
                    : "validato"}
                  {item.outcomes.length > 0 ? (
                    <ul>
                      {item.outcomes.map((outcome) => (
                        <li key={outcome.id}>
                          {forecastOutcomeLabel(outcome.id)}:{" "}
                          {(outcome.probability * 100).toFixed(1)}% ·
                          probabilità del modello
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>Nessuna probabilità registrata per questo run.</p>
                  )}
                </li>
              ))}
            </ol>
            {card.historyTruncated ? (
              <p>Cronologia limitata alle dieci pubblicazioni più recenti.</p>
            ) : null}
          </details>
          <Link href={`${scenarioPath}?question=${card.questionId}`}>
            Apri run e scenari
          </Link>
        </article>
      ))}
    </div>
  );
}
