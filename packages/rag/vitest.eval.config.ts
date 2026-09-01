import { defineConfig } from "vitest/config";
// Live retrieval eval against real Postgres+pgvector — separate, service-backed job.
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
