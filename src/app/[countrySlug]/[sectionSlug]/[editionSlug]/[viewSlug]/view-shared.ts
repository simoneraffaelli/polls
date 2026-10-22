import { catalog } from "@/composition/catalog";
import type { readPublicSources } from "@/composition/observatory";

export const scope = {
  sectionId: "section:us:midterms",
  editionId: "edition:us:midterms:2026",
} as const;
export type Section = NonNullable<ReturnType<typeof catalog.sectionBySlugs>>;
export type Edition = NonNullable<ReturnType<typeof catalog.editionBySlugs>>;
export type SourcesRead = Awaited<ReturnType<typeof readPublicSources>>;
export type Query = Record<string, string | string[] | undefined>;
export const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

export function queryPath(
  path: string,
  query: Record<string, string | number | undefined>,
) {
  const url = new URL(path, "https://local.invalid");
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) url.searchParams.set(key, String(value));
  return `${url.pathname}${url.search}`;
}
