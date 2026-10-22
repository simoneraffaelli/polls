import { readObservatoryArticlePage } from "@/infrastructure/database/article-repository";
import { readNewsCoverage } from "@/infrastructure/database/news-coverage-repository";
import {
  listPublishedModelQuestions,
  readPublishedModel,
} from "@/infrastructure/database/published-model";
import {
  readPublicPublicationHistory,
  readPublishedInputSources,
} from "@/infrastructure/database/publication-history-read";
import {
  HOUSE_2026_RACES,
  SENATE_2026_RACES,
} from "@/modules/usa/midterms/catalog-2026";
import { stableCatalogUuid } from "@/composition/sources";
import type { PublishedForecastCard } from "@/platform/presentation/forecast";
import {
  readObservatoryPollPage,
  readObservatorySources,
  readPollEditorialHistory,
  readPollRevisionHistory,
} from "@/infrastructure/database/observatory-repository";
import { getRuntimeDatabase } from "@/infrastructure/database/runtime";
import type {
  ObservatoryArticle,
  ObservatoryPage,
  ObservatoryPoll,
  ObservatorySourceSummary,
  PollReadInput,
  PollEditorialHistoryEntry,
  PollRevisionHistoryEntry,
} from "@/platform/observatory/read-contracts";
import type { NewsCoverage } from "@/platform/observatory/news-coverage";
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

export function readPublicPollEditorialHistory(
  scope: EditionScope,
  pollId: string,
  asOf: string,
): Promise<PublicRead<ObservatoryPage<PollEditorialHistoryEntry>>> {
  return read((db) =>
    readPollEditorialHistory(db, {
      scope,
      pollId,
      asOf,
      limit: 100,
      staleAfterMinutes,
    }),
  );
}

export function readPublicNewsCoverage(
  scope: EditionScope,
  asOf: string,
): Promise<PublicRead<NewsCoverage>> {
  return read((db) => readNewsCoverage(db, { scope, asOf, days: 14 }));
}

export function readPublicModelQuestions(scope: EditionScope) {
  return read((db) => listPublishedModelQuestions(db, { scope, limit: 20 }));
}

export function readPublicPublishedModel(
  scope: EditionScope,
  questionId: string,
) {
  return read((db) => readPublishedModel(db, { scope, questionId }));
}

const houseRaceIds = new Set(
  HOUSE_2026_RACES.map((race) => stableCatalogUuid(race.id)),
);
const senateRaceIds = new Set(
  SENATE_2026_RACES.map((race) => stableCatalogUuid(race.id)),
);

export function readPublicForecastCards(
  scope: EditionScope,
): Promise<PublicRead<readonly PublishedForecastCard[]>> {
  return read(async (db) => {
    const questions = await listPublishedModelQuestions(db, {
      scope,
      limit: 20,
    });
    return Promise.all(
      questions.map(async (question): Promise<PublishedForecastCard> => {
        const model = await readPublishedModel(db, {
          scope,
          questionId: question.questionId,
        });
        if (!model) throw new Error("Published model disappeared during read");
        const [history, sources] = await Promise.all([
          readPublicPublicationHistory(db, {
            scope,
            questionId: question.questionId,
            limit: 10,
          }),
          readPublishedInputSources(db, {
            scope,
            runId: model.publication.runId,
          }),
        ]);
        const raceIds = model.snapshot.races.map((race) => race.raceId);
        const chamber = raceIds.every((id) => houseRaceIds.has(id))
          ? "house"
          : raceIds.every((id) => senateRaceIds.has(id))
            ? "senate"
            : null;
        return {
          questionId: question.questionId,
          definition: question.outcomeDefinition,
          raceIds,
          chamber,
          state: model.publication.state,
          modelStatus: model.proof.modelStatus,
          publicationId: model.publication.publicationId,
          runId: model.publication.runId,
          runSequence: model.publication.runSequence,
          inputAsOf: model.publication.inputAsOf,
          publishedAt: model.publication.publishedAt,
          cutoffAtPublication: model.publication.cutoffAtPublication,
          cutoffVersion: model.publication.cutoffVersion,
          modelVersion: model.proof.modelVersion,
          parameterVersion: model.proof.parameterVersion,
          iterations: model.result.iterations,
          modeledRaces: model.result.diagnostics.modeledRaces,
          racesWithLocalPolls: model.result.diagnostics.racesWithLocalPolls,
          quality: model.result.diagnostics.quality,
          outcomes: model.result.questionOutcomeProbabilities.map((item) => ({
            id: item.outcomeId,
            probability: item.probability,
          })),
          raceOutcomes: model.result.raceWinProbabilities.map((item) => {
            const estimate = model.result.races.find(
              (race) => race.raceId === item.raceId,
            );
            if (!estimate)
              throw new Error("Published race probability has no estimate");
            return {
              raceId: item.raceId,
              positivePartyId: estimate.positive.partyId,
              negativePartyId: estimate.negative.partyId,
              positiveProbability: item.positiveProbability,
            };
          }),
          partySeats: model.result.partySeats,
          caucusSeats: model.result.caucusSeats,
          sources: sources.items.map((item) => ({
            id: item.sourceId,
            name: item.name,
            attribution: item.attribution,
            revisions: item.revisions,
          })),
          sourcesTruncated: sources.hasMore,
          history: history.items,
          historyTruncated: history.hasMore,
        };
      }),
    );
  });
}

export const publicPollFreshnessMinutes = staleAfterMinutes;
