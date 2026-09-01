import { describe, it, expect } from "vitest";
import { OrgId, UserId } from "@forge/kernel";
import { decide, permissionsFor, FOUNDATION_GRANTS } from "./decide.js";
import { P, httpStatusFor, ORG_ROLES, type Actor, type GrantTable, type OrgRole } from "./model.js";

const ORG_A = OrgId("org_a");
const ORG_B = OrgId("org_b");

const actor = (orgRole: OrgRole, userId = "u1", orgId = ORG_A): Actor => ({
  userId: UserId(userId),
  orgId,
  orgRole,
});

describe("decide — capability by role", () => {
  it("owner may manage the org and money", () => {
    expect(decide(actor("owner"), P.orgManage)).toBe("allow");
    expect(decide(actor("owner"), P.billingManage)).toBe("allow");
    expect(decide(actor("owner"), P.orgDelete)).toBe("allow");
  });

  it("admin runs members and reads billing, but cannot change billing or delete the org", () => {
    expect(decide(actor("admin"), P.memberInvite)).toBe("allow");
    expect(decide(actor("admin"), P.billingRead)).toBe("allow");
    expect(decide(actor("admin"), P.billingManage)).toBe("deny");
    expect(decide(actor("admin"), P.orgDelete)).toBe("deny");
  });

  it("member may read the org and members and nothing more", () => {
    expect(decide(actor("member"), P.orgRead)).toBe("allow");
    expect(decide(actor("member"), P.memberRead)).toBe("allow");
    expect(decide(actor("member"), P.memberInvite)).toBe("deny");
    expect(decide(actor("member"), P.orgManage)).toBe("deny");
  });
});

describe("decide — deny by default", () => {
  it("denies an unknown permission for every role", () => {
    for (const role of ORG_ROLES) {
      expect(decide(actor(role), "nonsense:action")).toBe("deny");
    }
  });

  it("an unknown role fails closed and never throws", () => {
    const rogue = { userId: UserId("u1"), orgId: ORG_A, orgRole: "wizard" as OrgRole };
    expect(() => decide(rogue, P.orgRead)).not.toThrow();
    expect(decide(rogue, P.orgRead)).toBe("deny");
  });
});

describe("decide — cross-tenant is invisible (404), checked first", () => {
  it("even an owner gets 'invisible' for another org's resource", () => {
    const v = decide(actor("owner"), P.orgRead, { orgId: ORG_B });
    expect(v).toBe("invisible");
    expect(httpStatusFor(v)).toBe(404);
  });

  it("the cross-tenant check precedes capability — a permission the actor HAS is still invisible cross-org", () => {
    // owner HAS billing:manage in its own org, but the resource is in org B.
    expect(decide(actor("owner"), P.billingManage, { orgId: ORG_B })).toBe("invisible");
  });

  it("same-org resource is decided normally", () => {
    expect(decide(actor("admin"), P.memberInvite, { orgId: ORG_A })).toBe("allow");
  });
});

describe("decide — ownership", () => {
  it("a member may manage their own membership even without the org-wide grant", () => {
    const self = { orgId: ORG_A, ownerId: UserId("u1") };
    expect(decide(actor("member", "u1"), P.memberManage, self)).toBe("allow");
  });

  it("a member may NOT manage someone else's membership", () => {
    const other = { orgId: ORG_A, ownerId: UserId("u2") };
    expect(decide(actor("member", "u1"), P.memberManage, other)).toBe("deny");
  });

  it("ownership does not extend to non-ownership permissions", () => {
    const self = { orgId: ORG_A, ownerId: UserId("u1") };
    expect(decide(actor("member", "u1"), P.billingManage, self)).toBe("deny");
  });
});

describe("httpStatusFor", () => {
  it("maps the trichotomy to 200/403/404", () => {
    expect(httpStatusFor("allow")).toBe(200);
    expect(httpStatusFor("deny")).toBe(403);
    expect(httpStatusFor("invisible")).toBe(404);
  });
});

describe("permissionsFor — derived from the same grants as decide", () => {
  it("returns exactly the member's org-wide permissions", () => {
    const perms = permissionsFor(actor("member"));
    expect([...perms].sort()).toEqual([P.memberRead, P.orgRead].sort());
  });

  it("agrees with decide for every foundation permission and role", () => {
    const allPerms = Object.values(P);
    for (const role of ORG_ROLES) {
      const a = actor(role);
      for (const perm of allPerms) {
        const byDecide = decide(a, perm, { orgId: ORG_A }) === "allow";
        const byList = permissionsFor(a).has(perm);
        expect(byList, `${role} / ${perm}`).toBe(byDecide);
      }
    }
  });
});

describe("decide — generated features compose their own grants", () => {
  it("an extended grants table adds entity permissions without a second code path", () => {
    const invoiceRead: `${string}:${string}` = "invoice:read";
    const extended: GrantTable = {
      owner: new Set([...FOUNDATION_GRANTS.owner, invoiceRead]),
      admin: new Set([...FOUNDATION_GRANTS.admin, invoiceRead]),
      member: new Set([...FOUNDATION_GRANTS.member]), // members cannot read invoices
    };
    expect(decide(actor("admin"), invoiceRead, { orgId: ORG_A }, extended)).toBe("allow");
    expect(decide(actor("member"), invoiceRead, { orgId: ORG_A }, extended)).toBe("deny");
    // and cross-tenant is still invisible under the extended table
    expect(decide(actor("owner"), invoiceRead, { orgId: ORG_B }, extended)).toBe("invisible");
  });
});
