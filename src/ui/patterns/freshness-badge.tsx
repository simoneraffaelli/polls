import type { Freshness } from "@/platform/presentation/models";

export function FreshnessBadge({ freshness }: { freshness: Freshness }) {
  const label = {
    current: "Aggiornato",
    stale: "Da aggiornare",
    unavailable: "Acquisizione non disponibile",
    error: "Errore di acquisizione",
  }[freshness.state];
  return (
    <span className={`freshness freshness--${freshness.state}`}>
      <span className="freshness-mark" aria-hidden="true" />
      {label}
      {freshness.acquiredAt ? (
        <time dateTime={freshness.acquiredAt}>
          {new Intl.DateTimeFormat("it-IT", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Europe/Rome",
          }).format(new Date(freshness.acquiredAt))}
        </time>
      ) : null}
    </span>
  );
}
