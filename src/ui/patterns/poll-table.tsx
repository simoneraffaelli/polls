import type { Availability, PollRow } from "@/platform/presentation/models";
import { DataNotice } from "./data-notice";
import { SourceAttribution } from "./source-attribution";

export function PollTable({
  state,
}: {
  state: Availability<readonly PollRow[]>;
}) {
  if (state.status !== "ready") return <DataNotice state={state} />;
  if (state.value.length === 0) {
    return (
      <DataNotice
        state={{
          status: "empty",
          message: "Non sono stati acquisiti sondaggi per questa edizione.",
        }}
      />
    );
  }
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Tabella dei sondaggi"
    >
      <table className="data-table">
        <caption>Sondaggi acquisiti, con campione, periodo e fonte</caption>
        <thead>
          <tr>
            <th scope="col">Studio</th>
            <th scope="col">Periodo</th>
            <th scope="col">Campione</th>
            <th scope="col">Risultato</th>
            <th scope="col">Provenienza</th>
          </tr>
        </thead>
        <tbody>
          {state.value.map((poll) => (
            <tr key={poll.id}>
              <th scope="row">
                <strong>{poll.pollster}</strong>
                <span>{poll.subject}</span>
              </th>
              <td>{poll.observedPeriod}</td>
              <td>
                {poll.population}
                {poll.sample ? <span>{poll.sample}</span> : null}
              </td>
              <td>{poll.finding}</td>
              <td>
                <SourceAttribution source={poll.source} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
