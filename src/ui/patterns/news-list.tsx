import type { Availability, NewsItem } from "@/platform/presentation/models";
import { DataNotice } from "./data-notice";
import { SourceAttribution } from "./source-attribution";

function safeArticleUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function NewsList({
  state,
}: {
  state: Availability<readonly NewsItem[]>;
}) {
  if (state.status !== "ready") return <DataNotice state={state} />;
  if (state.value.length === 0) {
    return (
      <DataNotice
        state={{
          status: "empty",
          message: "Non sono state acquisite notizie per questa edizione.",
        }}
      />
    );
  }
  return (
    <ol className="news-list">
      {state.value.map((item) => (
        <li key={item.id}>
          <h3>
            {safeArticleUrl(item.source.url) ? (
              <a
                href={item.source.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {item.title}
              </a>
            ) : (
              item.title
            )}
          </h3>
          {item.summary && item.excerptReusePermitted ? (
            <p>{item.summary}</p>
          ) : null}
          <div className="news-meta">
            {item.publishedAt ? (
              <time dateTime={item.publishedAt}>
                {new Intl.DateTimeFormat("it-IT", {
                  dateStyle: "medium",
                  timeZone: "Europe/Rome",
                }).format(new Date(item.publishedAt))}
              </time>
            ) : (
              <span>Data di pubblicazione non dichiarata</span>
            )}
            <SourceAttribution source={item.source} />
          </div>
        </li>
      ))}
    </ol>
  );
}
