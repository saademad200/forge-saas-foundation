import { eq, sql } from "drizzle-orm";
import type { Plan, SubStatus } from "@forge/billing";
import { webhookEvent, subscription } from "./schema.js";
import type { Db } from "./client.js";

/**
 * Billing persistence — the idempotent webhook path (no double-grant,
 * no partial-state freeze).
 */
export interface BillingEvent {
  readonly eventId: string; // Stripe evt_... — the idempotency key
  readonly type: string; // e.g. "customer.subscription.updated"
  readonly orgId: string;
  readonly plan: Plan;
  readonly status: SubStatus;
  readonly currentPeriodEnd?: Date;
}

export type WebhookOutcome = "processed" | "duplicate";

/**
 * Record the event AND apply the entitlement projection in ONE transaction. A
 * replayed event (same `eventId`) hits the UNIQUE constraint on the FIRST statement,
 * aborting the whole transaction — so the projection is never applied twice, and a
 * crash between the two writes rolls back BOTH (the id is never recorded without the
 * projection, so a retry re-does the whole thing rather than freezing partial state).
 */
export async function processWebhook(db: Db, event: BillingEvent): Promise<WebhookOutcome> {
  try {
    return await db.transaction(async (tx) => {
      // Idempotency ledger first: a duplicate throws here and aborts everything below.
      await tx.insert(webhookEvent).values({ eventId: event.eventId, type: event.type });
      // Entitlement projection: upsert the org's single subscription row.
      await tx
        .insert(subscription)
        .values({
          orgId: event.orgId,
          plan: event.plan,
          status: event.status,
          currentPeriodEnd: event.currentPeriodEnd ?? null,
        })
        .onConflictDoUpdate({
          target: subscription.orgId,
          set: {
            plan: event.plan,
            status: event.status,
            currentPeriodEnd: event.currentPeriodEnd ?? null,
            updatedAt: sql`now()`,
          },
        });
      return "processed" as const;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return "duplicate";
    throw e;
  }
}

/** The current subscription for an org, for entitlement checks (compose with @forge/billing). */
export async function subscriptionFor(
  db: Db,
  orgId: string,
): Promise<{ plan: Plan; status: SubStatus } | null> {
  const [row] = await db.select().from(subscription).where(eq(subscription.orgId, orgId));
  return row ? { plan: row.plan, status: row.status } : null;
}

/**
 * True for a Postgres unique-violation (SQLSTATE 23505). drizzle wraps the driver
 * error, so the code can live on `e` OR on `e.cause`; we check both, plus the
 * message as a last resort.
 */
function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string }; message?: string } | null;
  if (err === null || typeof err !== "object") return false;
  if (err.code === "23505" || err.cause?.code === "23505") return true;
  return typeof err.message === "string" && /duplicate key value|unique constraint/i.test(err.message);
}
