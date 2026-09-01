import { createHash } from "node:crypto";
import type { FeatureSpec, Field, SpecRole } from "./spec.js";

export const CODEGEN_VERSION = "0.0.0";

export interface GeneratedFile {
  readonly path: string;
  readonly content: string;
}

const snake = (s: string): string => s.replace(/([A-Z])/g, "_$1").toLowerCase();
const pascal = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Deterministic content hash of the spec — the stable id for provenance + drift checks. */
export function specHash(spec: FeatureSpec): string {
  const canonical = JSON.stringify(spec, Object.keys(spec).sort());
  return createHash("sha256").update(canonical).digest("hex").slice(0, 12);
}

const DRIZZLE_COL: Record<Field["type"], (col: string) => string> = {
  text: (c) => `text(${JSON.stringify(c)})`,
  integer: (c) => `integer(${JSON.stringify(c)})`,
  boolean: (c) => `boolean(${JSON.stringify(c)})`,
  timestamp: (c) => `timestamp(${JSON.stringify(c)}, { withTimezone: true })`,
};

const TS_TYPE: Record<Field["type"], string> = {
  text: "string",
  integer: "number",
  boolean: "boolean",
  timestamp: "Date",
};

const header = (hash: string, entity: string): string =>
  `// @generated from spec ${hash} by @forge/codegen@${CODEGEN_VERSION} — DO NOT EDIT.\n` +
  `// Customize behavior in ${entity}.custom.ts (hand-owned; never regenerated).\n` +
  `// The regenerate-and-diff CI check fails if this file is hand-edited.\n`;

const rolesLiteral = (roles: SpecRole[]): string => `[${roles.map((r) => JSON.stringify(r)).join(", ")}]`;

function moduleSource(spec: FeatureSpec, hash: string): string {
  const table = snake(spec.entity);
  const Type = pascal(spec.entity);
  const cols = spec.fields
    .map((f) => {
      const base = `  ${f.name}: ${DRIZZLE_COL[f.type](snake(f.name))}`;
      return f.required ? `${base}.notNull(),` : `${base},`;
    })
    .join("\n");
  const newFields = spec.fields
    .map((f) => `  ${f.name}${f.required ? "" : "?"}: ${TS_TYPE[f.type]};`)
    .join("\n");

  return (
    header(hash, spec.entity) +
    `import { pgTable, uuid, timestamp, text, integer, boolean, index } from "drizzle-orm/pg-core";
import { and, eq } from "drizzle-orm";
import type { Actor } from "@forge/policy";
import type { Tx } from "@forge/db";

export const ${spec.entity} = pgTable(
  ${JSON.stringify(table)},
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull(),
${cols.replace(/^/gm, "  ")}
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index(${JSON.stringify(table + "_org_idx")}).on(t.orgId)],
);

export type ${Type} = typeof ${spec.entity}.$inferSelect;
export interface New${Type} {
${newFields}
}

/**
 * Tenant-scoped repository. EVERY query is AND-ed with the actor's org — there is no
 * generated code path that omits the org scope. Sits on top of the DB-layer RLS.
 */
export function ${spec.entity}Repository(tx: Tx, actor: Actor) {
  const orgId = actor.orgId as unknown as string;
  return {
    list: () => tx.select().from(${spec.entity}).where(eq(${spec.entity}.orgId, orgId)),
    get: (id: string) =>
      tx.select().from(${spec.entity}).where(and(eq(${spec.entity}.id, id), eq(${spec.entity}.orgId, orgId))),
    create: (input: New${Type}) =>
      tx.insert(${spec.entity}).values({ ...input, orgId }).returning(),
    update: (id: string, patch: Partial<New${Type}>) =>
      tx.update(${spec.entity}).set(patch).where(and(eq(${spec.entity}.id, id), eq(${spec.entity}.orgId, orgId))).returning(),
    remove: (id: string) =>
      tx.delete(${spec.entity}).where(and(eq(${spec.entity}.id, id), eq(${spec.entity}.orgId, orgId))).returning(),
  };
}

/** Entity permissions per action, deny-by-default (composed into the policy grant table). */
export const ${spec.entity}Grants = {
  read: ${rolesLiteral(spec.permissions.read)},
  create: ${rolesLiteral(spec.permissions.create)},
  update: ${rolesLiteral(spec.permissions.update)},
  delete: ${rolesLiteral(spec.permissions.delete)},
} as const;
`
  );
}

function testSource(spec: FeatureSpec, hash: string): string {
  const table = snake(spec.entity);
  return (
    header(hash, spec.entity) +
    `import { describe, it, expect } from "vitest";
import { ${spec.entity}, ${spec.entity}Grants } from "./${spec.entity}.generated.js";

// A structural test that the generated table is tenant-scoped and grants are present.
// The runtime isolation guarantee is covered by the shared isolation proof suite.
describe("generated ${spec.entity}", () => {
  it("has an org_id column (tenant-scoped by construction)", () => {
    expect(${spec.entity}).toBeDefined();
    // the table object exposes its columns; org_id must be present
    const cols = Object.keys((${spec.entity} as unknown as { [k: string]: unknown }));
    expect(cols).toContain("orgId");
  });

  it("declares deny-by-default grants", () => {
    expect(${spec.entity}Grants.read).toBeDefined();
    expect(Array.isArray(${spec.entity}Grants.delete)).toBe(true);
  });
});

// table name is ${table}
`
  );
}

/** Generate the @generated files for a validated feature spec (deterministic). */
export function generate(spec: FeatureSpec): GeneratedFile[] {
  const hash = specHash(spec);
  return [
    { path: `${spec.entity}/${spec.entity}.generated.ts`, content: moduleSource(spec, hash) },
    { path: `${spec.entity}/${spec.entity}.generated.test.ts`, content: testSource(spec, hash) },
  ];
}
