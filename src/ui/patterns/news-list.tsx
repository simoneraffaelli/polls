import type { Availability, NewsItem } from "@/platform/presentation/models";
import { DataNotice } from "./data-notice";
import { SourceAttribution } from "./source-attribution";

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
          <h3>{item.title}</h3>
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
