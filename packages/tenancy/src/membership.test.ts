import { describe, it, expect } from "vitest";
import { OrgId, UserId } from "@forge/kernel";
import { decide, P } from "@forge/policy";
import { deriveActor, actorForActiveOrg, type Membership } from "./membership.js";

const A = OrgId("org_a");
const B = OrgId("org_b");
const U = UserId("u1");

const memberships: Membership[] = [
  { userId: U, orgId: A, role: "admin" },
  { userId: U, orgId: B, role: "member" },
];

describe("deriveActor", () => {
  it("maps a membership to the authorization Actor", () => {
    const a = deriveActor(memberships[0]!);
    expect(a).toEqual({ userId: U, orgId: A, orgRole: "admin" });
    // and the derived Actor drives the policy kernel as expected
    expect(decide(a, P.memberInvite)).toBe("allow"); // admin can invite
  });
});

describe("actorForActiveOrg", () => {
  it("resolves the Actor for the org the user is acting in", () => {
    const inA = actorForActiveOrg(memberships, A);
    expect(inA?.orgRole).toBe("admin");
    const inB = actorForActiveOrg(memberships, B);
    expect(inB?.orgRole).toBe("member");
  });

  it("returns null when the user is not a member of the active org", () => {
    expect(actorForActiveOrg(memberships, OrgId("org_c"))).toBeNull();
  });

  it("the role differs per org — the same user is admin in A, member in B", () => {
    const inA = actorForActiveOrg(memberships, A)!;
    const inB = actorForActiveOrg(memberships, B)!;
    expect(decide(inA, P.memberInvite)).toBe("allow");
    expect(decide(inB, P.memberInvite)).toBe("deny");
  });
});
