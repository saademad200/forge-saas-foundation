import { describe, it, expect } from "vitest";
import { parseEnv, EnvError } from "./env.js";

const base = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/forge",
};

describe("parseEnv", () => {
  it("parses a valid environment and applies defaults", () => {
    const env = parseEnv(base);
    expect(env.NODE_ENV).toBe("development");
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.DATABASE_URL).toContain("postgres://");
  });

  it("fails fast with a named error when DATABASE_URL is missing", () => {
    expect(() => parseEnv({})).toThrowError(EnvError);
    try {
      parseEnv({});
    } catch (e) {
      expect((e as EnvError).message).toContain("DATABASE_URL");
    }
  });

  it("rejects a non-URL DATABASE_URL", () => {
    expect(() => parseEnv({ DATABASE_URL: "not-a-url" })).toThrowError(EnvError);
  });

  it("refuses a localhost APP_URL in production", () => {
    expect(() =>
      parseEnv({ ...base, NODE_ENV: "production", APP_URL: "http://localhost:3000" }),
    ).toThrowError(/localhost in production/);
  });

  it("accepts a real APP_URL in production", () => {
    const env = parseEnv({ ...base, NODE_ENV: "production", APP_URL: "https://app.example.com" });
    expect(env.NODE_ENV).toBe("production");
  });
});
