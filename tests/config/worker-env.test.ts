import { describe, expect, it } from "vitest";
import { readWorkerConfig } from "../../src/infrastructure/config/worker-env";

describe("configurazione worker", () => {
  const environment = {
    PGHOST: "postgres",
    PGPORT: "5432",
    PGDATABASE: "polls",
    PGUSER: "polls",
    PGPASSWORD: "secret",
  };

  it("costruisce un URL PostgreSQL dagli input separati", () => {
    expect(readWorkerConfig(environment)).toEqual({
      databaseUrl: "postgresql://polls:secret@postgres:5432/polls",
    });
  });

  it("codifica i caratteri speciali della password nell'URL", () => {
    const config = readWorkerConfig({ ...environment, PGPASSWORD: "p@ss:/?#" });
    expect(decodeURIComponent(new URL(config.databaseUrl).password)).toBe(
      "p@ss:/?#",
    );
    expect(new URL(config.databaseUrl).hostname).toBe("postgres");
  });

  it("codifica il nome database come singolo segmento", () => {
    const config = readWorkerConfig({
      ...environment,
      PGDATABASE: "polls/a?b",
    });
    expect(new URL(config.databaseUrl).pathname).toBe("/polls%2Fa%3Fb");
  });

  it("fallisce prima dell'avvio se manca la password", () => {
    expect(() => readWorkerConfig({})).toThrow();
  });

  it("rifiuta una porta non valida", () => {
    expect(() =>
      readWorkerConfig({ ...environment, PGPORT: "99999" }),
    ).toThrow();
  });

  it("rifiuta un host malformato senza usare localhost come ripiego", () => {
    expect(() =>
      readWorkerConfig({ ...environment, PGHOST: "bad/path" }),
    ).toThrow();
    expect(() =>
      readWorkerConfig({ ...environment, PGHOST: "user@bad" }),
    ).toThrow();
  });
});
