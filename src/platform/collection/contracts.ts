import type { EditionScope } from "../data/primitives";

export type SourceFamily = "polls" | "markets" | "articles";

/** A persisted run represents exactly one provider page, including retries of that page. */
export interface CollectionRun {
  sourceId: string;
  runId: string;
  cursorBefore: string | null;
  cursorGenerationBefore: number;
}

export interface SourcePage<T> {
  observations: readonly T[];
  quarantined: readonly {
    externalId: string | null;
    contentHash: string;
    reasonCode: string;
  }[];
  nextCursor: string | null;
  hasMore: boolean;
  /** Response body received, before normalization; not the run start time. */
  acquiredAt: string;
}

export interface SourceAdapter<T> {
  readonly family: SourceFamily;
  readonly parserVersion: string;
  fetchPage(input: {
    cursor: string | null;
    signal: AbortSignal;
    sourceId: string;
    runId: string;
  }): Promise<SourcePage<T>>;
}

export interface CollectionDestination {
  scope: EditionScope;
  raceId: string | null;
}

export interface CollectionPageStore<T> {
  /** A completed run is returned without fetching again after a lost worker acknowledgement. */
  readCommittedPage(run: CollectionRun): Promise<CollectionResult | null>;
  /** Save observations, receipt, cursor CAS and run success in one transaction. */
  commitPage(input: {
    run: CollectionRun;
    page: SourcePage<T>;
    destinations: readonly CollectionDestination[];
  }): Promise<{ saved: number; repeated: boolean; quarantinedCount: number }>;
}

export type CollectionResult = {
  saved: number;
  repeated: boolean;
  quarantinedCount: number;
  nextCursor: string | null;
  hasMore: boolean;
};
