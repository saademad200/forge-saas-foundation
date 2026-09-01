import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Apply the full schema as the OWNER, in order: vector extension -> Drizzle
 * migrations -> rls.sql. Shared by the migrate CLI and the isolation test so both
 * exercise an identical schema. Idempotent.
 */
export async function applyMigrations(ownerUrl: string): Promise<void> {
  const sql = postgres(ownerUrl, { max: 1 });
  try {
    await sql.unsafe("create extension if not exists vector");
    const db = drizzle(sql);
    await migrate(db, { migrationsFolder: join(here, "..", "drizzle") });
    const rls = readFileSync(join(here, "..", "rls.sql"), "utf8");
    await sql.unsafe(rls);
  } finally {
    await sql.end();
  }
}
