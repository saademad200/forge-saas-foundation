import { defineConfig } from "vitest/config";

/**
 * Integration test config: the isolation proof suite (*.itest.ts) that runs real SQL
 * against real Postgres+pgvector. Kept separate from the DB-free unit run so the
 * default `pnpm test` needs no services. This suite
 * runs as its own, service-backed, merge-blocking CI job.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.itest.ts"],
    environment: "node",
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
