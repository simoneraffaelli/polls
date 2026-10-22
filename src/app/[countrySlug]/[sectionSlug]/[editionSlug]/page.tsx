import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  catalog,
  canonicalUrl,
  editionNavigation,
  midtermsPollHistoryPath,
  midtermsScenariosPath,
} from "@/composition/catalog";
import {
  parsePublicAsOf,
  publicPollFreshnessMinutes,
  readPublicArticles,
  readPublicPolls,
  readPublicSources,
} from "@/composition/observatory";
import {
  freshnessFromSources,
  newsItems,
  pollRows,
} from "@/platform/presentation/observatory";
import { Breadcrumbs } from "@/ui/patterns/breadcrumbs";
import { EditionNavigation } from "@/ui/patterns/edition-navigation";
import { FreshnessBadge } from "@/ui/patterns/freshness-badge";
import { MetricCard } from "@/ui/patterns/metric-card";
import { PollTable } from "@/ui/patterns/poll-table";
import { NewsList } from "@/ui/patterns/news-list";
import { SourceList } from "@/ui/patterns/source-list";
import { DataNotice } from "@/ui/patterns/data-notice";

type Route = { countrySlug: string; sectionSlug: string; editionSlug: string };
type Props = {
  params: Promise<Route>;
  searchParams: Promise<{ asOf?: string | string[] }>;
};
const scope = {
  sectionId: "section:us:midterms",
  editionId: "edition:us:midterms:2026",
} as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countrySlug, sectionSlug, editionSlug } = await params;
  const section = catalog.sectionBySlugs(countrySlug, sectionSlug);
  const edition = catalog.editionBySlugs(countrySlug, sectionSlug, editionSlug);
  if (!section || !edition) notFound();
  return {
    title: `${section.name} ${edition.name}`,
    description: edition.description,
    alternates: {
      canonical: canonicalUrl(catalog.editionPath(section, edition)),
    },
  };
}

export default async function EditionPage({ params, searchParams }: Props) {
  const { countrySlug, sectionSlug, editionSlug } = await params;
  const query = await searchParams;
  const country = catalog.countryBySlug(countrySlug);
  const section = catalog.sectionBySlugs(countrySlug, sectionSlug);
  const edition = catalog.editionBySlugs(countrySlug, sectionSlug, editionSlug);
  if (
    !country ||
    !section ||
    !edition ||
    section.id !== scope.sectionId ||
    edition.id !== scope.editionId
  )
    notFound();
  const asOf = parsePublicAsOf(
    typeof query.asOf === "string" ? query.asOf : undefined,
  );
  if (!asOf) notFound();
  const [polls, articles, sources] = await Promise.all([
    readPublicPolls({
      scope,
      asOf,
      limit: 5,
      staleAfterMinutes: publicPollFreshnessMinutes,
    }),
    readPublicArticles(scope, asOf, 0, 5),
    readPublicSources(scope, asOf),
  ]);
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
  const view = (id: string) =>
    catalog.viewsForEdition(section, edition).find((item) => item.id === id)!;
  return (
    <>
      <Breadcrumbs items={catalog.breadcrumbs(country, section, edition)} />
      <div className="hero">
        <span className="eyebrow">Edizione · {country.name}</span>
        <h1>
          {section.name} {edition.name}
        </h1>
        <p>{edition.description}</p>
      </div>
      <EditionNavigation
        items={editionNavigation(section, edition)}
        currentPath={catalog.editionPath(section, edition)}
      />
      <div className="status-line">
        <span className="eyebrow">Stato dell’osservatorio</span>
        <FreshnessBadge freshness={freshness} />
      </div>
      <section className="content-section" aria-labelledby="edition-metrics">
        <h2 className="section-heading" id="edition-metrics">
          Dati e significati
        </h2>
        <div className="metric-grid">
          <MetricCard
            title="Sondaggi acquisiti"
            state={
              polls.status === "ready" && polls.value.items.length > 0
                ? {
                    status: "ready",
                    value: {
                      kind: "vote_intention",
                      label: "Studi nella prima pagina",
                      valueText: String(polls.value.items.length),
                      detail: "Non sono probabilità di vittoria",
                    },
                  }
                : {
                    status: polls.status === "error" ? "error" : "empty",
                    message:
                      polls.status === "ready"
                        ? "Nessun sondaggio acquisito."
                        : polls.message,
                  }
            }
          />
          <MetricCard
            title="Previsioni"
            state={{
              status: "empty",
              message:
                "Il registro dei run pubblicati non è ancora collegato a questa pagina.",
            }}
          />
          <MetricCard
            title="Prezzi di mercato"
            state={{
              status: "empty",
              message:
                "Nessun mercato associato a una domanda equivalente e autorizzato alla visualizzazione.",
            }}
          />
        </div>
      </section>
      <section className="content-section" aria-labelledby="overview-polls">
        <h2 className="section-heading" id="overview-polls">
          Ultimi sondaggi
        </h2>
        <PollTable
          state={
            polls.status === "ready"
              ? {
                  status: "ready",
                  value: pollRows(polls.value.items, (id) =>
                    `${midtermsPollHistoryPath(section, edition, id)}?asOf=${encodeURIComponent(asOf)}`,
                  ),
                }
              : {
                  status: polls.status === "error" ? "error" : "empty",
                  message: polls.message,
                }
          }
        />
        <p>
          <Link
            className="page-link"
            href={catalog.viewPath(
              section,
              edition,
              view("view:us:midterms:2026:polls"),
            )}
          >
            Consulta e filtra i sondaggi
          </Link>
        </p>
      </section>
      <section className="content-section" aria-labelledby="overview-news">
        <h2 className="section-heading" id="overview-news">
          Documenti istituzionali
        </h2>
        <NewsList
          state={
            articles.status === "ready"
              ? { status: "ready", value: newsItems(articles.value.items) }
              : {
                  status: articles.status === "error" ? "error" : "empty",
                  message: articles.message,
                }
          }
        />
        <p>
          <Link
            className="page-link"
            href={catalog.viewPath(
              section,
              edition,
              view("view:us:midterms:2026:news"),
            )}
          >
            Consulta i documenti
          </Link>
        </p>
      </section>
      <section className="content-section" aria-labelledby="overview-sources">
        <h2 className="section-heading" id="overview-sources">
          Fonti associate
        </h2>
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
      </section>
      <section className="content-section" aria-labelledby="overview-scenarios">
        <h2 className="section-heading" id="overview-scenarios">
          Scenari
        </h2>
        <p className="section-intro">
          Uno scenario richiede un run pubblicato e il suo snapshot sigillato.
          Al momento non è disponibile una base verificata.
        </p>
        <Link
          className="page-link"
          href={midtermsScenariosPath(section, edition)}
        >
          Stato degli scenari
        </Link>
      </section>
    </>
  );
}

