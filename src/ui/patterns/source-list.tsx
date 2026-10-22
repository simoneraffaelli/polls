import type { ObservatorySourceSummary } from "@/platform/observatory/read-contracts";

const stateLabel = {
  current: "Aggiornata",
  stale: "Da aggiornare",
  paused: "In pausa",
  error: "Errore di acquisizione",
  unavailable: "Mai acquisita",
} as const;

function safeUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function SourceList({
  items,
}: {
  items: readonly ObservatorySourceSummary[];
}) {
  if (items.length === 0)
    return (
      <p className="section-intro">
        Nessuna fonte associata a questa edizione.
      </p>
    );
  return (
    <ul className="source-list">
      {items.map(({ source, family, observationCount }) => (
        <li key={`${source.id}:${family}`}>
          <div>
            <strong>{source.name}</strong>
            <span>
              {family === "articles"
                ? "Documenti istituzionali"
                : family === "polls"
                  ? "Sondaggi"
                  : "Mercati"}
            </span>
          </div>
          <p>
            <strong>{stateLabel[source.state.status]}</strong> ·{" "}
            {observationCount} osservazioni acquisite
          </p>
          {source.state.acquiredAt ? (
            <p>
              Ultima acquisizione:{" "}
              <time dateTime={source.state.acquiredAt}>
                {new Intl.DateTimeFormat("it-IT", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Europe/Rome",
                }).format(new Date(source.state.acquiredAt))}
              </time>
            </p>
          ) : null}
          {source.state.lastErrorCode ? (
            <p>Ultimo errore: {source.state.lastErrorCode}</p>
          ) : null}
          {source.excludedFromForecasts ? (
            <p>Esclusa dai nuovi calcoli; lo storico resta disponibile.</p>
          ) : null}
          {source.attribution ? (
            <p>Attribuzione: {source.attribution}</p>
          ) : null}
          {safeUrl(source.termsUrl) ? (
            <a
              href={safeUrl(source.termsUrl)!}
              rel="noopener noreferrer"
              target="_blank"
            >
              Condizioni della fonte
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
