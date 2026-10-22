import type {
  ObservatoryArticle,
  ObservatoryPoll,
  ObservatorySourceSummary,
} from "../observatory/read-contracts";
import type { Freshness, NewsItem, PollRow, SeriesPoint } from "./models";

export function freshnessFromSources(
  sources: readonly ObservatorySourceSummary[],
): Freshness {
  const states = sources.map(({ source }) => source.state);
  const acquiredAt =
    states
      .map((state) => state.acquiredAt)
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1) ?? null;
  const state = states.some((item) => item.status === "error")
    ? "error"
    : states.some((item) => item.status === "stale")
      ? "stale"
      : states.some((item) => item.status === "current")
        ? "current"
        : "unavailable";
  return { state, acquiredAt };
}

export function pollRows(
  polls: readonly ObservatoryPoll[],
  historyPath?: (pollId: string) => string,
): readonly PollRow[] {
  return polls.flatMap((poll) =>
    poll.questions.map((question) => ({
      id: `${poll.revisionId}:${question.id}`,
      ...(historyPath ? { historyHref: historyPath(poll.pollId) } : {}),
      pollster: poll.pollster,
      subject: `${question.wording ?? question.kind} · revisione ${poll.revisionNo}${poll.currentLinkIncluded ? "" : " · Collegamento escluso dalla vista corrente"}${poll.excludedFromFutureForecasts ? " · Escluso dai nuovi calcoli" : ""}`,
      observedPeriod: `${poll.fieldworkStart} – ${poll.fieldworkEnd}`,
      population: `${question.populationDescription} (${question.populationKind})`,
      sample:
        question.sampleSize === null
          ? "Numerosità non dichiarata"
          : `n = ${question.sampleSize.toLocaleString("it-IT")}`,
      finding: question.options
        .map(
          (option) =>
            `${option.label}: ${option.percentage.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`,
        )
        .join(" · "),
      source: {
        name: poll.source.name,
        url: poll.sourceUrl,
        acquiredAt: poll.acquiredAt,
        note: poll.source.attribution ?? undefined,
      },
    })),
  );
}

export function newsItems(
  articles: readonly ObservatoryArticle[],
): readonly NewsItem[] {
  return articles.map((article) => ({
    id: article.revisionId,
    title: article.title,
    publishedAt: article.publishedAt,
    summary: article.excerptReusePermitted ? article.excerpt : null,
    excerptReusePermitted: article.excerptReusePermitted,
    source: {
      name: article.publisher || article.source.name,
      url: article.url,
      acquiredAt: article.acquiredAt,
      note: article.source.attribution ?? undefined,
    },
  }));
}

/** Only an exact question, population, outcome label and race yields a descriptive series. */
export function comparablePollSeries(
  polls: readonly ObservatoryPoll[],
): readonly SeriesPoint[] {
  const groups = new Map<string, SeriesPoint[]>();
  for (const poll of polls) {
    if (!poll.currentLinkIncluded) continue;
    for (const question of poll.questions) {
      if (!question.wording) continue;
      for (const option of question.options) {
        const key = JSON.stringify([
          poll.raceId,
          question.kind,
          question.wording,
          question.populationKind,
          question.populationDescription,
          option.label,
        ]);
        const points = groups.get(key) ?? [];
        points.push({
          date: poll.fieldworkEnd,
          value: option.percentage,
          label: `${question.wording} · ${question.populationDescription} · ${option.label}`,
        });
        groups.set(key, points);
      }
    }
  }
  const candidates = [...groups.values()].filter(
    (points) => points.length >= 2,
  );
  candidates.sort((a, b) => b.length - a.length);
  return (candidates[0] ?? []).sort((a, b) => a.date.localeCompare(b.date));
}
