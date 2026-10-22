import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  HOUSE_2026_RACES,
  MIDTERMS_2026_EDITION_ID,
  SENATE_2026_RACES,
} from "../modules/usa/midterms/catalog-2026";
import type { Database } from "../infrastructure/database/client";
import {
  configuredSources,
  countries,
  editions,
  providers,
  races,
  sections,
  sourceSectionBindings,
} from "../infrastructure/database/schema";

// RFC 4122 URL namespace; the semantic key is namespaced again for this product.
const URL_NAMESPACE = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");

export function stableCatalogUuid(semanticKey: string): string {
  if (!/^[a-z0-9:-]+$/.test(semanticKey))
    throw new Error("Invalid semantic catalogue key");
  const bytes = createHash("sha1")
    .update(URL_NAMESPACE)
    .update(`polls:${semanticKey}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const SOURCE_SEEDS = [
  {
    key: "source:votehub:generic-ballot:2026",
    providerId: "provider:votehub",
    family: "polls",
    providerName: "VoteHub",
    name: "VoteHub generic ballot 2026",
    attribution:
      "VoteHub, CC BY 4.0; collegamento alla fonte primaria del sondaggio",
    termsUrl: "https://votehub.com/polls/api/",
    licenseNote:
      "CC BY 4.0 dichiarata per i dati API; PDF esterni non ripubblicati",
    bindUsMidterms: true,
  },
  {
    key: "source:fed:press-all",
    providerId: "provider:federal-reserve-board",
    family: "articles",
    providerName: "Federal Reserve Board",
    name: "Federal Reserve monetary policy RSS",
    attribution: "Federal Reserve Board",
    termsUrl: "https://www.federalreserve.gov/feeds/feeds.htm",
    licenseNote: "Titoli e link del Board; nessun estratto o materiale terzo",
    bindUsMidterms: true,
  },
  {
    key: "source:polymarket:clob-book",
    providerId: "provider:polymarket",
    family: "markets",
    providerName: "Polymarket",
    name: "Polymarket CLOB book (unconfigured)",
    attribution: "Polymarket",
    termsUrl:
      "https://docs.polymarket.com/api-reference/market-data/get-order-book",
    licenseNote:
      "Diritti di visualizzazione e equivalenza non verificati; inattiva",
    bindUsMidterms: false,
  },
  {
    key: "source:manual-import:polls",
    providerId: "provider:manual-import",
    family: "polls",
    providerName: "Controlled manual import",
    name: "Controlled poll import",
    attribution: "Fonte originale dichiarata nel file importato",
    termsUrl: null,
    licenseNote:
      "Ogni file richiede provenance e diritti verificati prima del salvataggio",
    bindUsMidterms: true,
  },
] as const;

export const sourceIdFor = (key: (typeof SOURCE_SEEDS)[number]["key"]) =>
  stableCatalogUuid(key);

/** Idempotent structure and disabled source registry; never activates collection. */
export async function seedObservatoryStructure(db: Database): Promise<{
  raceCount: number;
  sourceIds: readonly string[];
}> {
  const raceSeeds = [...HOUSE_2026_RACES, ...SENATE_2026_RACES].map((race) => ({
    id: stableCatalogUuid(race.id),
    editionId: MIDTERMS_2026_EDITION_ID,
    slug: `${race.chamberId}-${race.publicSlug}`,
    name: `${race.chamberId === "house" ? "Camera" : "Senato"} ${race.stateCode}${race.chamberId === "house" ? `-${race.districtCode}` : ` (${race.senateClass})`}`,
    chamberCode: race.chamberId,
    territoryCode: race.stateCode,
  }));
  const sourceIds = SOURCE_SEEDS.map((source) => sourceIdFor(source.key));
  await db.transaction(async (tx) => {
    await tx
      .insert(countries)
      .values([
        { id: "country:us", code: "US", slug: "usa", name: "USA" },
        { id: "country:it", code: "IT", slug: "italy", name: "Italia" },
      ])
      .onConflictDoNothing();
    await tx
      .insert(sections)
      .values({
        id: "section:us:midterms",
        countryId: "country:us",
        slug: "midterms",
        name: "Midterms",
      })
      .onConflictDoNothing();
    await tx
      .insert(editions)
      .values({
        id: MIDTERMS_2026_EDITION_ID,
        sectionId: "section:us:midterms",
        slug: "2026",
        name: "2026",
      })
      .onConflictDoNothing();
    await tx.insert(races).values(raceSeeds).onConflictDoNothing();
    await tx
      .insert(providers)
      .values(
        SOURCE_SEEDS.map((source) => ({
          id: source.providerId,
          family: source.family,
          name: source.providerName,
        })),
      )
      .onConflictDoNothing();
    await tx
      .insert(configuredSources)
      .values(
        SOURCE_SEEDS.map((source) => ({
          id: sourceIdFor(source.key),
          providerId: source.providerId,
          name: source.name,
          enabled: false,
          attribution: source.attribution,
          termsUrl: source.termsUrl,
          licenseNote: source.licenseNote,
        })),
      )
      .onConflictDoNothing();
    await tx
      .insert(sourceSectionBindings)
      .values(
        SOURCE_SEEDS.filter((source) => source.bindUsMidterms).map(
          (source) => ({
            sourceId: sourceIdFor(source.key),
            sectionId: "section:us:midterms",
            enabled: false,
          }),
        ),
      )
      .onConflictDoNothing();
    const persisted = await tx
      .select({ id: races.id, slug: races.slug })
      .from(races)
      .where(eq(races.editionId, MIDTERMS_2026_EDITION_ID));
    const byId = new Map(persisted.map((race) => [race.id, race.slug]));
    for (const race of raceSeeds) {
      if (byId.get(race.id) !== race.slug)
        throw new Error("Catalog seed conflicts with persisted race identity");
    }
    const persistedSources = await tx
      .select({
        id: configuredSources.id,
        providerId: configuredSources.providerId,
      })
      .from(configuredSources);
    const providerById = new Map(
      persistedSources.map((source) => [source.id, source.providerId]),
    );
    for (const source of SOURCE_SEEDS) {
      if (providerById.get(sourceIdFor(source.key)) !== source.providerId)
        throw new Error(
          "Source seed conflicts with persisted provider identity",
        );
    }
  });
  return { raceCount: raceSeeds.length, sourceIds };
}
