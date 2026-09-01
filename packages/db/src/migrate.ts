import { applyMigrations } from "./apply.js";

/**
 * Run the migrations explicitly (never on app boot): CREATE EXTENSION vector ->
 * Drizzle migrations -> rls.sql. See apply.ts for the ordering rationale.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required to run migrations");
  await applyMigrations(url);
  // eslint-disable-next-line no-console
  console.log("migrations + rls applied");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
