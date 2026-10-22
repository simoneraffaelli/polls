import { z } from "zod";

const workerEnvironment = z.object({
  PGHOST: z
    .string()
    .min(1)
    .refine((value) => {
      try {
        const parsed = new URL(`http://${value}`);
        return (
          parsed.hostname.toLowerCase() === value.toLowerCase() &&
          parsed.pathname === "/" &&
          parsed.port === "" &&
          parsed.username === "" &&
          parsed.password === ""
        );
      } catch {
        return false;
      }
    }, "PGHOST deve essere un nome host senza percorso o credenziali"),
  PGPORT: z.coerce.number().int().min(1).max(65535).default(5432),
  PGDATABASE: z.string().min(1),
  PGUSER: z.string().min(1),
  PGPASSWORD: z.string().min(1),
});

export type WorkerConfig = {
  databaseUrl: string;
};

export function readWorkerConfig(
  environment: Record<string, string | undefined>,
): WorkerConfig {
  const parsed = workerEnvironment.parse(environment);
  const databaseUrl = new URL("postgresql://localhost");
  databaseUrl.hostname = parsed.PGHOST;
  databaseUrl.port = String(parsed.PGPORT);
  databaseUrl.pathname = `/${encodeURIComponent(parsed.PGDATABASE)}`;
  databaseUrl.username = parsed.PGUSER;
  databaseUrl.password = parsed.PGPASSWORD;
  return { databaseUrl: databaseUrl.toString() };
}
