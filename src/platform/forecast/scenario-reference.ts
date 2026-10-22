import type { EditionScope } from "../data/primitives";

/** Persistence supplies this only after reading a published, sealed run. */
export type PublishedRunSnapshotReference = Readonly<{
  publicationId: string;
  runId: string;
  questionId: string;
  scope: EditionScope;
  inputSnapshotHash: string;
  kind: "forecast" | "retrospective_reconstruction";
  status: "published" | "published_reconstruction";
  readState: "current" | "frozen";
  modelStatus: "experimental" | "validated";
}>;
