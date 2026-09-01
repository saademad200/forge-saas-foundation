import { describe, it, expect } from "vitest";
import { entitlementsFor, effectivePlan, isEntitled, PLANS } from "./entitlements.js";

describe("entitlements", () => {
  it("maps plans to features, ascending", () => {
    expect(entitlementsFor("free").has("rag")).toBe(true);
    expect(entitlementsFor("free").has("agents")).toBe(false);
    expect(entitlementsFor("pro").has("agents")).toBe(true);
    expect(entitlementsFor("enterprise").has("seats_unlimited")).toBe(true);
    expect(entitlementsFor("pro").has("seats_unlimited")).toBe(false);
  });

  it("keeps features during past_due/grace, downgrades to free on cancel", () => {
    expect(effectivePlan("pro", "active")).toBe("pro");
    expect(effectivePlan("pro", "past_due")).toBe("pro"); // grace window, not a cutoff
    expect(effectivePlan("pro", "grace")).toBe("pro");
    expect(effectivePlan("pro", "canceled")).toBe("free");
  });

  it("isEntitled composes plan + status", () => {
    expect(isEntitled("pro", "active", "agents")).toBe(true);
    expect(isEntitled("pro", "past_due", "agents")).toBe(true); // still entitled in grace
    expect(isEntitled("pro", "canceled", "agents")).toBe(false); // fell back to free
    expect(isEntitled("free", "active", "agents")).toBe(false);
  });

  it("every plan entitles rag (the baseline feature)", () => {
    for (const p of PLANS) expect(isEntitled(p, "active", "rag")).toBe(true);
  });
});
