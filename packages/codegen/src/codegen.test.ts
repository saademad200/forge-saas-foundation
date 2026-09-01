import { describe, it, expect } from "vitest";
import { parseSpec, featureSpec, explainSpec, type FeatureSpec } from "./spec.js";
import { generate, specHash } from "./generate.js";

const validSpec: FeatureSpec = {
  entity: "invoice",
  orgScoped: true,
  fields: [
    { name: "amount", type: "integer", required: true },
    { name: "paid", type: "boolean", required: false },
    { name: "memo", type: "text", required: false },
  ],
  permissions: {
    read: ["owner", "admin", "member"],
    create: ["owner", "admin"],
    update: ["owner", "admin"],
    delete: ["owner"],
  },
};

describe("spec IR — tenant scoping is structurally mandatory", () => {
  it("parses a valid spec", () => {
    expect(parseSpec(validSpec).entity).toBe("invoice");
  });

  it("REJECTS a non-tenant-scoped spec (orgScoped must be literal true)", () => {
    const bad = { ...validSpec, orgScoped: false };
    expect(featureSpec.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty field list and a bad entity name", () => {
    expect(featureSpec.safeParse({ ...validSpec, fields: [] }).success).toBe(false);
    expect(featureSpec.safeParse({ ...validSpec, entity: "Invoice-1" }).success).toBe(false);
  });

  it("explainSpec renders a plain-English intent readout for human confirmation", () => {
    const text = explainSpec(validSpec);
    expect(text).toContain("tenant-scoped");
    expect(text).toContain("delete: granted to owner.");
    expect(text).toContain("amount:integer");
  });
});

describe("generate — deterministic, provenance-stamped, tenant-scoped output", () => {
  it("emits the module + test files with a provenance header", () => {
    const files = generate(validSpec);
    expect(files.map((f) => f.path)).toEqual([
      "invoice/invoice.generated.ts",
      "invoice/invoice.generated.test.ts",
    ]);
    for (const f of files) {
      expect(f.content).toContain("@generated from spec");
      expect(f.content).toContain("DO NOT EDIT");
      expect(f.content).toContain("invoice.custom.ts");
    }
  });

  it("the generated table is tenant-scoped (org_id column, org index)", () => {
    const mod = generate(validSpec)[0]!.content;
    expect(mod).toContain('orgId: uuid("org_id").notNull()');
    expect(mod).toContain('index("invoice_org_idx")');
  });

  it("EVERY repository query carries the org scope — no tenant-less query is generated", () => {
    const mod = generate(validSpec)[0]!.content;
    // read paths scope by org
    expect(mod).toContain("where(eq(invoice.orgId, orgId))"); // list
    expect(mod).toContain("and(eq(invoice.id, id), eq(invoice.orgId, orgId))"); // get/update/remove
    // create injects the org on write (cannot attribute to another org)
    expect(mod).toContain("values({ ...input, orgId })");
    // THE INVARIANT: every `.from(invoice)` is immediately followed by `.where(` —
    // there is no generated select that omits the tenant scope.
    const froms = (mod.match(/\.from\(invoice\)/g) ?? []).length;
    const scopedFroms = (mod.match(/\.from\(invoice\)\.where\(/g) ?? []).length;
    expect(froms).toBeGreaterThanOrEqual(2);
    expect(scopedFroms).toBe(froms);
  });

  it("maps field types to Drizzle columns and TS types", () => {
    const mod = generate(validSpec)[0]!.content;
    expect(mod).toContain('integer("amount").notNull()');
    expect(mod).toContain('boolean("paid")');
    expect(mod).toContain("amount: number;");
    expect(mod).toContain("paid?: boolean;");
  });

  it("is deterministic — same spec, same hash, same bytes", () => {
    expect(specHash(validSpec)).toBe(specHash(validSpec));
    expect(generate(validSpec)).toEqual(generate(validSpec));
  });

  it("a different spec yields a different hash", () => {
    const other: FeatureSpec = { ...validSpec, entity: "receipt" };
    expect(specHash(other)).not.toBe(specHash(validSpec));
  });
});
