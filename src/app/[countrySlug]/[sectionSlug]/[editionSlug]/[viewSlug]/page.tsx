import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { calendarDateSchema } from "@/platform/data/primitives";
import {
  catalog,
  canonicalUrl,
  editionNavigation,
  midtermsPollHistoryPath,
  midtermsRacePath,
  midtermsRaces,
  midtermsScenariosPath,
  validPublicUuid,
} from "@/composition/catalog";
import {
  parsePublicAsOf,
  parsePublicOffset,
  publicPollFreshnessMinutes,
  readPublicArticles,
  readPublicForecastCards,
  readPublicNewsCoverage,
  readPublicPolls,
  readPublicSources,
} from "@/composition/observatory";
import {
  comparablePollSeries,
  freshnessFromSources,
  newsItems,
  pollRows,
} from "@/platform/presentation/observatory";
import type {
  Availability,
  NewsItem,
  PollRow,
  SeriesPoint,
} from "@/platform/presentation/models";
import { Breadcrumbs } from "@/ui/patterns/breadcrumbs";
import { EditionNavigation } from "@/ui/patterns/edition-navigation";
import { FreshnessBadge } from "@/ui/patterns/freshness-badge";
import { MetricCard } from "@/ui/patterns/metric-card";
import { PollTable } from "@/ui/patterns/poll-table";
import { NewsList } from "@/ui/patterns/news-list";
import { TimeSeriesChart } from "@/ui/patterns/time-series-chart";
import { SourceList } from "@/ui/patterns/source-list";
import { DataNotice } from "@/ui/patterns/data-notice";
import { NewsCoverage } from "@/ui/patterns/news-coverage";
import { PublishedForecastList } from "@/ui/patterns/published-forecast";

type Route = {
  countrySlug: string;
  sectionSlug: string;
  editionSlug: string;
  viewSlug: string;
};
type Search = Record<string, string | string[] | undefined>;
type Props = { params: Promise<Route>; searchParams: Promise<Search> };
const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;
const scope = {
  sectionId: "section:us:midterms",
  editionId: "edition:us:midterms:2026",
} as const;

function queryPath(
  path: string,
  query: Record<string, string | number | undefined>,
) {
  const url = new URL(path, "https://local.invalid");
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) url.searchParams.set(key, String(value));
  return `${url.pathname}${url.search}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countrySlug, sectionSlug, editionSlug, viewSlug } = await params;
  const section = catalog.sectionBySlugs(countrySlug, sectionSlug);
  const edition = catalog.editionBySlugs(countrySlug, sectionSlug, editionSlug);
  const view = catalog.viewBySlugs(
    countrySlug,
    sectionSlug,
    editionSlug,
    viewSlug,
  );
  if (!section || !edition || !view) notFound();
  return {
    title: `${view.name} · ${section.name} ${edition.name}`,
    description: view.description,
    alternates: {
      canonical: canonicalUrl(catalog.viewPath(section, edition, view)),
    },
  };
}

export default async function EditionViewPage({ params, searchParams }: Props) {
  const { countrySlug, sectionSlug, editionSlug, viewSlug } = await params;
  const query = await searchParams;
  const country = catalog.countryBySlug(countrySlug);
  const section = catalog.sectionBySlugs(countrySlug, sectionSlug);
  const edition = catalog.editionBySlugs(countrySlug, sectionSlug, editionSlug);
  const view = catalog.viewBySlugs(
    countrySlug,
    sectionSlug,
    editionSlug,
    viewSlug,
  );
  if (
    !country ||
    !section ||
    !edition ||
    !view ||
    section.id !== scope.sectionId ||
    edition.id !== scope.editionId
  )
    notFound();
  const path = catalog.viewPath(section, edition, view);
  const asOf = parsePublicAsOf(one(query.asOf));
  const offset = parsePublicOffset(one(query.offset));
  if (!asOf || offset === null) notFound();
  const sources = await readPublicSources(scope, asOf);
  const freshness =
    sources.status === "ready"
      ? freshnessFromSources(sources.value.items)
      : {
          state:
            sources.status === "error"
              ? ("error" as const)
              : ("unavailable" as const),
          acquiredAt: null,
        };
  const viewId = view.id;

  let body: React.ReactNode;
  if (
    viewId === "view:us:midterms:2026:house" ||
    viewId === "view:us:midterms:2026:senate"
  ) {
    const chamber = viewId.endsWith(":house") ? "house" : "senate";
    const races = midtermsRaces.filter((race) => race.chamberId === chamber);
    const forecasts = await readPublicForecastCards(scope);
    const pageSize = 40;
    const visible = races.slice(offset, offset + pageSize);
    body = (
      <section className="content-section" aria-labelledby="races-title">
        <h2 className="section-heading" id="races-title">
          Gare strutturali
        </h2>
        <p className="section-intro">
          Il catalogo elenca {races.length} seggi previsti nel perimetro
          strutturale. Candidature, mappa e regole di risoluzione delle singole
          gare richiedono ancora verifica; il catalogo non è una previsione.
        </p>
        <div className="metric-grid">
          <MetricCard
            title="Seggi nel catalogo"
            state={{
              status: "ready",
              value: {
                kind: "seat_count",
                label: "Seggi strutturali",
                valueText: String(races.length),
                detail: "Candidature non verificate",
              },
            }}
          />
        </div>
        <ul className="race-list">
          {visible.map((race) => (
            <li key={race.id}>
              <Link href={midtermsRacePath(section, edition, race)}>
                {chamber === "house"
                  ? `Camera ${race.stateCode}-${"districtCode" in race ? race.districtCode : ""}`
                  : `Senato ${race.stateCode} · classe ${"senateClass" in race ? race.senateClass : ""}`}
              </Link>
              <span> Candidature da verificare</span>
            </li>
          ))}
        </ul>
        {offset > 0 ? (
          <Link
            href={queryPath(path, {
              asOf,
              offset: Math.max(0, offset - pageSize),
            })}
          >
            Gare precedenti
          </Link>
        ) : null}
        {offset + pageSize < races.length ? (
          <Link href={queryPath(path, { asOf, offset: offset + pageSize })}>
            Gare successive
          </Link>
        ) : null}
        <p>
          I run previsionali pubblicati sono consultabili nella pagina dedicata,
          separati dal catalogo strutturale delle gare.
        </p>
        <Link href={midtermsScenariosPath(section, edition)}>
          Consulta run e scenari
        </Link>
        <h3>Previsioni pubblicate per questa camera</h3>
        <PublishedForecastList
          state={
            forecasts.status === "ready"
              ? {
                  status: "ready",
                  value: forecasts.value.filter(
                    (card) => card.chamber === chamber,
                  ),
                }
              : {
                  status: forecasts.status === "error" ? "error" : "empty",
                  message: forecasts.message,
                }
          }
          scenarioPath={midtermsScenariosPath(section, edition)}
        />
      </section>
    );
  } else if (viewId === "view:us:midterms:2026:polls") {
    const sourceId = one(query.source);
    const populationKind = one(query.population);
    const fromDate = one(query.from);
    const toDate = one(query.to);
    const race = one(query.race);
    if (
      (sourceId && !validPublicUuid(sourceId)) ||
      (populationKind &&
        !["likely_voters", "registered_voters", "adults", "other"].includes(
          populationKind,
        )) ||
      (fromDate && !calendarDateSchema.safeParse(fromDate).success) ||
      (toDate && !calendarDateSchema.safeParse(toDate).success) ||
      (fromDate && toDate && fromDate > toDate) ||
      (race && race !== "national")
    )
      notFound();
    const polls = await readPublicPolls({
      scope,
      asOf,
      offset,
      limit: 25,
      staleAfterMinutes: publicPollFreshnessMinutes,
      ...(sourceId ? { sourceId } : {}),
      ...(populationKind ? { populationKind } : {}),
      ...(fromDate ? { fromDate } : {}),
      ...(toDate ? { toDate } : {}),
      ...(race === "national" ? { raceId: null } : {}),
    });
    const tableState: Availability<readonly PollRow[]> =
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
          };
    const series =
      polls.status === "ready" ? comparablePollSeries(polls.value.items) : [];
    const seriesState: Availability<readonly SeriesPoint[]> = series.length
      ? { status: "ready", value: series }
      : {
          status: "empty",
          message:
            "Non ci sono ancora almeno due rilevazioni con domanda, popolazione, esito e gara identici nella pagina corrente.",
        };
    body = (
      <>
        <section className="content-section" aria-labelledby="polls-title">
          <h2 className="section-heading" id="polls-title">
            Sondaggi acquisiti
          </h2>
          <p className="section-intro">
            Le percentuali misurano risposte nel campione, non probabilità di
            vittoria. Periodo osservato e acquisizione sono distinti.
          </p>
          <form
            className="filter-form"
            method="get"
            action={path}
            aria-label="Filtra i sondaggi"
          >
            <input type="hidden" name="asOf" value={asOf} />
            <label>
              Fonte
              <select name="source" defaultValue={sourceId ?? ""}>
                <option value="">Tutte</option>
                {sources.status === "ready"
                  ? sources.value.items
                      .filter((item) => item.family === "polls")
                      .map((item) => (
                        <option key={item.source.id} value={item.source.id}>
                          {item.source.name}
                        </option>
                      ))
                  : null}
              </select>
            </label>
            <label>
              Popolazione
              <select name="population" defaultValue={populationKind ?? ""}>
                <option value="">Tutte</option>
                <option value="likely_voters">Elettori probabili</option>
                <option value="registered_voters">Elettori registrati</option>
                <option value="adults">Adulti</option>
                <option value="other">Altra</option>
              </select>
            </label>
            <label>
              Gara
              <select name="race" defaultValue={race ?? ""}>
                <option value="">Tutte</option>
                <option value="national">Solo sondaggi nazionali</option>
              </select>
            </label>
            <label>
              Dal
              <input type="date" name="from" defaultValue={fromDate ?? ""} />
            </label>
            <label>
              Al
              <input type="date" name="to" defaultValue={toDate ?? ""} />
            </label>
            <button type="submit">Applica filtri</button>
          </form>
          <PollTable state={tableState} />
          {polls.status === "ready" &&
          polls.value.hasMore &&
          polls.value.nextOffset !== null ? (
            <Link
              className="page-link"
              href={queryPath(path, {
                asOf,
                offset: polls.value.nextOffset,
                source: sourceId,
                population: populationKind,
                from: fromDate,
                to: toDate,
                race,
              })}
            >
              Altri sondaggi
            </Link>
          ) : null}
          {polls.status === "ready" && polls.value.truncated ? (
            <p>
              Il limite di consultazione è stato raggiunto: restringi i filtri.
            </p>
          ) : null}
        </section>
        <section className="content-section" aria-labelledby="trend-title">
          <h2 className="section-heading" id="trend-title">
            Serie descrittiva comparabile
          </h2>
          <TimeSeriesChart
            title="Intenzioni di voto"
            unit="Percentuale del campione"
            state={seriesState}
          />
          {series.length ? (
            <p className="section-intro">
              La serie usa soltanto gli studi della pagina corrente (massimo
              25); non rappresenta l’intero archivio.
            </p>
          ) : null}
        </section>
      </>
    );
  } else if (viewId === "view:us:midterms:2026:news") {
    const [articles, coverage] = await Promise.all([
      readPublicArticles(scope, asOf, offset),
      readPublicNewsCoverage(scope, asOf),
    ]);
    const listState: Availability<readonly NewsItem[]> =
      articles.status === "ready"
        ? { status: "ready", value: newsItems(articles.value.items) }
        : {
            status: articles.status === "error" ? "error" : "empty",
            message: articles.message,
          };
    body = (
      <>
        <section className="content-section" aria-labelledby="news-title">
          <h2 className="section-heading" id="news-title">
            Documenti dalle fonti
          </h2>
          <p className="section-intro">
            Il feed della Federal Reserve contiene comunicazioni istituzionali
            economiche. Non misura la copertura elettorale né l’opinione degli
            elettori.
          </p>
          <NewsList state={listState} />
          {articles.status === "ready" &&
          articles.value.hasMore &&
          articles.value.nextOffset !== null ? (
            <Link
              className="page-link"
              href={queryPath(path, {
                asOf,
                offset: articles.value.nextOffset,
              })}
            >
              Altri documenti
            </Link>
          ) : null}
        </section>
        {coverage.status === "ready" ? (
          <NewsCoverage coverage={coverage.value} />
        ) : (
          <section
            className="content-section"
            aria-labelledby="news-coverage-title"
          >
            <h2 id="news-coverage-title" className="section-heading">
              Copertura raccolta
            </h2>
            <DataNotice
              state={{
                status: coverage.status === "error" ? "error" : "empty",
                message: coverage.message,
              }}
            />
          </section>
        )}
      </>
    );
  } else if (viewId === "view:us:midterms:2026:sources") {
    body = (
      <section className="content-section" aria-labelledby="sources-title">
        <h2 className="section-heading" id="sources-title">
          Fonti e metodo
        </h2>
        <p className="section-intro">
          Una fonte configurata può essere in pausa, in errore o non ancora
          acquisita. La sospensione non cancella lo storico. Le fonti tecniche
          non associate all’edizione non appaiono come dati osservati.
        </p>
        {sources.status === "ready" ? (
          <SourceList items={sources.value.items} />
        ) : (
          <DataNotice
            state={{
              status: sources.status === "error" ? "error" : "empty",
              message: sources.message,
            }}
          />
        )}
        <div className="method-grid">
          <article>
            <span className="eyebrow">Misure</span>
            <h3>Significati distinti</h3>
            <p>
              Sondaggi in percentuali, probabilità del modello e prezzi di
              mercato sono misure differenti. Non vengono convertite
              implicitamente.
            </p>
          </article>
          <article>
            <span className="eyebrow">Modello</span>
            <h3>Baseline sperimentale</h3>
            <p>
              Il motore richiede gare, regole e input verificati. Non esiste
              oggi una previsione validata o un punteggio di accuratezza
              dimostrato.
            </p>
          </article>
          <article>
            <span className="eyebrow">Storico</span>
            <h3>Revisioni conservate</h3>
            <p>
              Le correzioni producono nuove revisioni e non modificano gli input
              già usati in un run pubblicato.
            </p>
          </article>
        </div>
      </section>
    );
  } else notFound();

  return (
    <>
      <Breadcrumbs
        items={catalog.breadcrumbs(country, section, edition, view)}
      />
      <div className="hero hero--view">
        <span className="eyebrow">
          {section.name} · {edition.name}
        </span>
        <h1>{view.name}</h1>
        <p>{view.description}</p>
      </div>
      <EditionNavigation
        items={editionNavigation(section, edition)}
        currentPath={path}
      />
      <div className="status-line">
        <span className="eyebrow">Stato delle fonti</span>
        <FreshnessBadge freshness={freshness} />
      </div>
      {body}
    </>
  );
}
