export function EmptyState() {
  return (
    <section className="empty-state" aria-labelledby="empty-title">
      <span className="eyebrow">Stato dei dati</span>
      <h2 id="empty-title">Nessun dato acquisito</h2>
      <p>
        Le fonti e la copertura sono ancora in verifica. Sondaggi, mercati,
        notizie e previsioni compariranno solo dopo la raccolta e i controlli
        previsti.
      </p>
    </section>
  );
}
