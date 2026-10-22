import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("@/composition/catalog", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/composition/catalog")>();
  const { createCatalog } = await import("@/platform/catalog");
  const countries = [
    {
      id: "country:us",
      code: "US",
      slug: "usa",
      name: "USA",
      description: "Fixture USA",
    },
    {
      id: "country:it",
      code: "IT",
      slug: "italy",
      name: "Italia",
      description: "Fixture italiana",
    },
  ];
  return {
    ...original,
    catalog: createCatalog(
      countries,
      countries.map((country) => ({
        id: `section:${country.code}:elections`,
        countryId: country.id,
        slug: "elections",
        name: `Elezioni ${country.name}`,
        description: "Sezione di prova",
        currentEditionId: `edition:${country.code}:2030`,
        editions: [
          {
            id: `edition:${country.code}:2030`,
            slug: "2030",
            name: "2030",
            description: "Edizione di prova",
          },
        ],
      })),
    ),
  };
});

import CountryPage, { generateMetadata } from "@/app/[countrySlug]/page";

it("renders the actual shared country page for a second country without USA routes or rules", async () => {
  const props = { params: Promise.resolve({ countrySlug: "italy" }) };
  const html = renderToStaticMarkup(await CountryPage(props));
  expect(html).toContain("Italia");
  expect(html).toContain('href="/italy/elections"');
  expect(html).not.toContain('href="/usa');
  expect(html).not.toContain("Midterms");
  expect(html).not.toContain("Senato");
  expect((await generateMetadata(props)).alternates?.canonical).toBe(
    "https://polls.simone.ooo/italy",
  );
});
