import type { Availability, Metric } from "@/platform/presentation/models";
import { DataNotice } from "./data-notice";

const kindLabel = {
  vote_intention: "Intenzione di voto",
  model_probability: "Probabilità del modello",
  market_price: "Prezzo di mercato",
  seat_count: "Seggi",
  news_count: "Notizie",
} as const;

export function MetricCard({
  title,
  state,
}: {
  title: string;
  state: Availability<Metric>;
}) {
  return (
    <section className="metric-card" aria-label={title}>
      <h3>{title}</h3>
      {state.status === "ready" ? (
        <>
          <span className="eyebrow">{kindLabel[state.value.kind]}</span>
          <strong className="metric-value">{state.value.valueText}</strong>
          <p>
            {state.value.label} · {state.value.detail}
          </p>
        </>
      ) : (
        <DataNotice state={state} />
      )}
    </section>
  );
}
