import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  catalog,
  canonicalUrl,
  editionNavigation,
} from "@/composition/catalog";
import { Breadcrumbs } from "@/ui/patterns/breadcrumbs";
import { EditionNavigation } from "@/ui/patterns/edition-navigation";
import { FreshnessBadge } from "@/ui/patterns/freshness-badge";
import { MetricCard } from "@/ui/patterns/metric-card";
import { ProbabilityCard } from "@/ui/patterns/probability-card";
import { PollTable } from "@/ui/patterns/poll-table";
import { NewsList } from "@/ui/patterns/news-list";
import { TimeSeriesChart } from "@/ui/patterns/time-series-chart";
import { DistributionChart } from "@/ui/patterns/distribution-chart";

type Props = {
  params: Promise<{
    countrySlug: string;
    sectionSlug: string;
    editionSlug: string;
    viewSlug: string;
  }>;
};

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

export default async function EditionViewPage({ params }: Props) {
  const { countrySlug, sectionSlug, editionSlug, viewSlug } = await params;
  const country = catalog.countryBySlug(countrySlug);
  const section = catalog.sectionBySlugs(countrySlug, sectionSlug);
  const edition = catalog.editionBySlugs(countrySlug, sectionSlug, editionSlug);
  const view = catalog.viewBySlugs(
    countrySlug,
    sectionSlug,
    editionSlug,
    viewSlug,
  );
  if (!country || !section || !edition || !view) notFound();
  const path = catalog.viewPath(section, edition, view);
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
        <span className="eyebrow">Stato dei dati</span>
        <FreshnessBadge
          freshness={{ state: "unavailable", acquiredAt: null }}
        />
      </div>
      {view.kind === "competition" ? (
        <>
          <section className="content-section" aria-labelledby="races-title">
            <h2 className="section-heading" id="races-title">
              Gare e pronostici
            </h2>
            <p className="section-intro">
              Le gare saranno mostrate con la propria domanda previsionale, il
              termine di pubblicazione e le fonti disponibili. Una probabilità
              non equivale a un’intenzione di voto.
            </p>
            <div className="metric-grid">
              <MetricCard
                title="Gare coperte"
                state={{
                  status: "empty",
                  message: "Nessuna gara acquisita per questa camera.",
                }}
              />
              <ProbabilityCard
                state={{
                  status: "empty",
                  message: "Nessuna previsione pubblicata per questa camera.",
                }}
              />
            </div>
          </section>
          <section
            className="content-section"
            aria-labelledby="distribution-title"
          >
            <h2 className="section-heading" id="distribution-title">
              Distribuzione dei seggi
            </h2>
            <DistributionChart
              title="Scenari di seggi"
              unit="Seggi"
              state={{
                status: "empty",
                message:
                  "Serve un modello pubblicato e verificato prima di mostrare una distribuzione.",
              }}
            />
          </section>
        </>
      ) : null}
      {view.kind === "polls" ? (
        <>
          <section className="content-section" aria-labelledby="polls-title">
            <h2 className="section-heading" id="polls-title">
              Sondaggi acquisiti
            </h2>
            <p className="section-intro">
              Ogni studio distingue popolazione, campione, periodo osservato e
              fonte. Le percentuali dei sondaggi non sono probabilità di
              vittoria.
            </p>
            <PollTable
              state={{
                status: "empty",
                message:
                  "Non sono ancora disponibili sondaggi acquisiti e verificati per questa edizione.",
              }}
            />
          </section>
          <section className="content-section" aria-labelledby="trend-title">
            <h2 className="section-heading" id="trend-title">
              Andamento nel tempo
            </h2>
            <TimeSeriesChart
              title="Intenzioni di voto"
              unit="Percentuale del campione"
              state={{
                status: "empty",
                message:
                  "La serie richiede studi comparabili e date osservate.",
              }}
            />
          </section>
        </>
      ) : null}
      {view.kind === "news" ? (
        <section className="content-section" aria-labelledby="news-title">
          <h2 className="section-heading" id="news-title">
            Notizie dalle fonti
          </h2>
          <p className="section-intro">
            Le notizie aiutano a contestualizzare gli eventi; il loro tono non
            misura automaticamente l’opinione degli elettori.
          </p>
          <NewsList
            state={{
              status: "empty",
              message:
                "Nessuna notizia acquisita e autorizzata alla ripubblicazione.",
            }}
          />
        </section>
      ) : null}
      {view.kind === "methodology" ? (
        <section className="content-section" aria-labelledby="sources-title">
          <h2 className="section-heading" id="sources-title">
            Provenienza e metodo
          </h2>
          <div className="method-grid">
            <article>
              <span className="eyebrow">01 · Copertura</span>
              <h3>Prima la verifica delle fonti</h3>
              <p>
                Una fonte tecnicamente accessibile non è automaticamente
                associata a questa edizione. Copertura delle gare, condizioni
                d’uso e attribuzione sono ancora in verifica.
              </p>
            </article>
            <article>
              <span className="eyebrow">02 · Misure</span>
              <h3>Misure diverse restano distinte</h3>
              <p>
                Intenzioni di voto, probabilità del modello, prezzi di mercato e
                notizie hanno significati diversi. Compariranno con etichette,
                tempi e provenienza propri.
              </p>
            </article>
            <article>
              <span className="eyebrow">03 · Revisioni</span>
              <h3>Lo storico rimane leggibile</h3>
              <p>
                Una rettifica produce una nuova revisione. Le previsioni
                pubblicate restano collegate agli input usati al momento del
                calcolo.
              </p>
            </article>
          </div>
          <div className="data-notice">
            <strong>Nessuna fonte attiva per la pagina</strong>
            <p>
              Le attribuzioni saranno visibili insieme ai dati acquisiti, non
              prima.
            </p>
          </div>
        </section>
      ) : null}
    </>
  );
}
