import { z } from "zod";
import { observationProvenanceSchema } from "./provenance";
import { internalIdSchema, publicHttpUrlSchema } from "./primitives";

const plainText = z.string().trim().min(1).refine(
  (text) => !/<\/?[a-z][^>]*>/i.test(text),
  "HTML markup is not accepted in normalized article text",
);

export const articleObservationSchema = z.object({
  provenance: observationProvenanceSchema,
  publisher: internalIdSchema,
  title: plainText,
  url: publicHttpUrlSchema,
  excerpt: plainText.nullable(),
  excerptReusePermitted: z.boolean(),
}).superRefine(({ excerpt, excerptReusePermitted }, context) => {
  if (excerpt !== null && !excerptReusePermitted) {
    context.addIssue({ code: "custom", message: "Excerpt reuse is not permitted", path: ["excerpt"] });
  }
});

export type ArticleObservation = z.infer<typeof articleObservationSchema>;
