import { sql } from "drizzle-orm";
import type { OrgId } from "@forge/kernel";
import type { Db, Tx } from "./client.js";

/**
 * Run `fn` inside a transaction with the `forge.org_id` GUC set, so RLS scopes every
 * query in it to this org. `set_config(..., true)` is transaction-local, so the value
 * cannot leak to the next request that borrows the same pooled connection — the
 * failure mode that makes naive "set a session variable" tenant scoping unsafe.
 *
 * This is the ONLY sanctioned way for the app to read/write tenant data: it pairs the
 * DB-level RLS guarantee with the application-level repository scope (repositories.ts).
 */
export async function withTenant<T>(
  db: Db,
  orgId: OrgId,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('forge.org_id', ${orgId}, true)`);
    return fn(tx);
  });
}

/**
 * Run `fn` in a transaction with NO tenant GUC — for the owner/migration/system role
 * only. Under the `forge_app` role this yields zero rows on every RLS-protected table
 * (fail closed), which the isolation suite asserts.
 */
export async function withoutTenant<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction((tx) => fn(tx));
}
