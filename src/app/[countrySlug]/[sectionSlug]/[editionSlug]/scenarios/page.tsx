import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  catalog,
  canonicalUrl,
  editionNavigation,
  midtermsScenariosPath,
} from "@/composition/catalog";
import {
  readPublicModelQuestions,
  readPublicPublishedModel,
} from "@/composition/observatory";
import { publicScenarioBasis } from "@/elections/model/public-scenario";
import {
  forecastOutcomeLabel,
  forecastQuestionLabel,
} from "@/platform/presentation/forecast";
import { Breadcrumbs } from "@/ui/patterns/breadcrumbs";
import { EditionNavigation } from "@/ui/patterns/edition-navigation";
import { DataNotice } from "@/ui/patterns/data-notice";
import { ScenarioCalculator } from "@/ui/patterns/scenario-calculator";

type Route = { countrySlug: string; sectionSlug: string; editionSlug: string };
type Props = {
  params: Promise<Route>;
  searchParams: Promise<{ question?: string | string[] }>;
};
const scope = {
  sectionId: "section:us:midterms",
  editionId: "edition:us:midterms:2026",
} as const;

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

export default async function ScenariosPage({ params, searchParams }: Props) {
  const { country, section, edition } = resolve(await params);
  const query = await searchParams;
  if (Array.isArray(query.question)) notFound();
  const questions = await readPublicModelQuestions(scope);
  if (
    query.question &&
    questions.status === "ready" &&
    !questions.value.some((item) => item.questionId === query.question)
  )
    notFound();
  const selected =
    query.question && questions.status === "ready"
      ? await readPublicPublishedModel(scope, query.question)
      : null;
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
        {questions.status !== "ready" ? (
          <DataNotice
            state={{
              status: questions.status === "error" ? "error" : "empty",
              message: questions.message,
            }}
          />
        ) : questions.value.length === 0 ? (
          <DataNotice
            state={{
              status: "empty",
              message:
                "Nessun run di modello sigillato e pubblicato è disponibile per questa edizione.",
            }}
          />
        ) : (
          <ul className="revision-list">
            {questions.value.map((question) => (
              <li key={question.questionId}>
                <h3>{forecastQuestionLabel(question.outcomeDefinition)}</h3>
                <p>
                  {question.state === "frozen"
                    ? "Previsione congelata"
                    : "Previsione corrente"}
                  {" · Modello "}
                  {question.modelStatus === "experimental"
                    ? "sperimentale"
                    : "validato"}
                </p>
                <p>
                  Pubblicata:{" "}
                  {new Intl.DateTimeFormat("it-IT", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Europe/Rome",
                  }).format(new Date(question.publishedAt))}
                </p>
                <Link href={`${path}?question=${question.questionId}`}>
                  Leggi il run pubblicato
                </Link>
              </li>
            ))}
          </ul>
        )}
        {selected?.status === "ready" && selected.value ? (
          <div className="content-section">
            <h3>Run {selected.value.publication.runSequence}</h3>
            <p>
              {selected.value.publication.state === "frozen"
                ? "Storico: domanda chiusa o archiviata"
                : "Domanda aperta"}
              {" · Modello "}
              {selected.value.proof.modelStatus === "experimental"
                ? "sperimentale"
                : "validato"}
            </p>
            <p>
              Input disponibili al {selected.value.publication.inputAsOf}.
              Versione modello {selected.value.proof.modelVersion}, parametri{" "}
              {selected.value.proof.parameterVersion}.
            </p>
            <ul>
              {selected.value.result.questionOutcomeProbabilities.map(
                (outcome) => (
                  <li key={outcome.outcomeId}>
                    {forecastOutcomeLabel(outcome.outcomeId)}: probabilità del
                    modello {(outcome.probability * 100).toFixed(1)}%
                  </li>
                ),
              )}
            </ul>
            <ScenarioCalculator
              key={selected.value.publication.runId}
              basis={publicScenarioBasis({
                publicationId: selected.value.publication.publicationId,
                runId: selected.value.publication.runId,
                readState: selected.value.publication.state,
                cutoffAt: selected.value.publication.cutoffAtPublication,
                snapshot: selected.value.snapshot,
                result: selected.value.result,
              })}
            />
          </div>
        ) : selected?.status === "error" ? (
          <DataNotice state={{ status: "error", message: selected.message }} />
        ) : null}
        <p className="section-intro">
          Uno scenario deriva da un run pubblicato identificato e non cambia la
          previsione. Un run sperimentale mantiene questa etichetta anche nei
          suoi scenari; una domanda congelata produce soltanto scenari storici.
        </p>
      </section>
    </>
  );
}
