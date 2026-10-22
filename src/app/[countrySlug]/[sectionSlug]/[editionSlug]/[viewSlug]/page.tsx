import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  catalog,
  canonicalUrl,
  editionNavigation,
} from "@/composition/catalog";
import {
  parsePublicAsOf,
  parsePublicOffset,
  readPublicSources,
} from "@/composition/observatory";
import { freshnessFromSources } from "@/platform/presentation/observatory";
import { Breadcrumbs } from "@/ui/patterns/breadcrumbs";
import { EditionNavigation } from "@/ui/patterns/edition-navigation";
import { FreshnessBadge } from "@/ui/patterns/freshness-badge";
import { RacesView } from "./view-races";
import { PollsView } from "./view-polls";
import { NewsView } from "./view-news";
import { SourcesView } from "./view-sources";
import { one, scope, type Query } from "./view-shared";

type Route = {
  countrySlug: string;
  sectionSlug: string;
  editionSlug: string;
  viewSlug: string;
};
type Props = { params: Promise<Route>; searchParams: Promise<Query> };

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
  let body: React.ReactNode;
  switch (view.id) {
    case "view:us:midterms:2026:house":
      body = (
        <RacesView
          section={section}
          edition={edition}
          path={path}
          asOf={asOf}
          offset={offset}
          chamber="house"
        />
      );
      break;
    case "view:us:midterms:2026:senate":
      body = (
        <RacesView
          section={section}
          edition={edition}
          path={path}
          asOf={asOf}
          offset={offset}
          chamber="senate"
        />
      );
      break;
    case "view:us:midterms:2026:polls":
      body = (
        <PollsView
          section={section}
          edition={edition}
          path={path}
          asOf={asOf}
          offset={offset}
          query={query}
          sources={sources}
        />
      );
      break;
    case "view:us:midterms:2026:news":
      body = <NewsView path={path} asOf={asOf} offset={offset} />;
      break;
    case "view:us:midterms:2026:sources":
      body = <SourcesView sources={sources} />;
      break;
    default:
      notFound();
  }

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
