import type { OrgId, UserId } from "@forge/kernel";

/**
 * The authorization model. Code checks a PERMISSION, never a role — roles are just
 * a convenient bundle of permissions, and checking the role directly is how "admin
 * can do everything" bugs are born (a deliberate discipline). Roles map to permissions in
 * a DATA table (`GrantTable`), so the mapping is enumerable by a test rather than
 * scattered through branches.
 */

/** Organization roles. Aligned with Better-Auth's org plugin (owner/admin/member). */
export const ORG_ROLES = ["owner", "admin", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** A permission is a `resource:action` string. Generated features add their own. */
export type Permission = `${string}:${string}`;

/** The foundation's built-in permissions (generated entities register more). */
export const P = {
  orgRead: "org:read",
  orgManage: "org:manage",
  orgDelete: "org:delete",
  memberRead: "member:read",
  memberInvite: "member:invite",
  memberManage: "member:manage",
  billingRead: "billing:read",
  billingManage: "billing:manage",
} as const satisfies Record<string, Permission>;

/**
 * The verdict is a TRICHOTOMY, not a boolean. `invisible` is the load-bearing case:
 * a resource in another tenant must not be distinguishable from one that does not
 * exist, so cross-tenant access returns 404, never 403 (which would confirm the
 * resource exists). This is existence-hiding applied to multi-tenancy.
 */
export type Verdict = "allow" | "deny" | "invisible";

export const httpStatusFor = (v: Verdict): 200 | 403 | 404 =>
  v === "allow" ? 200 : v === "deny" ? 403 : 404;

/** Who is acting: a user, in exactly one active org, with one role there. */
export interface Actor {
  readonly userId: UserId;
  readonly orgId: OrgId;
  readonly orgRole: OrgRole;
}

/**
 * What is being acted on. `orgId` is the tenant discriminator — decide() compares
 * it to the actor's active org. `ownerId` enables "you may act on your own thing"
 * without an org-wide grant.
 */
export interface Resource {
  readonly orgId: OrgId;
  readonly ownerId?: UserId;
}

/** roles → the permissions that role holds, as data. */
export type GrantTable = Readonly<Record<OrgRole, ReadonlySet<Permission>>>;
