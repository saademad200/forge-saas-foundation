import { OrgId, type UserId } from "@forge/kernel";
import type { Actor } from "@forge/policy";
import { actorForActiveOrg, type Membership } from "@forge/tenancy";

/**
 * The provider-agnostic session port. Better-Auth (the chosen base) is a server-
 * framework integration and lives in the app/interface layer; the CORE depends only
 * on this port, so the auth base stays swappable. The app implements `getSession` by
 * reading Better-Auth's session, then calls `resolveActor` to turn it into the
 * authorization Actor. Authentication answers "who are you"; Forge's tenancy answers
 * "which org, what role" — resolveActor is the bridge.
 */
export interface Session {
  readonly userId: UserId;
  /** The org the user is currently acting in, if they have selected/have one. */
  readonly activeOrgId?: OrgId;
}

export interface SessionPort {
  getSession(request: Request): Promise<Session | null>;
}

export type ResolveOutcome =
  | { readonly kind: "actor"; readonly actor: Actor }
  | { readonly kind: "no_session" }
  | { readonly kind: "needs_org_selection"; readonly options: readonly OrgId[] }
  | { readonly kind: "no_membership" };

/**
 * Turn a session + the user's memberships into an authorization outcome. Explicit
 * about the states handled explicitly: no session; a user with several orgs and
 * none selected (the UI must prompt); a selected org the user is not a member of
 * (deny — never fall back to a default org, which would be a cross-tenant leak).
 */
export function resolveActor(
  session: Session | null,
  memberships: readonly Membership[],
): ResolveOutcome {
  if (!session) return { kind: "no_session" };

  if (session.activeOrgId !== undefined) {
    const actor = actorForActiveOrg(memberships, session.activeOrgId);
    return actor ? { kind: "actor", actor } : { kind: "no_membership" };
  }

  // No active org selected: default only if there is exactly one membership.
  if (memberships.length === 1) {
    return { kind: "actor", actor: actorForActiveOrg(memberships, memberships[0]!.orgId)! };
  }
  if (memberships.length === 0) return { kind: "no_membership" };
  return { kind: "needs_org_selection", options: memberships.map((m) => m.orgId) };
}
