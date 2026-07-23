import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema>;

let cached: Db | null = null;
let pending: Promise<Db> | null = null;

export async function getDb(): Promise<Db> {
  if (cached) return cached;
  pending ??= createDb();
  cached = await pending;
  return cached;
}

async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) return drizzle(neon(url), { schema });

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL is not set. Configure the Neon Postgres connection string in Vercel environment variables."
    );
  }

  // Local development fallback: embedded Postgres (pglite) persisted under
  // ./.pglite, with drizzle migrations applied automatically on first boot.
  const [{ PGlite }, { drizzle: drizzlePglite }, { migrate }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
  ]);
  const client = new PGlite("./.pglite");
  const db = drizzlePglite(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  // Query surface used by the app (select/insert/update/delete/execute) is
  // identical across both drivers; unify on the Neon type for callers.
  return db as unknown as Db;
}
