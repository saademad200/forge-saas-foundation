import { describe, it, expect } from "vitest";
import { canTransition, assertTransition, isAccessible, ORG_STATUSES } from "./lifecycle.js";

describe("org lifecycle state machine", () => {
  it("allows the intended transitions", () => {
    expect(canTransition("created", "active")).toBe(true);
    expect(canTransition("active", "suspended")).toBe(true);
    expect(canTransition("suspended", "active")).toBe(true);
    expect(canTransition("active", "deleting")).toBe(true);
  });

  it("forbids skipping states and leaving the terminal state", () => {
    expect(canTransition("created", "suspended")).toBe(false); // must go active first
    expect(canTransition("deleting", "active")).toBe(false); // terminal
    expect(canTransition("active", "created")).toBe(false); // no going back
  });

  it("assertTransition returns the target or a typed error", () => {
    const okr = assertTransition("active", "suspended");
    expect(okr.ok && okr.value).toBe("suspended");
    const errr = assertTransition("deleting", "active");
    expect(errr.ok).toBe(false);
    if (!errr.ok) expect(errr.error.kind).toBe("illegal_transition");
  });

  it("only an active org is accessible", () => {
    expect(isAccessible("active")).toBe(true);
    for (const s of ORG_STATUSES.filter((x) => x !== "active")) {
      expect(isAccessible(s)).toBe(false);
    }
  });
});
