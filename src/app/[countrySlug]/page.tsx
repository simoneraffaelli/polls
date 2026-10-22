import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { catalog, canonicalUrl } from "@/composition/catalog";
import { Breadcrumbs } from "@/ui/patterns/breadcrumbs";
import { LinkCard } from "@/ui/patterns/link-card";

type Props = { params: Promise<{ countrySlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countrySlug } = await params;
  const country = catalog.countryBySlug(countrySlug);
  if (!country) notFound();
  return {
    title: country.name,
    description: country.description,
    alternates: { canonical: canonicalUrl(catalog.countryPath(country)) },
  };
}

export default async function CountryPage({ params }: Props) {
  const { countrySlug } = await params;
  const country = catalog.countryBySlug(countrySlug);
  if (!country) notFound();
  const sections = catalog.sectionsForCountry(country);
  return (
    <>
      <Breadcrumbs items={catalog.breadcrumbs(country)} />
      <div className="hero">
        <span className="eyebrow">Paese · {country.code}</span>
        <h1>{country.name}</h1>
        <p>{country.description}</p>
      </div>
      <section className="content-section" aria-labelledby="sections-title">
        <h2 className="section-heading" id="sections-title">
          Sezioni
        </h2>
        <div className="card-grid">
          {sections.map((section) => (
            <LinkCard
              key={section.id}
              href={catalog.sectionPath(section)}
              eyebrow="Sezione"
              title={section.name}
              description={section.description}
            />
          ))}
        </div>
      </section>
    </>
  );
}
