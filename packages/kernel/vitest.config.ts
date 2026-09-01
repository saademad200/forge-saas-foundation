import { defineConfig } from "vitest/config";

/** Per-package test config: unit tests colocated in src as `*.test.ts`. */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
