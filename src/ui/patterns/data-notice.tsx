import type { Availability } from "@/platform/presentation/models";

export function DataNotice({
  state,
}: {
  state: Exclude<Availability<never>, { status: "ready" }>;
}) {
  const title = {
    empty: "Nessun dato acquisito",
    error: "Dati temporaneamente non disponibili",
    loading: "Caricamento dei dati",
  }[state.status];
  return (
    <div
      className="data-notice"
      role={state.status === "error" ? "alert" : "status"}
    >
      <strong>{title}</strong>
      <p>{state.message}</p>
    </div>
  );
}
