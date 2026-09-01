import { defineConfig } from "vitest/config";

/**
 * DB-free unit tests only (`*.test.ts`). The Postgres-backed isolation suite
 * (`*.itest.ts`) has its own config (vitest.isolation.config.ts) and runs as a
 * separate, service-backed job so the default test run needs no services.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
