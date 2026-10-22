export type NewsCoverage = Readonly<{
  from: string;
  asOf: string;
  days: number;
  truncated: boolean;
  sourceChanges: number;
  rows: readonly Readonly<{
    sourceId: string;
    sourceName: string;
    topic: string | null;
    day: string;
    articles: number;
  }>[];
}>;
