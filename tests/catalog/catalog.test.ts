import { describe, expect, it } from "vitest";
import {
  createCatalog,
  type CountryDefinition,
  type SectionDefinition,
} from "../../src/platform/catalog";

const countries: CountryDefinition[] = [
  {
    id: "country:us",
    code: "US",
    slug: "usa",
    name: "USA",
    description: "Stati Uniti",
  },
  {
    id: "country:it",
    code: "IT",
    slug: "italy",
    name: "Italia",
    description: "Italia",
  },
];

const section = (countryId: string, id: string): SectionDefinition => ({
  id,
  countryId,
  slug: "elections",
  name: "Elezioni",
  description: "Sezione di prova",
  currentEditionId: `${id}:2026`,
  editions: [
    {
      id: `${id}:2026`,
      slug: "2026",
      name: "2026",
      description: "Edizione di prova",
    },
  ],
});

describe("catalog registration and routing", () => {
  it("keeps equal local slugs isolated by country and builds their own paths", () => {
    const catalog = createCatalog(countries, [
      section("country:us", "section:us:elections"),
      section("country:it", "section:it:elections"),
    ]);
    const us = catalog.sectionBySlugs("usa", "elections")!;
    const it = catalog.sectionBySlugs("italy", "elections")!;

    expect(catalog.sectionPath(us)).toBe("/usa/elections");
    expect(catalog.sectionPath(it)).toBe("/italy/elections");
    expect(catalog.editionPath(us, us.editions[0])).toBe("/usa/elections/2026");
    expect(catalog.editionPath(it, it.editions[0])).toBe(
      "/italy/elections/2026",
    );
    expect(
      catalog
        .breadcrumbs(countries[1], it, it.editions[0])
        .map(({ href }) => href),
    ).toEqual(["/", "/italy", "/italy/elections", "/italy/elections/2026"]);
    expect(catalog.sectionBySlugs("usa", "missing")).toBeUndefined();
  });

  it("rejects broken references, duplicate editions and route collisions", () => {
    expect(() =>
      createCatalog(countries, [section("country:missing", "section:missing")]),
    ).toThrow(/Unknown country reference/);
    expect(() =>
      createCatalog(countries, [
        section("country:us", "one"),
        section("country:us", "two"),
      ]),
    ).toThrow(/Duplicate section slug/);
    expect(() =>
      createCatalog(countries, [
        { ...section("country:us", "one"), currentEditionId: "missing" },
      ]),
    ).toThrow(/Unknown current edition/);
    expect(() =>
      createCatalog(countries, [
        {
          ...section("country:us", "one"),
          editions: [
            {
              id: "one:2026",
              slug: "2026",
              name: "2026",
              description: "Prima",
            },
            {
              id: "one:2027",
              slug: "2026",
              name: "2027",
              description: "Seconda",
            },
          ],
        },
      ]),
    ).toThrow(/Duplicate edition slug/);
  });

  it("rejects invalid or reserved public segments", () => {
    expect(() =>
      createCatalog([{ ...countries[0], slug: "admin" }], []),
    ).toThrow(/reserved country slug/);
    expect(() => createCatalog([{ ...countries[0], slug: "USA" }], [])).toThrow(
      /country slug/,
    );
    expect(() =>
      createCatalog(countries, [
        { ...section("country:us", "one"), slug: "api" },
      ]),
    ).toThrow(/reserved section slug/);
    expect(() =>
      createCatalog(countries, [
        {
          ...section("country:us", "one"),
          editions: [
            {
              id: "one:2026",
              slug: "news",
              name: "2026",
              description: "Edizione",
            },
          ],
        },
      ]),
    ).toThrow(/reserved edition slug/);
  });

  it("rejects forged hierarchy objects and never derives URLs from altered input", () => {
    const catalog = createCatalog(countries, [
      section("country:us", "section:us:elections"),
      section("country:it", "section:it:elections"),
    ]);
    const us = catalog.sectionBySlugs("usa", "elections")!;
    const it = catalog.sectionBySlugs("italy", "elections")!;

    expect(() =>
      catalog.countryPath({ ...countries[0], slug: "altered" }),
    ).toThrow(/Unregistered country/);
    expect(() => catalog.sectionPath({ ...us, slug: "altered" })).toThrow(
      /Unregistered section/,
    );
    expect(() =>
      catalog.editionPath(
        {
          ...us,
          editions: [
            ...us.editions,
            { id: "forged", slug: "2030", name: "2030", description: "Forged" },
          ],
        },
        { id: "forged", slug: "2030", name: "2030", description: "Forged" },
      ),
    ).toThrow(/Unregistered edition/);
    expect(() => catalog.breadcrumbs(countries[1], us)).toThrow(
      /does not belong to country/,
    );
    expect(() => catalog.breadcrumbs(countries[0], us, it.editions[0])).toThrow(
      /Unregistered edition/,
    );
  });

  it("copies registration input so later mutation cannot change routes", () => {
    const mutableCountry = { ...countries[0] };
    const mutableSection = {
      ...section("country:us", "section:us:elections"),
      editions: [
        {
          id: "section:us:elections:2026",
          slug: "2026",
          name: "2026",
          description: "Edizione",
        },
      ],
    };
    const catalog = createCatalog([mutableCountry], [mutableSection]);
    mutableCountry.slug = "altered";
    mutableSection.slug = "altered";
    mutableSection.editions[0].slug = "2030";
    mutableSection.editions.push({
      id: "forged",
      slug: "2032",
      name: "2032",
      description: "Forged",
    });

    const country = catalog.countryBySlug("usa")!;
    const registeredSection = catalog.sectionBySlugs("usa", "elections")!;
    expect(
      catalog.editionPath(registeredSection, registeredSection.editions[0]),
    ).toBe("/usa/elections/2026");
    expect(catalog.countryBySlug("altered")).toBeUndefined();
    expect(catalog.sectionsForCountry(country)).toEqual([registeredSection]);
    expect(registeredSection.editions).toHaveLength(1);
  });

  it("registers edition views only beneath their own edition", () => {
    const us = section("country:us", "section:us:elections");
    const it = section("country:it", "section:it:elections");
    const view = {
      id: "view:us:house",
      editionId: us.editions[0].id,
      slug: "house",
      name: "Camera",
      description: "Gare per la Camera",
      kind: "competition" as const,
    };
    const italianView = {
      ...view,
      id: "view:it:house",
      editionId: it.editions[0].id,
      kind: "news" as const,
    };
    const catalog = createCatalog(countries, [us, it], [view, italianView]);
    const registeredUs = catalog.sectionBySlugs("usa", "elections")!;
    const registeredIt = catalog.sectionBySlugs("italy", "elections")!;

    expect(catalog.viewPath(registeredUs, registeredUs.editions[0], view)).toBe(
      "/usa/elections/2026/house",
    );
    expect(
      catalog.viewBySlugs("italy", "elections", "2026", "house")?.kind,
    ).toBe("news");
    expect(
      catalog
        .breadcrumbs(countries[0], registeredUs, registeredUs.editions[0], view)
        .map(({ href }) => href),
    ).toEqual([
      "/",
      "/usa",
      "/usa/elections",
      "/usa/elections/2026",
      "/usa/elections/2026/house",
    ]);
    expect(() =>
      catalog.viewPath(registeredIt, registeredIt.editions[0], view),
    ).toThrow(/Unregistered edition view/);
    expect(() =>
      createCatalog(countries, [us, it], [{ ...view, editionId: "missing" }]),
    ).toThrow(/Unknown edition view reference/);
  });
});
