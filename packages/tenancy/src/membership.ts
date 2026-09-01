import type { OrgId, UserId } from "@forge/kernel";
import type { Actor, OrgRole } from "@forge/policy";

/**
 * A user's membership of one org, with the role they hold there. This is the bridge
 * between authentication (who you are — Better-Auth's job) and authorization (what
 * org you're acting in and your role — Forge's job). The authorization Actor is
 * DERIVED from membership, so a user with no membership in an org simply has no Actor
 * for it and every decide() returns invisible/deny.
 */
export interface Membership {
  readonly userId: UserId;
  readonly orgId: OrgId;
  readonly role: OrgRole;
}

/** Build the authorization Actor from a single membership. */
export const deriveActor = (m: Membership): Actor => ({
  userId: m.userId,
  orgId: m.orgId,
  orgRole: m.role,
});

/**
 * Resolve the Actor for a chosen active org from a user's memberships. Returns null
 * if the user is not a member of that org — the caller (auth) treats null as "no
 * access", never as a partial or default Actor.
 */
export const actorForActiveOrg = (
  memberships: readonly Membership[],
  activeOrgId: OrgId,
): Actor | null => {
  const m = memberships.find((x) => x.orgId === activeOrgId);
  return m ? deriveActor(m) : null;
};
