/** Display-ready values. Domain quantities must be labelled before reaching UI. */
export type Availability<T> =
  | Readonly<{ status: "ready"; value: T }>
  | Readonly<{ status: "empty" | "error" | "loading"; message: string }>;

export type MetricKind =
  | "vote_intention"
  | "model_probability"
  | "market_price"
  | "seat_count"
  | "news_count";

export type Metric = Readonly<{
  kind: MetricKind;
  label: string;
  valueText: string;
  detail: string;
}>;

export type Freshness = Readonly<{
  state: "current" | "stale" | "unavailable" | "error";
  acquiredAt: string | null;
}>;

export type SourceReference = Readonly<{
  name: string;
  url: string;
  acquiredAt: string | null;
  note?: string;
}>;

export type PollRow = Readonly<{
  id: string;
  pollster: string;
  subject: string;
  observedPeriod: string;
  population: string;
  sample: string | null;
  finding: string;
  source: SourceReference;
}>;

export type NewsItem = Readonly<{
  id: string;
  title: string;
  publishedAt: string | null;
  summary: string | null;
  excerptReusePermitted: boolean;
  source: SourceReference;
}>;

export type SeriesPoint = Readonly<{
  date: string;
  value: number;
  label: string;
}>;

export type DistributionItem = Readonly<{
  id: string;
  label: string;
  value: number;
  valueText: string;
}>;
