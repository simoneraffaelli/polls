import type { Metadata } from "next";
import { catalog, canonicalUrl } from "@/composition/catalog";
import { homePath } from "@/platform/catalog";
import { LinkCard } from "@/ui/patterns/link-card";

export const metadata: Metadata = {
  alternates: { canonical: canonicalUrl(homePath) },
};

export default function HomePage() {
  return (
    <>
      <div className="hero">
        <span className="eyebrow">Hub elettorale</span>
        <h1>Capire cosa sappiamo. E cosa manca.</h1>
        <p>
          Uno spazio per seguire dati e pronostici elettorali con fonti, tempi e
          limiti chiari. La prima sezione è in preparazione.
        </p>
      </div>
      <section className="content-section" aria-labelledby="countries-title">
        <h2 className="section-heading" id="countries-title">
          Paesi
        </h2>
        <div className="card-grid">
          {catalog.countries.map((country) => (
            <LinkCard
              key={country.id}
              href={catalog.countryPath(country)}
              eyebrow="Paese"
              title={country.name}
              description={country.description}
            />
          ))}
        </div>
      </section>
    </>
  );
}
