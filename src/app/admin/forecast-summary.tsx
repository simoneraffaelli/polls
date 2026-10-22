import type { AdminForecastRunSummary } from "@/infrastructure/auth/admin-forecast-repository";

function italianTime(value: string | null): string {
  return value
    ? `${new Date(value).toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" })} (ora italiana)`
    : "—";
}

const runStatus = {
  published: "Pubblicato",
  sealed_unpublished: "Registrato, non pubblicato",
  in_progress: "In corso",
} as const;

export function AdminForecastSummary({
  runs,
}: {
  runs: readonly AdminForecastRunSummary[];
}) {
  return (
    <section className="mt-10" aria-labelledby="admin-forecast-runs">
      <h2 id="admin-forecast-runs" className="text-2xl font-semibold">
        Run del modello
      </h2>
      <p className="mt-2 text-sm">
        Ultimi 50 run registrati. Un run completato può restare non pubblicato.
      </p>
      {runs.length === 0 ? (
        <p className="mt-4">Nessun run registrato.</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {runs.map((run) => (
            <li key={run.runId} className="rounded border p-4">
              <h3 className="font-semibold">{run.questionLabel}</h3>
              <p className="mt-1 text-sm">
                {runStatus[run.status]} ·{" "}
                {run.kind === "forecast"
                  ? "Pronostico"
                  : "Ricostruzione retrospettiva"}{" "}
                · qualità{" "}
                {run.qualityStatus === "complete" ? "completa" : "incompleta"} ·
                modello{" "}
                {run.modelStatus === "experimental"
                  ? "sperimentale"
                  : "validato"}
              </p>
              <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                <div>
                  <dt>Input fino a</dt>
                  <dd>{italianTime(run.inputAsOf)}</dd>
                </div>
                <div>
                  <dt>Completato</dt>
                  <dd>{italianTime(run.completedAt)}</dd>
                </div>
                <div>
                  <dt>Pubblicato</dt>
                  <dd>{italianTime(run.publishedAt)}</dd>
                </div>
              </dl>
              <p className="mt-3 break-all text-xs">
                Run #{run.runSequence} · {run.runId}
              </p>
              {run.publicationId && (
                <p className="break-all text-xs">
                  Pubblicazione: {run.publicationId}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
