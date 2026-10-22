import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  catalog,
  canonicalUrl,
  editionNavigation,
} from "@/composition/catalog";
import { Breadcrumbs } from "@/ui/patterns/breadcrumbs";
import { EditionNavigation } from "@/ui/patterns/edition-navigation";
import { EmptyState } from "@/ui/patterns/empty-state";
import { FreshnessBadge } from "@/ui/patterns/freshness-badge";
import { MetricCard } from "@/ui/patterns/metric-card";

type Props = {
  params: Promise<{
    countrySlug: string;
    sectionSlug: string;
    editionSlug: string;
  }>;
};

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

export default async function EditionPage({ params }: Props) {
  const { countrySlug, sectionSlug, editionSlug } = await params;
  const country = catalog.countryBySlug(countrySlug);
  const section = catalog.sectionBySlugs(countrySlug, sectionSlug);
  const edition = catalog.editionBySlugs(countrySlug, sectionSlug, editionSlug);
  if (!country || !section || !edition) notFound();
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
        <FreshnessBadge
          freshness={{ state: "unavailable", acquiredAt: null }}
        />
      </div>
      <section className="content-section" aria-labelledby="edition-metrics">
        <h2 className="section-heading" id="edition-metrics">
          Una lettura per tipo di dato
        </h2>
        <div className="metric-grid">
          <MetricCard
            title="Intenzioni di voto"
            state={{
              status: "empty",
              message: "Nessun sondaggio acquisito e verificato.",
            }}
          />
          <MetricCard
            title="Previsioni"
            state={{
              status: "empty",
              message: "Nessuna previsione pubblicata.",
            }}
          />
          <MetricCard
            title="Prezzi di mercato"
            state={{
              status: "empty",
              message: "Nessun mercato verificato per una domanda equivalente.",
            }}
          />
        </div>
      </section>
      <EmptyState />
    </>
  );
}
