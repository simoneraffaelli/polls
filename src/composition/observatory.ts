import { readObservatoryArticlePage } from "@/infrastructure/database/article-repository";
import {
  readObservatoryPollPage,
  readObservatorySources,
  readPollRevisionHistory,
} from "@/infrastructure/database/observatory-repository";
import { getRuntimeDatabase } from "@/infrastructure/database/runtime";
import type {
  ObservatoryArticle,
  ObservatoryPage,
  ObservatoryPoll,
  ObservatorySourceSummary,
  PollReadInput,
  PollRevisionHistoryEntry,
} from "@/platform/observatory/read-contracts";
import {
  utcInstantSchema,
  type EditionScope,
} from "@/platform/data/primitives";

const staleAfterMinutes = 48 * 60;

export type PublicRead<T> =
  | Readonly<{ status: "ready"; value: T }>
  | Readonly<{ status: "unconfigured" | "error"; message: string }>;

export function parsePublicAsOf(value: string | undefined): string | null {
  if (value === undefined) return new Date().toISOString();
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
    !utcInstantSchema.safeParse(value).success
  )
    return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time > Date.now()) return null;
  return new Date(time).toISOString();
}

export function parsePublicOffset(value: string | undefined): number | null {
  if (value === undefined) return 0;
  if (!/^(?:0|[1-9]\d{0,4})$/.test(value)) return null;
  const offset = Number(value);
  return offset <= 10_000 ? offset : null;
}

async function read<T>(
  run: (
    db: NonNullable<ReturnType<typeof getRuntimeDatabase>>["db"],
  ) => Promise<T>,
): Promise<PublicRead<T>> {
  try {
    const database = getRuntimeDatabase();
    if (!database)
      return {
        status: "unconfigured",
        message: "Archivio non configurato in questo ambiente.",
      };
    return { status: "ready", value: await run(database.db) };
  } catch {
    return {
      status: "error",
      message:
        "Archivio temporaneamente non raggiungibile. I dati non sono stati sostituiti con valori stimati.",
    };
  }
}

export function readPublicPolls(
  input: PollReadInput,
): Promise<PublicRead<ObservatoryPage<ObservatoryPoll>>> {
  return read((db) => readObservatoryPollPage(db, input));
}

export function readPublicArticles(
  scope: EditionScope,
  asOf: string,
  offset = 0,
  limit = 20,
): Promise<PublicRead<ObservatoryPage<ObservatoryArticle>>> {
  return read((db) =>
    readObservatoryArticlePage(db, {
      scope,
      asOf,
      offset,
      limit,
      staleAfterMinutes,
    }),
  );
}

export function readPublicSources(
  scope: EditionScope,
  asOf: string,
): Promise<PublicRead<ObservatoryPage<ObservatorySourceSummary>>> {
  return read((db) =>
    readObservatorySources(db, { scope, asOf, limit: 100, staleAfterMinutes }),
  );
}

export function readPublicPollHistory(
  scope: EditionScope,
  pollId: string,
  asOf: string,
  offset = 0,
): Promise<PublicRead<ObservatoryPage<PollRevisionHistoryEntry>>> {
  return read((db) =>
    readPollRevisionHistory(db, {
      scope,
      pollId,
      asOf,
      offset,
      limit: 25,
      staleAfterMinutes,
    }),
  );
}

export const publicPollFreshnessMinutes = staleAfterMinutes;
