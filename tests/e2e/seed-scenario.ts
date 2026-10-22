import { eq } from "drizzle-orm";
import { z } from "zod";
import { createDatabase } from "../../src/infrastructure/database/client";
import { readWorkerConfig } from "../../src/infrastructure/config/worker-env";
import { recordPollRevision } from "../../src/infrastructure/database/poll-repository";
import { registerStructuralReference } from "../../src/infrastructure/database/structural-reference";
import { registerPollOptionMapping } from "../../src/infrastructure/database/option-mapping";
import { runBaselineModel } from "../../src/infrastructure/jobs/model-runner";
import {
  collectionRuns,
  configuredSources,
  forecastQuestions,
  races,
  user,
} from "../../src/infrastructure/database/schema";
import { MIDTERMS_BASELINE_PARAMETERS } from "../../src/modules/usa/midterms/model/baseline";
import { sourceIdFor } from "../../src/composition/sources";

const questionId = z.uuid().parse(process.env.E2E_SCENARIO_ID);
if (!process.env.PGDATABASE?.includes("test"))
  throw new Error("Scenario E2E fixture requires a disposable test database");
const email = z.email().parse(process.env.E2E_ADMIN_EMAIL);
const scope = {
  sectionId: "section:us:midterms",
  editionId: "edition:us:midterms:2026",
} as const;
const database = createDatabase({
  connectionString: readWorkerConfig(process.env).databaseUrl,
  max: 1,
});

const instant = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString();
const date = (offsetDays: number) => instant(offsetDays).slice(0, 10);

async function main() {
  const db = database.db;
  const [admin] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email));
  if (!admin) throw new Error("Provisioned CI administrator is missing");
  const sourceId = sourceIdFor("source:manual-import:polls");
  const [source] = await db
    .select({ id: configuredSources.id })
    .from(configuredSources)
    .where(eq(configuredSources.id, sourceId));
  if (!source) throw new Error("Seeded manual source is missing");
  const [run] = await db
    .insert(collectionRuns)
    .values({ sourceId, status: "succeeded" })
    .returning({ id: collectionRuns.id });
  const [race] = await db
    .insert(races)
    .values({
      editionId: scope.editionId,
      slug: "ci-scenario-race",
      name: "Gara di prova CI",
    })
    .returning({ id: races.id });
  const cutoffAt = new Date(Date.now() + 86_400_000);
  await db.insert(forecastQuestions).values({
    id: questionId,
    editionId: scope.editionId,
    slug: "ci-scenario",
    outcomeDefinition: "seat_majority",
    resolutionRuleVersion: "ci-rule-v1",
    cutoffAt,
    cutoffLocal: cutoffAt.toISOString().slice(0, 19),
    cutoffTimeZone: "UTC",
    cutoffCalendarReference: "https://example.org/ci-calendar",
    cutoffVersion: 1,
  });
  const acquiredAt = (
    await database.pool.query<{ now: Date }>("SELECT clock_timestamp() AS now")
  ).rows[0]!.now.toISOString();
  const observation = {
    provenance: {
      sourceId,
      sourceUrl: "https://example.org/ci-scenario-poll",
      externalId: "ci-scenario-poll",
      sourceRevision: "1",
      observed: {
        kind: "date_period" as const,
        startDate: date(-3),
        endDate: date(-2),
      },
      declaredPublication: { kind: "date" as const, date: date(-1) },
      acquiredAt,
      ingestionRunId: run.id,
      parserVersion: "ci-fixture-v1",
      transformationVersion: "ci-fixture-v1",
      contentHash: "a".repeat(64),
    },
    pollster: "CI synthetic pollster",
    sponsors: ["CI synthetic sponsor"],
    questions: [
      {
        questionId: "ci-vote-intent",
        wording: "Synthetic CI question",
        kind: "vote_intent" as const,
        population: {
          kind: "registered_voters" as const,
          description: "Synthetic CI sample",
        },
        sampleGroupId: "ci-scenario-sample",
        sampleSize: 1000,
        options: [
          { optionId: "option-a", label: "Option A", percentage: 48 },
          { optionId: "option-b", label: "Option B", percentage: 47 },
        ],
      },
    ],
  };
  const poll = await recordPollRevision(db, observation, {
    scope,
    raceId: race.id,
  });
  const structuralRace = {
    raceId: race.id,
    regionId: "ci-region",
    priorMarginPoints: 0,
    priorSdPoints: 10,
    priorAvailableAt: instant(-5),
    priorVersion: "ci-prior-v1",
    structuralStatus: "verified" as const,
    mapVersion: "ci-map-v1",
    resolutionRuleVersion: "ci-rule-v1",
    binaryResolutionVerified: true,
    positive: { partyId: "A", caucusId: "A" },
    negative: { partyId: "B", caucusId: "B" },
  };
  const control = {
    version: "ci-rule-v1",
    outcomeKind: "seat_majority" as const,
    resolutionRuleVerified: true,
    totalSeats: 1,
    majorityThreshold: 1,
    holdovers: [],
    holdoversAsOf: instant(-5),
    holdoversVerified: true,
    tieAt: null,
    tieBreakerCaucusId: null,
    tieRuleVerified: true,
  };
  const structural = await registerStructuralReference(db, {
    questionId,
    scope,
    version: "ci-structure-v1",
    sourceUrl: "https://example.org/ci-structural-evidence",
    sourceVersion: "ci-fixture-v1",
    availableAt: instant(-4),
    payload: {
      catalogVersion: "ci-catalog-v1",
      races: [structuralRace],
      control,
    },
    reviewerUserId: admin.id,
  });
  const mapping = await registerPollOptionMapping(db, {
    structuralReferenceId: structural.id,
    revisionId: poll.revisionId,
    externalQuestionId: "ci-vote-intent",
    raceId: race.id,
    positiveOptionId: "option-a",
    negativeOptionId: "option-b",
    reviewerUserId: admin.id,
    reason: "Synthetic CI orientation",
  });
  const inputAsOf = (
    await database.pool.query<{ now: Date }>("SELECT clock_timestamp() AS now")
  ).rows[0]!.now.toISOString();
  const completed = await runBaselineModel(db, {
    iterations: 100,
    snapshot: {
      questionId,
      scope,
      kind: "forecast",
      inputAsOf,
      cutoffAt: cutoffAt.toISOString(),
      catalogVersion: "ci-catalog-v1",
      structuralReferenceId: structural.id,
      qualityPolicyVersion: "poll-quality-v1",
      modelVersion: "ci-baseline-v1",
      parameterVersion: MIDTERMS_BASELINE_PARAMETERS.version,
      parameters: MIDTERMS_BASELINE_PARAMETERS,
      seed: "ci-scenario-seed",
      races: [structuralRace],
      polls: [
        {
          signalId: "ci-poll-signal",
          revisionId: poll.revisionId,
          pollLinkId: poll.linkId,
          optionMappingId: mapping.id,
          externalQuestionId: "ci-vote-intent",
          positiveOptionId: "option-a",
          negativeOptionId: "option-b",
          raceId: race.id,
          pollsterId: observation.pollster,
          sampleGroupId: "ci-scenario-sample",
          population: "registered_voters",
          sampleSize: 1000,
          quality: 1,
          observedEndDate: date(-2),
          acquiredAt,
          availableAt: acquiredAt,
          availability: "actual_acquisition",
          marginPoints: 1,
        },
      ],
      control,
    },
  });
  if (!completed.publicationId) throw new Error("CI scenario did not publish");
  process.stdout.write(`Published synthetic CI scenario ${questionId}\n`);
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "CI scenario seed failed",
    );
    process.exitCode = 1;
  })
  .finally(() => database.close());
