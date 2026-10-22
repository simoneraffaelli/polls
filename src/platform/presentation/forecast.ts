export function forecastOutcomeLabel(outcomeId: string): string {
  if (outcomeId.startsWith("control:"))
    return `Controllo del caucus ${outcomeId.slice("control:".length)}`;
  if (outcomeId.startsWith("majority:"))
    return `Maggioranza dei seggi: ${outcomeId.slice("majority:".length)}`;
  if (outcomeId === "no_majority") return "Nessuna maggioranza";
  if (outcomeId === "unresolved") return "Esito non risolto";
  return outcomeId;
}
