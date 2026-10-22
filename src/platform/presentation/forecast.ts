export function forecastOutcomeLabel(outcomeId: string): string {
  if (outcomeId.startsWith("control:"))
    return `Controllo del caucus ${outcomeId.slice("control:".length)}`;
  if (outcomeId.startsWith("majority:"))
    return `Maggioranza dei seggi: ${outcomeId.slice("majority:".length)}`;
  if (outcomeId === "no_majority") return "Nessuna maggioranza";
  if (outcomeId === "unresolved") return "Esito non risolto";
  return outcomeId;
}

export function forecastQuestionLabel(definition: string): string {
  if (definition === "seat_majority") return "Maggioranza dei seggi";
  if (definition === "chamber_control") return "Controllo della camera";
  return definition;
}

export type PublishedForecastCard = Readonly<{
  questionId: string;
  definition: string;
  raceIds: readonly string[];
  chamber: "house" | "senate" | null;
  state: "current" | "frozen";
  modelStatus: "experimental" | "validated";
  publicationId: string;
  runId: string;
  runSequence: number;
  inputAsOf: string;
  publishedAt: string;
  cutoffAtPublication: string;
  cutoffVersion: number;
  modelVersion: string;
  parameterVersion: string;
  iterations: number;
  modeledRaces: number;
  racesWithLocalPolls: number;
  quality: "complete" | "incomplete";
  outcomes: readonly Readonly<{ id: string; probability: number }>[];
  raceOutcomes: readonly Readonly<{
    raceId: string;
    positivePartyId: string;
    negativePartyId: string;
    positiveProbability: number;
  }>[];
  partySeats: readonly Readonly<{
    id: string;
    mean: number;
    lower80: number;
    upper80: number;
  }>[];
  caucusSeats: readonly Readonly<{
    id: string;
    mean: number;
    lower80: number;
    upper80: number;
  }>[];
  sources: readonly Readonly<{
    id: string;
    name: string;
    attribution: string | null;
    revisions: number;
  }>[];
  sourcesTruncated: boolean;
  history: readonly Readonly<{
    publicationId: string;
    runSequence: number;
    inputAsOf: string;
    publishedAt: string;
    cutoffVersion: number;
    modelStatus: "experimental" | "validated";
    outcomes: readonly Readonly<{ id: string; probability: number }>[];
  }>[];
  historyTruncated: boolean;
}>;
