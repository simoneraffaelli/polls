import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  catalog,
  canonicalUrl,
  editionNavigation,
  midtermsPollHistoryPath,
  midtermsRaceBySlug,
  midtermsRacePath,
  midtermsScenariosPath,
} from "@/composition/catalog";
import { stableCatalogUuid } from "@/composition/sources";
import {
  parsePublicAsOf,
  parsePublicOffset,
  publicPollFreshnessMinutes,
  readPublicForecastCards,
  readPublicPolls,
} from "@/composition/observatory";
import { pollRows } from "@/platform/presentation/observatory";
import { Breadcrumbs } from "@/ui/patterns/breadcrumbs";
import { EditionNavigation } from "@/ui/patterns/edition-navigation";
import { PollTable } from "@/ui/patterns/poll-table";
import { PublishedForecastList } from "@/ui/patterns/published-forecast";

type Route = {
  countrySlug: string;
  sectionSlug: string;
  editionSlug: string;
  raceSlug: string;
};
type Props = {
  params: Promise<Route>;
  searchParams: Promise<{
    asOf?: string | string[];
    offset?: string | string[];
  }>;
};
const scope = {
  sectionId: "section:us:midterms",
  editionId: "edition:us:midterms:2026",
} as const;

function resolve({ countrySlug, sectionSlug, editionSlug, raceSlug }: Route) {
  const country = catalog.countryBySlug(countrySlug);
  const section = catalog.sectionBySlugs(countrySlug, sectionSlug);
  const edition = catalog.editionBySlugs(countrySlug, sectionSlug, editionSlug);
  const race = midtermsRaceBySlug(raceSlug);
  if (
    !country ||
    !section ||
    !edition ||
    !race ||
    section.id !== scope.sectionId ||
    edition.id !== scope.editionId
  )
    notFound();
  return { country, section, edition, race };
}

function raceName(race: NonNullable<ReturnType<typeof midtermsRaceBySlug>>) {
  return race.chamberId === "house"
    ? `Camera ${race.stateCode}-${"districtCode" in race ? race.districtCode : ""}`
    : `Senato ${race.stateCode} · classe ${"senateClass" in race ? race.senateClass : ""}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section, edition, race } = resolve(await params);
  return {
    title: `${raceName(race)} · ${section.name} ${edition.name}`,
    alternates: {
      canonical: canonicalUrl(midtermsRacePath(section, edition, race)),
    },
  };
}

export default async function RacePage({ params, searchParams }: Props) {
  const { country, section, edition, race } = resolve(await params);
  const query = await searchParams;
  const asOf = parsePublicAsOf(
    typeof query.asOf === "string" ? query.asOf : undefined,
  );
  const offset = parsePublicOffset(
    typeof query.offset === "string" ? query.offset : undefined,
  );
  if (!asOf || offset === null) notFound();
  const raceId = stableCatalogUuid(race.id);
  const [polls, forecasts] = await Promise.all([
    readPublicPolls({
      scope,
      raceId,
      asOf,
      limit: 25,
      offset,
      staleAfterMinutes: publicPollFreshnessMinutes,
    }),
    readPublicForecastCards(scope),
  ]);
  const raceForecasts =
    forecasts.status === "ready"
      ? forecasts.value.filter((card) => card.raceIds.includes(raceId))
      : [];
  const path = midtermsRacePath(section, edition, race);
  const label = raceName(race);
  return (
    <>
      <Breadcrumbs
        items={[
          ...catalog.breadcrumbs(country, section, edition),
          { label, href: path },
        ]}
      />
      <div className="hero hero--view">
        <span className="eyebrow">
          Gara · {race.chamberId === "house" ? "Camera" : "Senato"}
        </span>
        <h1>{label}</h1>
        <p>
          Seggio nel catalogo strutturale 2026. Candidature e regole specifiche
          sono ancora da verificare.
        </p>
      </div>
      <EditionNavigation
        items={editionNavigation(section, edition)}
        currentPath={catalog.editionPath(section, edition)}
      />
      <section className="content-section" aria-labelledby="race-status">
        <h2 className="section-heading" id="race-status">
          Stato della gara
        </h2>
        <dl className="facts-list">
          <div>
            <dt>Candidature</dt>
            <dd>Non verificate</dd>
          </div>
          <div>
            <dt>Termine previsionale</dt>
            <dd>
              <time dateTime={race.forecastCutoff}>
                3 novembre 2026, 00:00 UTC
              </time>
            </dd>
          </div>
          <div>
            <dt>Pronostico</dt>
            <dd>
              {raceForecasts.length > 0
                ? `${raceForecasts.length} domande con un run pubblicato che comprende la gara`
                : forecasts.status === "error"
                  ? "Stato del registro temporaneamente non disponibile"
                  : "Nessun run pubblicato che comprende questa gara"}
            </dd>
          </div>
        </dl>
        <PublishedForecastList
          state={
            forecasts.status === "ready"
              ? { status: "ready", value: raceForecasts }
              : {
                  status: forecasts.status === "error" ? "error" : "empty",
                  message: forecasts.message,
                }
          }
          scenarioPath={midtermsScenariosPath(section, edition)}
          raceId={raceId}
        />
      </section>
      <section className="content-section" aria-labelledby="race-polls">
        <h2 className="section-heading" id="race-polls">
          Sondaggi associati alla gara
        </h2>
        <PollTable
          state={
            polls.status === "ready"
              ? {
                  status: "ready",
                  value: pollRows(
                    polls.value.items,
                    (id) =>
                      `${midtermsPollHistoryPath(section, edition, id)}?asOf=${encodeURIComponent(asOf)}`,
                  ),
                }
              : {
                  status: polls.status === "error" ? "error" : "empty",
                  message: polls.message,
                }
          }
        />
        {polls.status === "ready" &&
        polls.value.hasMore &&
        polls.value.nextOffset !== null ? (
          <Link
            className="page-link"
            href={`${path}?asOf=${encodeURIComponent(asOf)}&offset=${polls.value.nextOffset}`}
          >
            Altri sondaggi della gara
          </Link>
        ) : null}
      </section>
    </>
  );
}
