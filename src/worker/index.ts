import { readWorkerConfig } from "../infrastructure/config/worker-env";

function main(): void {
  // La connessione, la coda e le raccolte arrivano nelle fasi successive.
  // La validazione è locale al processo: la build web non richiede segreti PostgreSQL.
  readWorkerConfig(process.env);
  console.info("Worker avviato; nessuna raccolta configurata in questa fase.");

  const keepAlive = setInterval(() => {}, 60_000);
  const shutdown = () => {
    clearInterval(keepAlive);
    console.info("Worker arrestato.");
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

try {
  main();
} catch {
  // Non riportare gli input di validazione: le variabili PostgreSQL contengono credenziali.
  console.error(
    "Configurazione worker non valida: controllare le variabili PostgreSQL.",
  );
  process.exitCode = 1;
}
