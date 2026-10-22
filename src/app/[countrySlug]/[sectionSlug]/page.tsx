import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { catalog, canonicalUrl } from "@/composition/catalog";
import { Breadcrumbs } from "@/ui/patterns/breadcrumbs";
import { LinkCard } from "@/ui/patterns/link-card";

type Props = { params: Promise<{ countrySlug: string; sectionSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countrySlug, sectionSlug } = await params;
  const section = catalog.sectionBySlugs(countrySlug, sectionSlug);
  if (!section) notFound();
  return {
    title: section.name,
    description: section.description,
    alternates: { canonical: canonicalUrl(catalog.sectionPath(section)) },
  };
}

export default async function SectionPage({ params }: Props) {
  const { countrySlug, sectionSlug } = await params;
  const country = catalog.countryBySlug(countrySlug);
  const section = catalog.sectionBySlugs(countrySlug, sectionSlug);
  if (!country || !section) notFound();
  return (
    <>
      <Breadcrumbs items={catalog.breadcrumbs(country, section)} />
      <div className="hero">
        <span className="eyebrow">Sezione · {country.name}</span>
        <h1>{section.name}</h1>
        <p>{section.description}</p>
      </div>
      <section className="content-section" aria-labelledby="editions-title">
        <h2 className="section-heading" id="editions-title">
          Edizioni
        </h2>
        <div className="card-grid">
          {section.editions.map((edition) => (
            <LinkCard
              key={edition.id}
              href={catalog.editionPath(section, edition)}
              eyebrow="Edizione"
              title={edition.name}
              description={edition.description}
            />
          ))}
        </div>
      </section>
    </>
  );
}
