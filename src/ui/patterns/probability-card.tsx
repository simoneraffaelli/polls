import type { Availability } from "@/platform/presentation/models";
import { DataNotice } from "./data-notice";

export type ProbabilityDisplay = Readonly<{
  question: string;
  outcome: string;
  probabilityText: string;
  modelStatus: "experimental" | "validated";
  runId: string;
}>;

export function ProbabilityCard({
  state,
}: {
  state: Availability<ProbabilityDisplay>;
}) {
  return (
    <section
      className="metric-card probability-card"
      aria-label="Probabilità del modello"
    >
      <h3>Probabilità del modello</h3>
      {state.status === "ready" ? (
        <>
          <span className="eyebrow">
            {state.value.modelStatus === "experimental"
              ? "Modello sperimentale"
              : "Modello validato"}
          </span>
          <strong className="metric-value">
            {state.value.probabilityText}
          </strong>
          <p>
            {state.value.outcome} · {state.value.question}
          </p>
          <small>Run {state.value.runId}</small>
        </>
      ) : (
        <DataNotice state={state} />
      )}
    </section>
  );
}
