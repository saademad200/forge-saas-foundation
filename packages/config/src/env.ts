import { z } from "zod";

/**
 * The environment schema, validated ONCE at boot. A misconfigured process must
 * fail fast with a named-variable error, never boot half-configured and surface
 * the problem as a mysterious runtime failure later (a deliberate discipline). The
 * schema is the single source of truth for what configuration exists; `.env.example`
 * documents it for humans.
 *
 * `parseEnv` is pure (takes the source record explicitly) so it is unit-testable
 * without touching the real `process.env`. `loadEnv` is the impure boot entry point.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Postgres connection string. Required in every environment. */
  DATABASE_URL: z.string().url({ message: "DATABASE_URL must be a valid connection URL" }),

  /** Public base URL of the app (used for auth callbacks, absolute links). */
  APP_URL: z.string().url().default("http://localhost:3000"),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(issues: string[]) {
    super(
      `Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}`,
    );
    this.name = "EnvError";
  }
}

/** Pure: validate a source record, throwing a named EnvError on failure. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
    throw new EnvError(issues);
  }
  const env = result.data;

  // Environment-specific hard requirements beyond shape: in production the app
  // must not fall back to a localhost URL.
  if (env.NODE_ENV === "production" && env.APP_URL.includes("localhost")) {
    throw new EnvError(["APP_URL must not be localhost in production"]);
  }

  return env;
}

let cached: Env | undefined;

/** Impure boot entry point: parse `process.env` once and cache it. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  if (cached) return cached;
  cached = parseEnv(source);
  return cached;
}
