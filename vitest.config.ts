import { defineConfig } from "vitest/config";

/**
 * Root vitest config — runs ONLY the repository-level architecture test.
 * Per-package unit tests run inside each package (via `turbo run test`), so this
 * config deliberately scopes to `architecture.test.ts` at the root and does not
 * descend into packages.
 */
export default defineConfig({
  test: {
    include: ["architecture.test.ts"],
    environment: "node",
  },
});
