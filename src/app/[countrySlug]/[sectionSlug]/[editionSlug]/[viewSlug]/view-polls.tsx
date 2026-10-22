import Link from "next/link";
import { notFound } from "next/navigation";
import { calendarDateSchema } from "@/platform/data/primitives";
import {
  midtermsPollHistoryPath,
  validPublicUuid,
} from "@/composition/catalog";
import {
  publicPollFreshnessMinutes,
  readPublicPolls,
} from "@/composition/observatory";
import {
  comparablePollSeries,
  pollRows,
} from "@/platform/presentation/observatory";
import type {
  Availability,
  PollRow,
  SeriesPoint,
} from "@/platform/presentation/models";
import { PollTable } from "@/ui/patterns/poll-table";
import { TimeSeriesChart } from "@/ui/patterns/time-series-chart";
import {
  one,
  queryPath,
  scope,
  type Edition,
  type Query,
  type Section,
  type SourcesRead,
} from "./view-shared";

function parsePollFilters(query: Query) {
  const sourceId = one(query.source);
  const populationKind = one(query.population);
  const fromDate = one(query.from);
  const toDate = one(query.to);
  const race = one(query.race);
  if (
    (sourceId && !validPublicUuid(sourceId)) ||
    (populationKind &&
      !["likely_voters", "registered_voters", "adults", "other"].includes(
        populationKind,
      )) ||
    (fromDate && !calendarDateSchema.safeParse(fromDate).success) ||
    (toDate && !calendarDateSchema.safeParse(toDate).success) ||
    (fromDate && toDate && fromDate > toDate) ||
    (race && race !== "national")
  )
    notFound();
  return { sourceId, populationKind, fromDate, toDate, race };
}

type PollFilters = ReturnType<typeof parsePollFilters>;

function PollFilterForm({
  path,
  asOf,
  sources,
  filters,
}: {
  path: string;
  asOf: string;
  sources: SourcesRead;
  filters: PollFilters;
}) {
  return (
    <form
      className="filter-form"
      method="get"
      action={path}
      aria-label="Filtra i sondaggi"
    >
      <input type="hidden" name="asOf" value={asOf} />
      <label>
        Fonte
        <select name="source" defaultValue={filters.sourceId ?? ""}>
          <option value="">Tutte</option>
          {sources.status === "ready"
            ? sources.value.items
                .filter((item) => item.family === "polls")
                .map((item) => (
                  <option key={item.source.id} value={item.source.id}>
                    {item.source.name}
                  </option>
                ))
            : null}
        </select>
      </label>
      <label>
        Popolazione
        <select name="population" defaultValue={filters.populationKind ?? ""}>
          <option value="">Tutte</option>
          <option value="likely_voters">Elettori probabili</option>
          <option value="registered_voters">Elettori registrati</option>
          <option value="adults">Adulti</option>
          <option value="other">Altra</option>
        </select>
      </label>
      <label>
        Gara
        <select name="race" defaultValue={filters.race ?? ""}>
          <option value="">Tutte</option>
          <option value="national">Solo sondaggi nazionali</option>
        </select>
      </label>
      <label>
        Dal
        <input type="date" name="from" defaultValue={filters.fromDate ?? ""} />
      </label>
      <label>
        Al
        <input type="date" name="to" defaultValue={filters.toDate ?? ""} />
      </label>
      <button type="submit">Applica filtri</button>
    </form>
  );
}

function PollPageLink({
  polls,
  path,
  asOf,
  filters,
}: {
  polls: Awaited<ReturnType<typeof readPublicPolls>>;
  path: string;
  asOf: string;
  filters: PollFilters;
}) {
  if (
    polls.status !== "ready" ||
    !polls.value.hasMore ||
    polls.value.nextOffset === null
  )
    return null;
  return (
    <Link
      className="page-link"
      href={queryPath(path, {
        asOf,
        offset: polls.value.nextOffset,
        source: filters.sourceId,
        population: filters.populationKind,
        from: filters.fromDate,
        to: filters.toDate,
        race: filters.race,
      })}
    >
      Altri sondaggi
    </Link>
  );
}

export async function PollsView({
  section,
  edition,
  path,
  asOf,
  offset,
  query,
  sources,
}: {
  section: Section;
  edition: Edition;
  path: string;
  asOf: string;
  offset: number;
  query: Query;
  sources: SourcesRead;
}) {
  const { sourceId, populationKind, fromDate, toDate, race } =
    parsePollFilters(query);
  const filters = { sourceId, populationKind, fromDate, toDate, race };
  const polls = await readPublicPolls({
    scope,
    asOf,
    offset,
    limit: 25,
    staleAfterMinutes: publicPollFreshnessMinutes,
    ...(sourceId ? { sourceId } : {}),
    ...(populationKind ? { populationKind } : {}),
    ...(fromDate ? { fromDate } : {}),
    ...(toDate ? { toDate } : {}),
    ...(race === "national" ? { raceId: null } : {}),
  });
  const tableState: Availability<readonly PollRow[]> =
    polls.status === "ready"
      ? {
          status: "ready",
          value: pollRows(
            polls.value.items,
            (id) =>
              `${midtermsPollHistoryPath(section, edition, id)}?asOf=${encodeURIComponent(asOf)}`,
          ),
        }
      : {
          status: polls.status === "error" ? "error" : "empty",
          message: polls.message,
        };
  const series =
    polls.status === "ready" ? comparablePollSeries(polls.value.items) : [];
  const seriesState: Availability<readonly SeriesPoint[]> = series.length
    ? { status: "ready", value: series }
    : {
        status: "empty",
        message:
          "Non ci sono ancora almeno due rilevazioni con domanda, popolazione, esito e gara identici nella pagina corrente.",
      };
  return (
    <>
      <section className="content-section" aria-labelledby="polls-title">
        <h2 className="section-heading" id="polls-title">
          Sondaggi acquisiti
        </h2>
        <p className="section-intro">
          Le percentuali misurano risposte nel campione, non probabilità di
          vittoria. Periodo osservato e acquisizione sono distinti.
        </p>
        <PollFilterForm
          path={path}
          asOf={asOf}
          sources={sources}
          filters={filters}
        />
        <PollTable state={tableState} />
        <PollPageLink polls={polls} path={path} asOf={asOf} filters={filters} />
        {polls.status === "ready" && polls.value.truncated ? (
          <p>
            Il limite di consultazione è stato raggiunto: restringi i filtri.
          </p>
        ) : null}
      </section>
      <section className="content-section" aria-labelledby="trend-title">
        <h2 className="section-heading" id="trend-title">
          Serie descrittiva comparabile
        </h2>
        <TimeSeriesChart
          title="Intenzioni di voto"
          unit="Percentuale del campione"
          state={seriesState}
        />
        {series.length ? (
          <p className="section-intro">
            La serie usa soltanto gli studi della pagina corrente (massimo 25);
            non rappresenta l’intero archivio.
          </p>
        ) : null}
      </section>
    </>
  );
}
