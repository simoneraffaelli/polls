import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  catalog,
  canonicalUrl,
  editionNavigation,
  midtermsScenariosPath,
} from "@/composition/catalog";
import { Breadcrumbs } from "@/ui/patterns/breadcrumbs";
import { EditionNavigation } from "@/ui/patterns/edition-navigation";
import { DataNotice } from "@/ui/patterns/data-notice";

type Route = { countrySlug: string; sectionSlug: string; editionSlug: string };
type Props = { params: Promise<Route> };

function resolve({ countrySlug, sectionSlug, editionSlug }: Route) {
  const country = catalog.countryBySlug(countrySlug);
  const section = catalog.sectionBySlugs(countrySlug, sectionSlug);
  const edition = catalog.editionBySlugs(countrySlug, sectionSlug, editionSlug);
  if (
    !country ||
    !section ||
    !edition ||
    section.id !== "section:us:midterms" ||
    edition.id !== "edition:us:midterms:2026"
  )
    notFound();
  return { country, section, edition };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section, edition } = resolve(await params);
  return {
    title: `Scenari · ${section.name} ${edition.name}`,
    description:
      "Stato degli scenari dell'edizione e requisiti del modello pubblicato.",
    alternates: {
      canonical: canonicalUrl(midtermsScenariosPath(section, edition)),
    },
  };
}

export default async function ScenariosPage({ params }: Props) {
  const { country, section, edition } = resolve(await params);
  const path = midtermsScenariosPath(section, edition);
  return (
    <>
      <Breadcrumbs
        items={[
          ...catalog.breadcrumbs(country, section, edition),
          { label: "Scenari", href: path },
        ]}
      />
      <div className="hero hero--view">
        <span className="eyebrow">
          {section.name} · {edition.name}
        </span>
        <h1>Scenari</h1>
        <p>
          Variazioni limitate di una previsione identificata, senza cambiare il
          run pubblicato.
        </p>
      </div>
      <EditionNavigation
        items={editionNavigation(section, edition)}
        currentPath={catalog.editionPath(section, edition)}
      />
      <section className="content-section" aria-labelledby="scenario-status">
        <h2 className="section-heading" id="scenario-status">
          Disponibilità
        </h2>
        <DataNotice
          state={{
            status: "empty",
            message:
              "La lettura degli snapshot sigillati dei run pubblicati non è ancora collegata. Gli scenari non possono essere calcolati da dati incompleti o inventati.",
          }}
        />
        <p className="section-intro">
          La baseline è sperimentale. Ogni futuro scenario conserverà
          l’etichetta del modello di partenza e, dopo la chiusura della domanda,
          sarà indicato come storico.
        </p>
      </section>
    </>
  );
}

