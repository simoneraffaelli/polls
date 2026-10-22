import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { catalog, canonicalUrl } from "@/composition/catalog";
import { Breadcrumbs } from "@/ui/patterns/breadcrumbs";
import { EmptyState } from "@/ui/patterns/empty-state";

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
      <EmptyState />
    </>
  );
}
