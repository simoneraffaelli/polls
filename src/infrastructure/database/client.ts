import { drizzle } from "drizzle-orm/node-postgres";
import pg, { type PoolConfig } from "pg";
import * as schema from "./schema";

export function createDatabase(config: PoolConfig) {
  const pool = new pg.Pool({ max: 5, ...config });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}

export type Database = ReturnType<typeof createDatabase>["db"];
