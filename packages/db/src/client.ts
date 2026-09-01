import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

export type Db = PostgresJsDatabase<typeof schema>;

/** The transaction handle drizzle yields — repositories operate on this. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface DbHandle {
  readonly db: Db;
  readonly sql: postgres.Sql;
  close(): Promise<void>;
}

/**
 * Open a connection. The APP connects with a `forge_app` (non-owner, no BYPASSRLS)
 * connection string so RLS actually bites; MIGRATIONS and system tasks connect as
 * the owner. The caller chooses which by passing the right connection string —
 * the client itself is role-agnostic.
 */
export function createDb(connectionString: string, max = 10): DbHandle {
  const sql = postgres(connectionString, { max });
  const db = drizzle(sql, { schema });
  return { db, sql, close: () => sql.end() };
}

export { schema };
