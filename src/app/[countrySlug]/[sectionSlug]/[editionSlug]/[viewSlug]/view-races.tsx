import Link from "next/link";
import {
  midtermsRacePath,
  midtermsRaces,
  midtermsScenariosPath,
} from "@/composition/catalog";
import { readPublicForecastCards } from "@/composition/observatory";
import { MetricCard } from "@/ui/patterns/metric-card";
import { PublishedForecastList } from "@/ui/patterns/published-forecast";
import { queryPath, scope, type Edition, type Section } from "./view-shared";

export async function RacesView({
  section,
  edition,
  path,
  asOf,
  offset,
  chamber,
}: {
  section: Section;
  edition: Edition;
  path: string;
  asOf: string;
  offset: number;
  chamber: "house" | "senate";
}) {
  const races = midtermsRaces.filter((race) => race.chamberId === chamber);
  const forecasts = await readPublicForecastCards(scope);
  const pageSize = 40;
  const visible = races.slice(offset, offset + pageSize);
  return (
    <section className="content-section" aria-labelledby="races-title">
      <h2 className="section-heading" id="races-title">
        Gare strutturali
      </h2>
      <p className="section-intro">
        Il catalogo elenca {races.length} seggi previsti nel perimetro
        strutturale. Candidature, mappa e regole di risoluzione delle singole
        gare richiedono ancora verifica; il catalogo non è una previsione.
      </p>
      <div className="metric-grid">
        <MetricCard
          title="Seggi nel catalogo"
          state={{
            status: "ready",
            value: {
              kind: "seat_count",
              label: "Seggi strutturali",
              valueText: String(races.length),
              detail: "Candidature non verificate",
            },
          }}
        />
      </div>
      <ul className="race-list">
        {visible.map((race) => (
          <li key={race.id}>
            <Link href={midtermsRacePath(section, edition, race)}>
              {chamber === "house"
                ? `Camera ${race.stateCode}-${"districtCode" in race ? race.districtCode : ""}`
                : `Senato ${race.stateCode} · classe ${"senateClass" in race ? race.senateClass : ""}`}
            </Link>
            <span> Candidature da verificare</span>
          </li>
        ))}
      </ul>
      {offset > 0 ? (
        <Link
          href={queryPath(path, {
            asOf,
            offset: Math.max(0, offset - pageSize),
          })}
        >
          Gare precedenti
        </Link>
      ) : null}
      {offset + pageSize < races.length ? (
        <Link href={queryPath(path, { asOf, offset: offset + pageSize })}>
          Gare successive
        </Link>
      ) : null}
      <p>
        I run previsionali pubblicati sono consultabili nella pagina dedicata,
        separati dal catalogo strutturale delle gare.
      </p>
      <Link href={midtermsScenariosPath(section, edition)}>
        Consulta run e scenari
      </Link>
      <h3>Previsioni pubblicate per questa camera</h3>
      <PublishedForecastList
        state={
          forecasts.status === "ready"
            ? {
                status: "ready",
                value: forecasts.value.filter(
                  (card) => card.chamber === chamber,
                ),
              }
            : {
                status: forecasts.status === "error" ? "error" : "empty",
                message: forecasts.message,
              }
        }
        scenarioPath={midtermsScenariosPath(section, edition)}
      />
    </section>
  );
}
