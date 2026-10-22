import { midtermsSection } from "@/modules/usa/midterms/definition";
import {
  createCatalog,
  type EditionDefinition,
  type EditionViewDefinition,
  type SectionDefinition,
} from "@/platform/catalog";
import {
  HOUSE_2026_RACES,
  SENATE_2026_RACES,
} from "@/modules/usa/midterms/catalog-2026";
import { z } from "zod";

export const validPublicUuid = (value: string) =>
  z.uuid().safeParse(value).success;

const midtermsViews: readonly EditionViewDefinition[] = [
  {
    id: "view:us:midterms:2026:house",
    editionId: "edition:us:midterms:2026",
    slug: "house",
    name: "Camera",
    description: "Gare per la Camera dei rappresentanti nell'edizione 2026.",
    kind: "competition",
  },
  {
    id: "view:us:midterms:2026:senate",
    editionId: "edition:us:midterms:2026",
    slug: "senate",
    name: "Senato",
    description: "Gare per il Senato nell'edizione 2026.",
    kind: "competition",
  },
  {
    id: "view:us:midterms:2026:polls",
    editionId: "edition:us:midterms:2026",
    slug: "polls",
    name: "Sondaggi",
    description: "Intenzioni di voto, campioni e periodi osservati.",
    kind: "polls",
  },
  {
    id: "view:us:midterms:2026:news",
    editionId: "edition:us:midterms:2026",
    slug: "news",
    name: "Notizie",
    description: "Notizie attribuite alle fonti e ordinate per data.",
    kind: "news",
  },
  {
    id: "view:us:midterms:2026:sources",
    editionId: "edition:us:midterms:2026",
    slug: "sources",
    name: "Fonti e metodo",
    description: "Copertura, provenienza e limiti dei dati pubblicati.",
    kind: "methodology",
  },
];

export const catalog = createCatalog(
  [
    {
      id: "country:us",
      code: "US",
      slug: "usa",
      name: "USA",
      description: "Sezioni dedicate agli eventi negli Stati Uniti.",
    },
  ],
  [midtermsSection],
  midtermsViews,
);

export const siteOrigin = "https://polls.simone.ooo";

export const midtermsRaces = Object.freeze([
  ...HOUSE_2026_RACES,
  ...SENATE_2026_RACES,
]);

export function midtermsRaceBySlug(slug: string) {
  return midtermsRaces.find(
    (race) => `${race.chamberId}-${race.publicSlug}` === slug,
  );
}

export function midtermsRacePath(
  section: SectionDefinition,
  edition: EditionDefinition,
  race: (typeof midtermsRaces)[number],
) {
  if (
    section.id !== midtermsSection.id ||
    edition.id !== "edition:us:midterms:2026" ||
    !midtermsRaces.some((entry) => entry.id === race.id)
  )
    throw new Error("Unregistered Midterms race");
  return `${catalog.editionPath(section, edition)}/races/${race.chamberId}-${race.publicSlug}`;
}

export function midtermsScenariosPath(
  section: SectionDefinition,
  edition: EditionDefinition,
) {
  if (
    section.id !== midtermsSection.id ||
    edition.id !== "edition:us:midterms:2026"
  )
    throw new Error("Unregistered Midterms edition");
  return `${catalog.editionPath(section, edition)}/scenarios`;
}

export function midtermsPollHistoryPath(
  section: SectionDefinition,
  edition: EditionDefinition,
  pollId: string,
) {
  if (
    section.id !== midtermsSection.id ||
    edition.id !== "edition:us:midterms:2026" ||
    !validPublicUuid(pollId)
  )
    throw new Error("Invalid Midterms poll history reference");
  return `${catalog.editionPath(section, edition)}/polls/${pollId}`;
}

export function editionNavigation(
  section: typeof midtermsSection,
  edition: (typeof midtermsSection.editions)[number],
) {
  return [
    { href: catalog.editionPath(section, edition), label: "Panoramica" },
    ...catalog.viewsForEdition(section, edition).map((view) => ({
      href: catalog.viewPath(section, edition, view),
      label: view.name,
    })),
  ];
}

export function canonicalUrl(path: string): string {
  return new URL(path, siteOrigin).toString();
}
