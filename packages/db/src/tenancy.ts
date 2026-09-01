import { eq } from "drizzle-orm";
import { OrgId, UserId, ok, err, type Result } from "@forge/kernel";
import {
  assertTransition,
  type Membership,
  type OrgStatus,
  type TransitionError,
} from "@forge/tenancy";
import type { Db } from "./client.js";
import { organization, membership } from "./schema.js";

/**
 * Tenancy persistence — SYSTEM operations (onboarding, auth resolution, admin), run
 * as the owner connection because they cross the tenant boundary by design (creating
 * an org before any membership exists; listing a user's orgs). They are never reachable
 * from a tenant-scoped request path.
 */

export interface OnboardingResult {
  readonly orgId: OrgId;
  readonly membershipId: string;
}

/**
 * Create an org (active) AND its owner membership in ONE transaction, or neither. This
 * resolves the first-user empty state — a signed-up user with no org — without ever
 * leaving an orphaned user or an ownerless org (the atomic onboarding the design notes
 * flagged).
 */
export async function createOrganizationWithOwner(
  db: Db,
  input: { name: string; slug: string; ownerUserId: string },
): Promise<OnboardingResult> {
  return db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organization)
      .values({ name: input.name, slug: input.slug, status: "active" })
      .returning();
    if (!org) throw new Error("failed to create organization");
    const [mem] = await tx
      .insert(membership)
      .values({ orgId: org.id, userId: input.ownerUserId, role: "owner" })
      .returning();
    if (!mem) throw new Error("failed to create owner membership");
    return { orgId: OrgId(org.id), membershipId: mem.id };
  });
}

/** Add a member with a role. Fails (unique constraint) if already a member. */
export async function addMember(
  db: Db,
  input: { orgId: string; userId: string; role: "admin" | "member" },
): Promise<string> {
  const [mem] = await db
    .insert(membership)
    .values({ orgId: input.orgId, userId: input.userId, role: input.role })
    .returning();
  if (!mem) throw new Error("failed to add member");
  return mem.id;
}

/** A user's memberships across all orgs — the input to Actor resolution at request time. */
export async function membershipsFor(db: Db, userId: string): Promise<Membership[]> {
  const rows = await db.select().from(membership).where(eq(membership.userId, userId));
  return rows.map((r) => ({ userId: UserId(r.userId), orgId: OrgId(r.orgId), role: r.role }));
}

/** Change an org's lifecycle status, validated by the pure state machine. */
export async function setOrgStatus(
  db: Db,
  orgId: string,
  to: OrgStatus,
): Promise<Result<OrgStatus, TransitionError | { kind: "not_found" }>> {
  return db.transaction(async (tx) => {
    const [org] = await tx.select().from(organization).where(eq(organization.id, orgId));
    if (!org) return err({ kind: "not_found" as const });
    const check = assertTransition(org.status, to);
    if (!check.ok) return check;
    await tx.update(organization).set({ status: to }).where(eq(organization.id, orgId));
    return ok(to);
  });
}
