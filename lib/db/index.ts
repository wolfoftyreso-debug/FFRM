import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { requireEnv } from "@/lib/env";
import path from "node:path";

export type Db = PostgresJsDatabase<typeof schema>;

declare global {
  var __ffrmDb: Db | Promise<Db> | undefined;
}

/**
 * Returns the application database. Uses the `postgres` driver for real
 * PostgreSQL, or PGlite (in-process Postgres) when DATABASE_URL starts with
 * "pglite://" — the latter is used for local development and tests.
 */
export async function getDb(): Promise<Db> {
  if (globalThis.__ffrmDb) return globalThis.__ffrmDb;
  globalThis.__ffrmDb = createDb();
  globalThis.__ffrmDb = await globalThis.__ffrmDb;
  return globalThis.__ffrmDb;
}

/** Used by tests to inject a fresh database. */
export function setDbForTests(db: Db): void {
  globalThis.__ffrmDb = db;
}

async function createDb(): Promise<Db> {
  const url = requireEnv("DATABASE_URL");
  if (url.startsWith("pglite://")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const dataDir = url.slice("pglite://".length);
    const client = new PGlite(dataDir === ":memory:" ? undefined : dataDir);
    const db = drizzlePglite(client, { schema });
    await migrate(db, {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
    return db as unknown as Db;
  }
  const client = postgres(url, { max: 5, prepare: false });
  return drizzlePostgres(client, { schema });
}
