import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  catalog,
  canonicalUrl,
  editionNavigation,
  midtermsPollHistoryPath,
  validPublicUuid,
} from "@/composition/catalog";
import {
  parsePublicAsOf,
  parsePublicOffset,
  readPublicPollEditorialHistory,
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
    !validPublicUuid(pollId)
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
  const [history, decisions] = await Promise.all([
    readPublicPollHistory(scope, pollId, asOf, offset),
    readPublicPollEditorialHistory(scope, pollId, asOf),
  ]);
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
      <section
        className="content-section"
        aria-labelledby="editorial-history-title"
      >
        <h2 className="section-heading" id="editorial-history-title">
          Decisioni di collegamento e uso futuro
        </h2>
        {decisions.status === "ready" ? (
          decisions.value.items.length > 0 ? (
            <ol className="revision-list">
              {decisions.value.items.map((item) => (
                <li key={item.id}>
                  <p>
                    {item.kind === "association"
                      ? item.value
                        ? "Collegamento incluso nella vista corrente"
                        : "Collegamento escluso dalla vista corrente"
                      : item.value
                        ? "Sondaggio escluso dai nuovi calcoli previsionali"
                        : "Sondaggio riammesso ai nuovi calcoli previsionali"}
                  </p>
                  <time dateTime={item.recordedAt}>
                    {new Intl.DateTimeFormat("it-IT", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Europe/Rome",
                    }).format(new Date(item.recordedAt))}
                  </time>
                </li>
              ))}
            </ol>
          ) : (
            <p>Nessuna decisione editoriale registrata entro questa data.</p>
          )
        ) : (
          <DataNotice
            state={{
              status: decisions.status === "error" ? "error" : "empty",
              message: decisions.message,
            }}
          />
        )}
        {decisions.status === "ready" && decisions.value.hasMore ? (
          <p>
            La cronologia mostrata è limitata alle cento decisioni più recenti.
          </p>
        ) : null}
      </section>
    </>
  );
}
