import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  catalog,
  canonicalUrl,
  editionNavigation,
  midtermsPollHistoryPath,
} from "@/composition/catalog";
import {
  parsePublicAsOf,
  parsePublicOffset,
  readPublicPollHistory,
} from "@/composition/observatory";
import { Breadcrumbs } from "@/ui/patterns/breadcrumbs";
import { EditionNavigation } from "@/ui/patterns/edition-navigation";
import { DataNotice } from "@/ui/patterns/data-notice";

type Route = {
  countrySlug: string;
  sectionSlug: string;
  editionSlug: string;
  pollId: string;
};
type Props = {
  params: Promise<Route>;
  searchParams: Promise<{
    asOf?: string | string[];
    offset?: string | string[];
  }>;
};
const scope = {
  sectionId: "section:us:midterms",
  editionId: "edition:us:midterms:2026",
} as const;

function resolve({ countrySlug, sectionSlug, editionSlug, pollId }: Route) {
  const country = catalog.countryBySlug(countrySlug);
  const section = catalog.sectionBySlugs(countrySlug, sectionSlug);
  const edition = catalog.editionBySlugs(countrySlug, sectionSlug, editionSlug);
  if (
    !country ||
    !section ||
    !edition ||
    section.id !== scope.sectionId ||
    edition.id !== scope.editionId ||
    !/^[a-f0-9-]{36}$/.test(pollId)
  )
    notFound();
  return { country, section, edition, pollId };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section, edition, pollId } = resolve(await params);
  return {
    title: `Revisioni del sondaggio · ${section.name} ${edition.name}`,
    alternates: {
      canonical: canonicalUrl(
        midtermsPollHistoryPath(section, edition, pollId),
      ),
    },
  };
}

export default async function PollHistoryPage({ params, searchParams }: Props) {
  const { country, section, edition, pollId } = resolve(await params);
  const query = await searchParams;
  const asOf = parsePublicAsOf(
    typeof query.asOf === "string" ? query.asOf : undefined,
  );
  const offset = parsePublicOffset(
    typeof query.offset === "string" ? query.offset : undefined,
  );
  if (!asOf || offset === null) notFound();
  const history = await readPublicPollHistory(scope, pollId, asOf, offset);
  if (
    history.status === "ready" &&
    history.value.items.length === 0 &&
    offset === 0
  )
    notFound();
  const path = midtermsPollHistoryPath(section, edition, pollId);
  const pollView = catalog
    .viewsForEdition(section, edition)
    .find((view) => view.id === "view:us:midterms:2026:polls")!;
  return (
    <>
      <Breadcrumbs
        items={[
          ...catalog.breadcrumbs(country, section, edition, pollView),
          { label: "Revisioni", href: path },
        ]}
      />
      <div className="hero hero--view">
        <span className="eyebrow">Provenienza dei dati</span>
        <h1>Revisioni del sondaggio</h1>
        <p>
          Ogni correzione mantiene una nuova revisione. I run pubblicati restano
          associati alle revisioni usate allora.
        </p>
      </div>
      <EditionNavigation
        items={editionNavigation(section, edition)}
        currentPath={catalog.viewPath(section, edition, pollView)}
      />
      <section className="content-section" aria-labelledby="history-title">
        <h2 className="section-heading" id="history-title">
          Cronologia acquisita
        </h2>
        {history.status === "ready" ? (
          <ol className="revision-list">
            {history.value.items.map((item) => (
              <li key={item.revisionId}>
                <h3>Revisione {item.revisionNo}</h3>
                <p>
                  Periodo osservato: {item.fieldworkStart} – {item.fieldworkEnd}
                </p>
                <p>
                  Acquisita:{" "}
                  <time dateTime={item.acquiredAt}>
                    {new Intl.DateTimeFormat("it-IT", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Europe/Rome",
                    }).format(new Date(item.acquiredAt))}
                  </time>
                </p>
                <p>Versione parser: {item.parserVersion}</p>
                {item.sourceRevision ? (
                  <p>Revisione dichiarata dalla fonte: {item.sourceRevision}</p>
                ) : null}
                <p className="revision-hash">
                  Impronta contenuto: <code>{item.contentHash}</code>
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <DataNotice
            state={{
              status: history.status === "error" ? "error" : "empty",
              message: history.message,
            }}
          />
        )}
        {history.status === "ready" &&
        history.value.hasMore &&
        history.value.nextOffset !== null ? (
          <Link
            className="page-link"
            href={`${path}?asOf=${encodeURIComponent(asOf)}&offset=${history.value.nextOffset}`}
          >
            Revisioni precedenti
          </Link>
        ) : null}
      </section>
    </>
  );
}

