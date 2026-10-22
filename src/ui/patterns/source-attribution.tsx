import type { SourceReference } from "@/platform/presentation/models";

export function SourceAttribution({ source }: { source: SourceReference }) {
  let href: string | null = null;
  try {
    const url = new URL(source.url);
    if (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    ) {
      href = url.toString();
    }
  } catch {
    // A malformed reference remains plain text, never a navigable URL.
  }
  return (
    <span className="source-attribution">
      Fonte:{" "}
      {href ? (
        <a href={href} rel="noopener noreferrer" target="_blank">
          {source.name}
        </a>
      ) : (
        source.name
      )}
      {source.note ? <span> · {source.note}</span> : null}
      {source.acquiredAt ? (
        <span>
          {" "}
          · acquisito il{" "}
          <time dateTime={source.acquiredAt}>
            {new Intl.DateTimeFormat("it-IT", {
              dateStyle: "medium",
              timeZone: "Europe/Rome",
            }).format(new Date(source.acquiredAt))}
          </time>
        </span>
      ) : null}
    </span>
  );
}
