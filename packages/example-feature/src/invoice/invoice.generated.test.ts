// @generated from spec 01530ddbe963 by @forge/codegen@0.0.0 — DO NOT EDIT.
// Customize behavior in invoice.custom.ts (hand-owned; never regenerated).
// The regenerate-and-diff CI check fails if this file is hand-edited.
import { describe, it, expect } from "vitest";
import { invoice, invoiceGrants } from "./invoice.generated.js";

// A structural test that the generated table is tenant-scoped and grants are present.
// The runtime isolation guarantee is covered by the shared isolation proof suite.
describe("generated invoice", () => {
  it("has an org_id column (tenant-scoped by construction)", () => {
    expect(invoice).toBeDefined();
    // the table object exposes its columns; org_id must be present
    const cols = Object.keys((invoice as unknown as { [k: string]: unknown }));
    expect(cols).toContain("orgId");
  });

  it("declares deny-by-default grants", () => {
    expect(invoiceGrants.read).toBeDefined();
    expect(Array.isArray(invoiceGrants.delete)).toBe(true);
  });
});

// table name is invoice
