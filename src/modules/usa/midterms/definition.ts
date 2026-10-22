import type { SectionDefinition } from "@/platform/catalog";

export const midtermsSection: SectionDefinition = {
  id: "section:us:midterms",
  countryId: "country:us",
  slug: "midterms",
  name: "Midterms",
  description: "Elezioni di metà mandato negli Stati Uniti.",
  currentEditionId: "edition:us:midterms:2026",
  editions: [
    {
      id: "edition:us:midterms:2026",
      slug: "2026",
      name: "2026",
      description: "Edizione delle elezioni di metà mandato del 2026.",
    },
  ],
};
