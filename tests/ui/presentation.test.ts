import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MetricCard } from "@/ui/patterns/metric-card";
import { NewsList } from "@/ui/patterns/news-list";
import { SourceAttribution } from "@/ui/patterns/source-attribution";

const source = {
  name: "Fonte primaria",
  url: "https://example.org/article",
  acquiredAt: "2026-10-22T12:00:00Z",
};

describe("presentation boundaries", () => {
  it("keeps metric meanings visible beside a value", () => {
    const html = renderToStaticMarkup(
      createElement(MetricCard, {
        title: "Scenario",
        state: {
          status: "ready",
          value: {
            kind: "model_probability",
            label: "Esito definito",
            valueText: "43%",
            detail: "Modello sperimentale",
          },
        },
      }),
    );
    expect(html).toContain("Probabilità del modello");
    expect(html).toContain("Esito definito");
    expect(html).toContain("43%");
  });

  it("does not republish an article excerpt without permission", () => {
    const html = renderToStaticMarkup(
      createElement(NewsList, {
        state: {
          status: "ready",
          value: [
            {
              id: "article:1",
              title: "Titolo attribuito",
              publishedAt: null,
              summary: "Estratto riservato",
              excerptReusePermitted: false,
              source,
            },
          ],
        },
      }),
    );
    expect(html).toContain("Titolo attribuito");
    expect(html).toContain("Fonte primaria");
    expect(html).not.toContain("Estratto riservato");
  });

  it("does not turn unsafe source references into links", () => {
    const html = renderToStaticMarkup(
      createElement(SourceAttribution, {
        source: { ...source, url: "javascript:alert(1)" },
      }),
    );
    expect(html).toContain("Fonte primaria");
    expect(html).not.toContain("href=");
  });
});
