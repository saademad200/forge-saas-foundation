import { describe, it, expect } from "vitest";
import { OrgId, UserId } from "@forge/kernel";
import { decide, P } from "@forge/policy";
import type { Membership } from "@forge/tenancy";
import { resolveActor, type Session } from "./session.js";

const U = UserId("u1");
const A = OrgId("org_a");
const B = OrgId("org_b");

const asAdminOfA: Membership = { userId: U, orgId: A, role: "admin" };
const asMemberOfB: Membership = { userId: U, orgId: B, role: "member" };

const session = (activeOrgId?: OrgId): Session =>
  activeOrgId !== undefined ? { userId: U, activeOrgId } : { userId: U };

describe("resolveActor", () => {
  it("no session -> no_session", () => {
    expect(resolveActor(null, []).kind).toBe("no_session");
  });

  it("active org the user belongs to -> actor with the right role", () => {
    const out = resolveActor(session(A), [asAdminOfA, asMemberOfB]);
    expect(out.kind).toBe("actor");
    if (out.kind === "actor") {
      expect(out.actor.orgRole).toBe("admin");
      expect(decide(out.actor, P.memberInvite)).toBe("allow");
    }
  });

  it("active org the user does NOT belong to -> no_membership (never a default org)", () => {
    const out = resolveActor(session(OrgId("org_x")), [asAdminOfA]);
    expect(out.kind).toBe("no_membership");
  });

  it("no active org + exactly one membership -> that org's actor", () => {
    const out = resolveActor(session(), [asMemberOfB]);
    expect(out.kind).toBe("actor");
    if (out.kind === "actor") expect(out.actor.orgId).toBe(B);
  });

  it("no active org + no memberships -> no_membership", () => {
    expect(resolveActor(session(), []).kind).toBe("no_membership");
  });

  it("no active org + multiple memberships -> needs_org_selection with the options", () => {
    const out = resolveActor(session(), [asAdminOfA, asMemberOfB]);
    expect(out.kind).toBe("needs_org_selection");
    if (out.kind === "needs_org_selection") {
      expect([...out.options].sort()).toEqual([A, B].sort());
    }
  });
});
