/**
 * Applies drizzle migrations to the database in DATABASE_URL.
 * Works with both PostgreSQL and PGlite (pglite://) URLs.
 */
import path from "node:path";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const migrationsFolder = path.join(process.cwd(), "drizzle");

  if (url.startsWith("pglite://")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const dataDir = url.slice("pglite://".length);
    const client = new PGlite(dataDir === ":memory:" ? undefined : dataDir);
    const db = drizzle(client);
    await migrate(db, { migrationsFolder });
    await client.close();
  } else {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { max: 1 });
    const db = drizzle(client);
    await migrate(db, { migrationsFolder });
    await client.end();
  }
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
