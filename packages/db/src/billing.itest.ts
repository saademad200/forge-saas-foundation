import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { isEntitled } from "@forge/billing";
import { applyMigrations } from "./apply.js";
import { createDb, type DbHandle } from "./client.js";
import { createOrganizationWithOwner } from "./tenancy.js";
import { processWebhook, subscriptionFor, type BillingEvent } from "./billing.js";

/**
 * Billing idempotency — the release-blocker gate. Proves a replayed
 * webhook grants exactly once, and that entitlement checks compose plan + status.
 */
const OWNER_URL = process.env.DATABASE_URL ?? "postgres://forge:forge@localhost:5434/forge";

let h: DbHandle;

beforeAll(async () => {
  await applyMigrations(OWNER_URL);
  h = createDb(OWNER_URL, 2);
}, 60000);

afterAll(async () => {
  if (h) await h.close();
});

async function newOrg(): Promise<string> {
  const r = await createOrganizationWithOwner(h.db, {
    name: "Biller",
    slug: "bill-" + randomUUID().slice(0, 8),
    ownerUserId: randomUUID(),
  });
  return r.orgId;
}

describe("processWebhook — idempotent, single-transaction projection", () => {
  it("a replayed event grants EXACTLY once", async () => {
    const orgId = await newOrg();
    const event: BillingEvent = {
      eventId: "evt_" + randomUUID(),
      type: "customer.subscription.updated",
      orgId,
      plan: "pro",
      status: "active",
    };

    const first = await processWebhook(h.db, event);
    const second = await processWebhook(h.db, event); // same eventId — a replay
    const third = await processWebhook(h.db, event);

    expect(first).toBe("processed");
    expect(second).toBe("duplicate");
    expect(third).toBe("duplicate");

    // The ledger holds exactly one row for this event id.
    const rows = await h.sql.unsafe(`select count(*)::int as n from webhook_event where event_id = '${event.eventId}'`);
    expect((rows[0] as { n: number }).n).toBe(1);

    const sub = await subscriptionFor(h.db, orgId);
    expect(sub).toEqual({ plan: "pro", status: "active" });
  });

  it("a later, distinct event updates the projection (upgrade), still idempotently", async () => {
    const orgId = await newOrg();
    await processWebhook(h.db, {
      eventId: "evt_" + randomUUID(),
      type: "created",
      orgId,
      plan: "pro",
      status: "active",
    });
    await processWebhook(h.db, {
      eventId: "evt_" + randomUUID(),
      type: "updated",
      orgId,
      plan: "enterprise",
      status: "active",
    });
    const sub = await subscriptionFor(h.db, orgId);
    expect(sub?.plan).toBe("enterprise");
  });

  it("a past_due status keeps entitlements (grace), canceled falls back to free", async () => {
    const orgId = await newOrg();
    await processWebhook(h.db, {
      eventId: "evt_" + randomUUID(),
      type: "past_due",
      orgId,
      plan: "pro",
      status: "past_due",
    });
    const sub = (await subscriptionFor(h.db, orgId))!;
    expect(isEntitled(sub.plan, sub.status, "agents")).toBe(true); // still entitled in grace

    await processWebhook(h.db, {
      eventId: "evt_" + randomUUID(),
      type: "canceled",
      orgId,
      plan: "pro",
      status: "canceled",
    });
    const after = (await subscriptionFor(h.db, orgId))!;
    expect(isEntitled(after.plan, after.status, "agents")).toBe(false); // fell back to free
  });
});
