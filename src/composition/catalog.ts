import { midtermsSection } from "@/modules/usa/midterms/definition";
import { createCatalog } from "@/platform/catalog";

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
);

export const siteOrigin = "https://polls.simone.ooo";

export function canonicalUrl(path: string): string {
  return new URL(path, siteOrigin).toString();
}
