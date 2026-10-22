import { z } from "zod";

/** Calendar dates have no time zone or invented time of day. */
export const calendarDateSchema = z.iso.date();

/** Stored instants use one unambiguous UTC representation. */
export const utcInstantSchema = z.iso.datetime();

export const internalIdSchema = z.string().trim().min(1);
export const contentHashSchema = z.string().regex(/^[a-f0-9]{64}$/, "Expected a SHA-256 hex digest");
export const publicHttpUrlSchema = z.url().refine((value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}, "URL must use HTTP(S) without embedded credentials");

export const editionScopeSchema = z.object({
  sectionId: internalIdSchema,
  editionId: internalIdSchema,
});

export type EditionScope = z.infer<typeof editionScopeSchema>;

export function sameEditionScope(a: EditionScope, b: EditionScope): boolean {
  return a.sectionId === b.sectionId && a.editionId === b.editionId;
}
