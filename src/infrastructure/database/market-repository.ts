import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { MARKET_QUALITY_POLICY_VERSION } from "../../integrations/polymarket/book";
import {
  marketQuoteObservationSchema,
  type MarketQuoteObservation,
} from "../../platform/data/market";
import {
  editionScopeSchema,
  utcInstantSchema,
} from "../../platform/data/primitives";
import type { Database } from "./client";
import { rawEpochMillis, requiredRawInstant } from "./raw-time";
import {
  configuredSources,
  editions,
  forecastQuestions,
  marketContracts,
  marketOutcomes,
  marketQuotes,
  providers,
  publicationHistory,
} from "./schema";

const MAX_QUOTE_AGE_MS = 30 * 60_000;

/** Persists only a preconfigured contract/outcome. No market discovery or collection activation. */
export async function recordMarketQuote(
  db: Database,
  raw: MarketQuoteObservation,
): Promise<{ quoteId: string; inserted: boolean }> {
  const observation = marketQuoteObservationSchema.parse(raw);
  if (observation.outcomeId !== observation.provenance.externalId)
    throw new Error("Configured market outcome must identify the quoted token");
  if (observation.qualityPolicyVersion !== MARKET_QUALITY_POLICY_VERSION)
    throw new Error("Unsupported market quality policy");
  const observed = observation.provenance.observed;
  if (observed.kind !== "instant") throw new Error("Market timestamp missing");
  const acquiredAt = new Date(observation.provenance.acquiredAt);
  const sourceObservedAt = new Date(observed.at);
  const age = acquiredAt.getTime() - sourceObservedAt.getTime();
  if (
    observation.price.kind === "bid_ask_midpoint" &&
    observation.price.comparisonStatus === "eligible" &&
    observation.price.spread > 0.05 + 1e-9
  )
    throw new Error("Eligible market spread exceeds policy");
  if (
    age < 0 ||
    (observation.price.kind === "bid_ask_midpoint" &&
      observation.price.comparisonStatus === "eligible" &&
      age > MAX_QUOTE_AGE_MS)
  )
    throw new Error("Market quote has ineligible provider time");
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM configured_sources WHERE id = ${observation.provenance.sourceId} FOR SHARE`,
    );
    const [source] = await tx
      .select({ enabled: configuredSources.enabled, family: providers.family })
      .from(configuredSources)
      .innerJoin(providers, eq(providers.id, configuredSources.providerId))
      .where(eq(configuredSources.id, observation.provenance.sourceId));
    if (!source?.enabled || source.family !== "markets")
      throw new Error("Market source is not enabled");
    const [contract] = await tx
      .select({ id: marketContracts.id })
      .from(marketContracts)
      .where(
        and(
          eq(marketContracts.sourceId, observation.provenance.sourceId),
          eq(marketContracts.externalId, observation.marketId),
        ),
      );
    if (!contract) throw new Error("Market contract is not configured");
    const [outcome] = await tx
      .select({ id: marketOutcomes.id })
      .from(marketOutcomes)
      .where(
        and(
          eq(marketOutcomes.sourceId, observation.provenance.sourceId),
          eq(marketOutcomes.contractId, contract.id),
          eq(marketOutcomes.externalId, observation.outcomeId),
        ),
      );
    if (!outcome) throw new Error("Market outcome is not configured");
    const duplicateWhere = and(
      eq(marketQuotes.sourceId, observation.provenance.sourceId),
      eq(marketQuotes.outcomeId, outcome.id),
      eq(marketQuotes.snapshotId, observation.snapshotId),
      observation.provenance.sourceRevision === null
        ? isNull(marketQuotes.sourceRevision)
        : eq(
            marketQuotes.sourceRevision,
            observation.provenance.sourceRevision,
          ),
    );
    const [existing] = await tx
      .select({ id: marketQuotes.id, contentHash: marketQuotes.contentHash })
      .from(marketQuotes)
      .where(duplicateWhere)
      .limit(1);
    if (existing) {
      if (existing.contentHash !== observation.provenance.contentHash)
        throw new Error("Conflicting market quote for same snapshot revision");
      return { quoteId: existing.id, inserted: false };
    }
    const price = observation.price;
    const [inserted] = await tx
      .insert(marketQuotes)
      .values({
        outcomeId: outcome.id,
        sourceId: observation.provenance.sourceId,
        snapshotId: observation.snapshotId,
        sourceRevision: observation.provenance.sourceRevision,
        contentHash: observation.provenance.contentHash,
        sourceUrl: observation.provenance.sourceUrl,
        priceType: price.kind,
        bid: price.kind === "bid_ask_midpoint" ? String(price.bid) : null,
        ask: price.kind === "bid_ask_midpoint" ? String(price.ask) : null,
        midpoint:
          price.kind === "bid_ask_midpoint" ? String(price.midpoint) : null,
        spread: price.kind === "bid_ask_midpoint" ? String(price.spread) : null,
        lastTrade: price.kind === "last_trade" ? String(price.price) : null,
        comparisonStatus:
          price.kind === "bid_ask_midpoint" ? price.comparisonStatus : null,
        exclusionReason:
          price.kind === "bid_ask_midpoint" ? price.exclusionReason : null,
        expectedPriceType:
          price.kind === "unavailable" ? price.expectedPriceType : null,
        unavailableReason: price.kind === "unavailable" ? price.reason : null,
        sourceObservedAt,
        declaredPublicationKind:
          observation.provenance.declaredPublication?.kind ?? null,
        declaredPublicationDate:
          observation.provenance.declaredPublication?.kind === "date"
            ? observation.provenance.declaredPublication.date
            : null,
        declaredPublicationAt:
          observation.provenance.declaredPublication?.kind === "instant"
            ? new Date(observation.provenance.declaredPublication.at)
            : null,
        acquiredAt,
        qualityPolicyVersion: observation.qualityPolicyVersion,
        qualityState:
          price.kind === "bid_ask_midpoint"
            ? price.comparisonStatus
            : price.kind,
        parserVersion: observation.provenance.parserVersion,
        transformVersion: observation.provenance.transformationVersion,
        ingestionRunId: observation.provenance.ingestionRunId,
      })
      .onConflictDoNothing()
      .returning({ id: marketQuotes.id });
    if (!inserted) {
      const [concurrent] = await tx
        .select({ id: marketQuotes.id, contentHash: marketQuotes.contentHash })
        .from(marketQuotes)
        .where(duplicateWhere)
        .limit(1);
      if (
        !concurrent ||
        concurrent.contentHash !== observation.provenance.contentHash
      )
        throw new Error("Conflicting market quote for same snapshot revision");
      return { quoteId: concurrent.id, inserted: false };
    }
    return { quoteId: inserted.id, inserted: true };
  });
}

export type MarketComparison = Readonly<{
  status: "eligible" | "unavailable" | "closed" | "unpublished";
  reason: string | null;
  midpoint: number | null;
  quoteId: string | null;
  marketOutcomeId: string | null;
  marketOutcomeExternalId: string | null;
  outcomeLabel: string | null;
  contractTitle: string | null;
  acquiredAt: string | null;
  sourceObservedAt: string | null;
}>;

type QuoteRow = {
  quote_id: string;
  midpoint: string;
  market_outcome_id: string;
  market_outcome_external_id: string;
  outcome_label: string;
  contract_title: string;
  acquired_epoch_ms: string;
  observed_epoch_ms: string;
};

/** Only verified equivalent, fresh midpoint quotes can be compared to an open published question. */
export async function readMarketComparison(
  db: Database,
  input: {
    scope: { sectionId: string; editionId: string };
    questionId: string;
    asOf: string;
    rightsVerified?: boolean;
    timestampFormatVerified?: boolean;
  },
): Promise<MarketComparison | null> {
  const scope = editionScopeSchema.parse(input.scope);
  const questionId = z.uuid().parse(input.questionId);
  const asOf = new Date(utcInstantSchema.parse(input.asOf));
  const [question] = await db
    .select({
      id: forecastQuestions.id,
      cutoffAt: forecastQuestions.cutoffAt,
      storedState: forecastQuestions.storedState,
    })
    .from(forecastQuestions)
    .innerJoin(editions, eq(editions.id, forecastQuestions.editionId))
    .where(
      and(
        eq(forecastQuestions.id, questionId),
        eq(forecastQuestions.editionId, scope.editionId),
        eq(editions.sectionId, scope.sectionId),
      ),
    );
  if (!question) return null;
  if (
    question.storedState !== "open" ||
    asOf.getTime() >= question.cutoffAt.getTime()
  )
    return {
      status: "closed",
      reason: "question_cutoff",
      midpoint: null,
      quoteId: null,
      marketOutcomeId: null,
      marketOutcomeExternalId: null,
      outcomeLabel: null,
      contractTitle: null,
      acquiredAt: null,
      sourceObservedAt: null,
    };
  const [publication] = await db
    .select({ id: publicationHistory.id })
    .from(publicationHistory)
    .where(
      and(
        eq(publicationHistory.questionId, questionId),
        eq(publicationHistory.editionId, scope.editionId),
        sql`${publicationHistory.publishedAt} <= ${asOf}`,
      ),
    )
    .orderBy(
      sql`${publicationHistory.publishedAt} DESC`,
      sql`${publicationHistory.id} DESC`,
    )
    .limit(1);
  if (!publication)
    return {
      status: "unpublished",
      reason: "forecast_unpublished",
      midpoint: null,
      quoteId: null,
      marketOutcomeId: null,
      marketOutcomeExternalId: null,
      outcomeLabel: null,
      contractTitle: null,
      acquiredAt: null,
      sourceObservedAt: null,
    };
  if (input.rightsVerified !== true || input.timestampFormatVerified !== true)
    return {
      status: "unavailable",
      reason: "market_publication_gate_closed",
      midpoint: null,
      quoteId: null,
      marketOutcomeId: null,
      marketOutcomeExternalId: null,
      outcomeLabel: null,
      contractTitle: null,
      acquiredAt: null,
      sourceObservedAt: null,
    };
  const result = await db.execute(sql`
    WITH latest AS MATERIALIZED (
      SELECT DISTINCT ON (quote.outcome_id) quote.*, outcome.label AS outcome_label,
        outcome.external_id AS market_outcome_external_id,
        contract.title AS contract_title
      FROM market_question_links link
      JOIN market_outcomes outcome ON outcome.id = link.outcome_id
      JOIN market_contracts contract ON contract.id = outcome.contract_id
      JOIN market_quotes quote ON quote.outcome_id = outcome.id
      JOIN configured_sources source ON source.id = quote.source_id AND source.enabled = TRUE
      JOIN providers provider ON provider.id = source.provider_id AND provider.family = 'markets'
      JOIN source_section_bindings binding ON binding.source_id = source.id
        AND binding.section_id = ${scope.sectionId} AND binding.enabled = TRUE
      WHERE link.question_id = ${questionId} AND link.edition_id = ${scope.editionId}
        AND link.equivalence_status = 'equivalent' AND link.checked_at IS NOT NULL
        AND nullif(trim(link.explanation), '') IS NOT NULL
        AND link.checked_at <= ${asOf}
        AND quote.acquired_at <= ${asOf}
      ORDER BY quote.outcome_id, quote.acquired_at DESC, quote.id DESC
    )
    SELECT quote.id AS quote_id, quote.midpoint,
      quote.outcome_id AS market_outcome_id, quote.market_outcome_external_id,
      quote.outcome_label, quote.contract_title,
      (floor(extract(epoch from quote.acquired_at) * 1000))::bigint AS acquired_epoch_ms,
      (floor(extract(epoch from quote.source_observed_at) * 1000))::bigint AS observed_epoch_ms
    FROM latest quote
    WHERE quote.price_type = 'bid_ask_midpoint' AND quote.comparison_status = 'eligible'
      AND quote.quality_state = 'eligible'
      AND quote.quality_policy_version = ${MARKET_QUALITY_POLICY_VERSION}
      AND quote.source_observed_at <= quote.acquired_at
      AND quote.acquired_at - quote.source_observed_at <= INTERVAL '30 minutes'
      AND ${asOf}::timestamptz - quote.source_observed_at <= INTERVAL '30 minutes'
      AND quote.spread <= 0.05
    ORDER BY quote.acquired_at DESC, quote.id DESC LIMIT 1
  `);
  const row = result.rows[0] as QuoteRow | undefined;
  if (!row)
    return {
      status: "unavailable",
      reason: "no_eligible_equivalent_quote",
      midpoint: null,
      quoteId: null,
      marketOutcomeId: null,
      marketOutcomeExternalId: null,
      outcomeLabel: null,
      contractTitle: null,
      acquiredAt: null,
      sourceObservedAt: null,
    };
  const midpoint = Number(row.midpoint);
  if (!Number.isFinite(midpoint) || midpoint < 0 || midpoint > 1)
    throw new Error("Invalid stored market midpoint");
  return {
    status: "eligible",
    reason: null,
    midpoint,
    quoteId: row.quote_id,
    marketOutcomeId: row.market_outcome_id,
    marketOutcomeExternalId: row.market_outcome_external_id,
    outcomeLabel: row.outcome_label,
    contractTitle: row.contract_title,
    acquiredAt: requiredRawInstant(row.acquired_epoch_ms).toISOString(),
    sourceObservedAt:
      rawEpochMillis(row.observed_epoch_ms)?.toISOString() ?? null,
  };
}
