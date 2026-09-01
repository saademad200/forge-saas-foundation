import { describe, it, expect } from "vitest";
import { toVectorLiteral } from "./repositories.js";

// DB-free unit tests for the db package's pure helpers. The isolation suite that
// needs real Postgres lives in *.itest.ts and runs as a separate, service-backed job.
describe("toVectorLiteral", () => {
  it("formats an embedding as a pgvector literal", () => {
    expect(toVectorLiteral([0.1, 0.2, 0.3])).toBe("[0.1,0.2,0.3]");
    expect(toVectorLiteral([])).toBe("[]");
    expect(toVectorLiteral([1])).toBe("[1]");
  });
});
