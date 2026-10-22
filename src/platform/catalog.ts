/** Public routes and internal identities are separate by design. */
export type CountryDefinition = Readonly<{
  id: string;
  code: string;
  slug: string;
  name: string;
  description: string;
}>;

export type EditionDefinition = Readonly<{
  id: string;
  slug: string;
  name: string;
  description: string;
}>;

export type SectionDefinition = Readonly<{
  id: string;
  countryId: string;
  slug: string;
  name: string;
  description: string;
  editions: readonly EditionDefinition[];
  currentEditionId: string;
}>;

export type Breadcrumb = Readonly<{ label: string; href: string }>;
export const homePath = "/";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const reservedSegments = new Set([
  "admin",
  "api",
  "_next",
  "sources",
  "races",
  "polls",
  "news",
  "scenarios",
  "methodology",
  "house",
  "senate",
]);

function checkSlug(slug: string, kind: string): void {
  if (!slugPattern.test(slug) || reservedSegments.has(slug)) {
    throw new Error(`Invalid or reserved ${kind} slug: ${slug}`);
  }
}

function unique(value: string, seen: Set<string>, kind: string): void {
  if (seen.has(value)) throw new Error(`Duplicate ${kind}: ${value}`);
  seen.add(value);
}

/** Validates registration once; readers use immutable definitions and local indexes. */
export function createCatalog(
  countries: readonly CountryDefinition[],
  sections: readonly SectionDefinition[],
) {
  const countryIds = new Set<string>();
  const countrySlugs = new Set<string>();
  const countryCodes = new Set<string>();
  const sectionIds = new Set<string>();
  const editionIds = new Set<string>();
  const countriesById = new Map<string, CountryDefinition>();
  const countriesBySlug = new Map<string, CountryDefinition>();
  const sectionsById = new Map<string, SectionDefinition>();
  const sectionsByCountry = new Map<string, SectionDefinition[]>();
  const sectionsByRoute = new Map<string, SectionDefinition>();

  for (const input of countries) {
    if (
      !input.id ||
      !input.name ||
      !input.description ||
      !/^[A-Z]{2}$/.test(input.code)
    ) {
      throw new Error(`Invalid country definition: ${input.id}`);
    }
    checkSlug(input.slug, "country");
    unique(input.id, countryIds, "country id");
    unique(input.code, countryCodes, "country code");
    unique(input.slug, countrySlugs, "country slug");
    const country = Object.freeze({ ...input });
    countriesById.set(country.id, country);
    countriesBySlug.set(country.slug, country);
    sectionsByCountry.set(country.id, []);
  }

  for (const input of sections) {
    const country = countriesById.get(input.countryId);
    if (!country)
      throw new Error(`Unknown country reference: ${input.countryId}`);
    if (!input.id || !input.name || !input.description) {
      throw new Error(`Invalid section definition: ${input.id}`);
    }
    checkSlug(input.slug, "section");
    unique(input.id, sectionIds, "section id");
    const routeKey = `${country.id}:${input.slug}`;
    if (sectionsByRoute.has(routeKey))
      throw new Error(
        `Duplicate section slug in ${country.slug}: ${input.slug}`,
      );

    const editionSlugs = new Set<string>();
    const frozenEditions = input.editions.map((edition) => {
      if (!edition.id || !edition.name || !edition.description) {
        throw new Error(`Invalid edition definition: ${edition.id}`);
      }
      checkSlug(edition.slug, "edition");
      unique(edition.id, editionIds, "edition id");
      unique(edition.slug, editionSlugs, "edition slug");
      return Object.freeze({ ...edition });
    });
    if (
      !frozenEditions.some((edition) => edition.id === input.currentEditionId)
    ) {
      throw new Error(
        `Unknown current edition reference: ${input.currentEditionId}`,
      );
    }
    const section = Object.freeze({
      ...input,
      editions: Object.freeze(frozenEditions),
    });
    sectionsById.set(section.id, section);
    sectionsByRoute.set(routeKey, section);
    sectionsByCountry.get(country.id)!.push(section);
  }

  const registeredCountries = Object.freeze([...countriesById.values()]);
  const registeredSectionsByCountry = new Map(
    [...sectionsByCountry].map(([id, entries]) => [
      id,
      Object.freeze([...entries]),
    ]),
  );

  const countryBySlug = (slug: string) => countriesBySlug.get(slug);
  const sectionBySlugs = (countrySlug: string, sectionSlug: string) => {
    const country = countryBySlug(countrySlug);
    return country
      ? sectionsByRoute.get(`${country.id}:${sectionSlug}`)
      : undefined;
  };
  const editionBySlugs = (
    countrySlug: string,
    sectionSlug: string,
    editionSlug: string,
  ) =>
    sectionBySlugs(countrySlug, sectionSlug)?.editions.find(
      (edition) => edition.slug === editionSlug,
    );

  const registeredCountry = (country: CountryDefinition) => {
    const registered = countriesById.get(country.id);
    if (
      !registered ||
      registered.code !== country.code ||
      registered.slug !== country.slug
    ) {
      throw new Error(`Unregistered country: ${country.id}`);
    }
    return registered;
  };
  const registeredSection = (section: SectionDefinition) => {
    const registered = sectionsById.get(section.id);
    if (
      !registered ||
      registered.countryId !== section.countryId ||
      registered.slug !== section.slug
    ) {
      throw new Error(`Unregistered section: ${section.id}`);
    }
    return registered;
  };
  const countryPath = (country: CountryDefinition) =>
    `/${registeredCountry(country).slug}`;
  const sectionPath = (section: SectionDefinition) => {
    const registered = registeredSection(section);
    const country = countriesById.get(registered.countryId)!;
    return `${countryPath(country)}/${registered.slug}`;
  };
  const editionPath = (
    section: SectionDefinition,
    edition: EditionDefinition,
  ) => {
    const registered = registeredSection(section);
    const registeredEdition = registered.editions.find(
      (entry) => entry.id === edition.id && entry.slug === edition.slug,
    );
    if (!registeredEdition) {
      throw new Error(`Unregistered edition: ${edition.id}`);
    }
    return `${sectionPath(registered)}/${registeredEdition.slug}`;
  };
  const breadcrumbs = (
    country?: CountryDefinition,
    section?: SectionDefinition,
    edition?: EditionDefinition,
  ): readonly Breadcrumb[] => {
    if (section && !country)
      throw new Error("Section breadcrumb requires a country");
    if (edition && !section)
      throw new Error("Edition breadcrumb requires a section");
    const registered = country && registeredCountry(country);
    const registeredSectionValue = section && registeredSection(section);
    if (
      registered &&
      registeredSectionValue &&
      registeredSectionValue.countryId !== registered.id
    ) {
      throw new Error(
        `Section ${registeredSectionValue.id} does not belong to country ${registered.id}`,
      );
    }
    const items: Breadcrumb[] = [{ label: "Home", href: homePath }];
    if (registered)
      items.push({ label: registered.name, href: countryPath(registered) });
    if (registeredSectionValue)
      items.push({
        label: registeredSectionValue.name,
        href: sectionPath(registeredSectionValue),
      });
    if (registeredSectionValue && edition) {
      const href = editionPath(registeredSectionValue, edition);
      const registeredEdition = registeredSectionValue.editions.find(
        (entry) => entry.id === edition.id,
      )!;
      items.push({ label: registeredEdition.name, href });
    }
    return Object.freeze(items);
  };

  return Object.freeze({
    countries: registeredCountries,
    countryBySlug,
    sectionsForCountry: (country: CountryDefinition) =>
      registeredSectionsByCountry.get(registeredCountry(country).id) ?? [],
    sectionBySlugs,
    editionBySlugs,
    countryPath,
    sectionPath,
    editionPath,
    breadcrumbs,
  });
}
