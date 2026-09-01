import { P } from "./model.js";
import type { Actor, GrantTable, Permission, Resource, Verdict } from "./model.js";

const set = (...ps: Permission[]): ReadonlySet<Permission> => new Set(ps);

const EMPTY: ReadonlySet<Permission> = new Set();

/**
 * The foundation's role→permission grants. Note the deliberate asymmetries: only
 * the owner may `org:delete` or `billing:manage` (destroying the org and moving
 * money are owner-only); admins run members and read billing but cannot change it;
 * a member can see the org and its members and nothing more. Deny-by-default means
 * anything not listed here is denied.
 */
export const FOUNDATION_GRANTS: GrantTable = {
  owner: set(
    P.orgRead,
    P.orgManage,
    P.orgDelete,
    P.memberRead,
    P.memberInvite,
    P.memberManage,
    P.billingRead,
    P.billingManage,
  ),
  admin: set(P.orgRead, P.memberRead, P.memberInvite, P.memberManage, P.billingRead),
  member: set(P.orgRead, P.memberRead),
};

/**
 * Permissions a user may exercise on a resource they OWN even without an org-wide
 * grant — e.g. a plain member managing their own membership row. Ownership never
 * substitutes for a capability the actor lacks on other people's resources.
 */
const OWNERSHIP_PERMISSIONS: ReadonlySet<Permission> = set(P.memberManage);

/**
 * The authorization kernel: one pure, total function. No I/O, no throwing. The
 * pipeline order is load-bearing — the cross-tenant check runs FIRST, so no later
 * rule can leak the existence of another org's resource.
 *
 * @param grants defaults to the foundation grants; generated features pass an
 *   extended table (foundation + their entity permissions) so there is never a
 *   second authorization code path.
 */
export function decide(
  actor: Actor,
  permission: Permission,
  resource?: Resource,
  grants: GrantTable = FOUNDATION_GRANTS,
): Verdict {
  // 1. Cross-tenant → invisible (404). A resource in another org is indistinguishable
  //    from one that does not exist. This runs before any capability check.
  if (resource && resource.orgId !== actor.orgId) return "invisible";

  // 2. Capability by org role. Unknown role → EMPTY → fails closed (never throws).
  const held = grants[actor.orgRole] ?? EMPTY;
  if (held.has(permission)) return "allow";

  // 3. Ownership: act on your own resource, for the ownership-eligible permissions.
  if (
    resource?.ownerId !== undefined &&
    resource.ownerId === actor.userId &&
    OWNERSHIP_PERMISSIONS.has(permission)
  ) {
    return "allow";
  }

  // 4. Deny by default.
  return "deny";
}

/**
 * The org-wide permissions an actor holds, derived from the SAME grants table
 * decide() uses — so the UI (which calls this to show/hide controls) can never
 * disagree with what the server will actually allow. Resource-level ownership is
 * deliberately not included; it is decided per resource by decide().
 */
export function permissionsFor(
  actor: Actor,
  grants: GrantTable = FOUNDATION_GRANTS,
): ReadonlySet<Permission> {
  return grants[actor.orgRole] ?? EMPTY;
}
