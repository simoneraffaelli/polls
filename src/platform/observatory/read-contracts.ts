import type { EditionScope } from "../data/primitives";

export type SourceState = Readonly<{
  status: "current" | "stale" | "paused" | "error" | "unavailable";
  acquiredAt: string | null;
  lastErrorCode: string | null;
}>;

export type ObservatorySource = Readonly<{
  id: string;
  name: string;
  attribution: string | null;
  termsUrl: string | null;
  excludedFromForecasts: boolean;
  /** This policy affects future model runs, never archived observations/publications. */
  forecastExclusionReason: "source_excluded_from_future_forecasts" | null;
  state: SourceState;
}>;

export type ObservatorySourceSummary = Readonly<{
  source: ObservatorySource;
  family: "polls" | "articles" | "markets";
  observationCount: number;
}>;

export type ObservatoryPoll = Readonly<{
  pollId: string;
  revisionId: string;
  revisionNo: number;
  raceId: string | null;
  pollster: string;
  sponsors: readonly string[];
  fieldworkStart: string;
  fieldworkEnd: string;
  declaredPublication: string | null;
  acquiredAt: string;
  sourceUrl: string;
  source: ObservatorySource;
  questions: readonly Readonly<{
    id: string;
    wording: string | null;
    kind: string;
    populationKind: string;
    populationDescription: string;
    sampleGroupId: string;
    sampleSize: number | null;
    options: readonly Readonly<{
      id: string;
      label: string;
      percentage: number;
    }>[];
  }>[];
}>;

export type PollRevisionHistoryEntry = Readonly<{
  pollId: string;
  revisionId: string;
  revisionNo: number;
  supersedesRevisionId: string | null;
  sourceRevision: string | null;
  contentHash: string;
  parserVersion: string;
  acquiredAt: string;
  fieldworkStart: string;
  fieldworkEnd: string;
}>;

export type ObservatoryArticle = Readonly<{
  articleId: string;
  revisionId: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: string | null;
  acquiredAt: string;
  excerpt: string | null;
  excerptReusePermitted: boolean;
  source: ObservatorySource;
}>;

export type ObservatoryReadInput = Readonly<{
  scope: EditionScope;
  /** Bounded to 1–100; invalid limits are rejected. */
  limit: number;
  asOf: string;
  staleAfterMinutes: number;
  /** Bounded to 0–10,000; keep `asOf` fixed between pages. */
  offset?: number;
}>;

export type PollReadInput = ObservatoryReadInput &
  Readonly<{
    /** undefined = every race, null = only national, UUID = selected race. */
    raceId?: string | null;
    sourceId?: string;
    populationKind?: string;
    fromDate?: string;
    toDate?: string;
  }>;

export type ObservatoryPage<T> = Readonly<{
  items: readonly T[];
  hasMore: boolean;
  /** True when the documented offset cap prevents another page. */
  truncated: boolean;
  nextOffset: number | null;
}>;
