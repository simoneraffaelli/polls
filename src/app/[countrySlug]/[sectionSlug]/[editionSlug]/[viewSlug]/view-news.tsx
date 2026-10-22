import Link from "next/link";
import {
  readPublicArticles,
  readPublicNewsCoverage,
} from "@/composition/observatory";
import { newsItems } from "@/platform/presentation/observatory";
import type { Availability, NewsItem } from "@/platform/presentation/models";
import { NewsList } from "@/ui/patterns/news-list";
import { NewsCoverage } from "@/ui/patterns/news-coverage";
import { DataNotice } from "@/ui/patterns/data-notice";
import { queryPath, scope } from "./view-shared";

export async function NewsView({
  path,
  asOf,
  offset,
}: {
  path: string;
  asOf: string;
  offset: number;
}) {
  const [articles, coverage] = await Promise.all([
    readPublicArticles(scope, asOf, offset),
    readPublicNewsCoverage(scope, asOf),
  ]);
  const listState: Availability<readonly NewsItem[]> =
    articles.status === "ready"
      ? { status: "ready", value: newsItems(articles.value.items) }
      : {
          status: articles.status === "error" ? "error" : "empty",
          message: articles.message,
        };
  return (
    <>
      <section className="content-section" aria-labelledby="news-title">
        <h2 className="section-heading" id="news-title">
          Documenti dalle fonti
        </h2>
        <p className="section-intro">
          Il feed della Federal Reserve contiene comunicazioni istituzionali
          economiche. Non misura la copertura elettorale né l’opinione degli
          elettori.
        </p>
        <NewsList state={listState} />
        {articles.status === "ready" &&
        articles.value.hasMore &&
        articles.value.nextOffset !== null ? (
          <Link
            className="page-link"
            href={queryPath(path, {
              asOf,
              offset: articles.value.nextOffset,
            })}
          >
            Altri documenti
          </Link>
        ) : null}
      </section>
      {coverage.status === "ready" ? (
        <NewsCoverage coverage={coverage.value} />
      ) : (
        <section
          className="content-section"
          aria-labelledby="news-coverage-title"
        >
          <h2 id="news-coverage-title" className="section-heading">
            Copertura raccolta
          </h2>
          <DataNotice
            state={{
              status: coverage.status === "error" ? "error" : "empty",
              message: coverage.message,
            }}
          />
        </section>
      )}
    </>
  );
}
