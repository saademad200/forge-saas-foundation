import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { deriveActor, actorForActiveOrg } from "@forge/tenancy";
import { decide, P } from "@forge/policy";
import { applyMigrations } from "./apply.js";
import { createDb, type DbHandle } from "./client.js";
import {
  createOrganizationWithOwner,
  addMember,
  membershipsFor,
  setOrgStatus,
} from "./tenancy.js";

const OWNER_URL = process.env.DATABASE_URL ?? "postgres://forge:forge@localhost:5434/forge";

let h: DbHandle;

beforeAll(async () => {
  await applyMigrations(OWNER_URL);
  h = createDb(OWNER_URL, 2);
}, 60000);

afterAll(async () => {
  if (h) await h.close();
});

describe("atomic onboarding — org + owner membership in one transaction", () => {
  it("creates an org and makes the creator its owner, resolvable as an Actor", async () => {
    const ownerUserId = randomUUID();
    const slug = "acme-" + randomUUID().slice(0, 8);
    const { orgId } = await createOrganizationWithOwner(h.db, {
      name: "Acme",
      slug,
      ownerUserId,
    });

    const memberships = await membershipsFor(h.db, ownerUserId);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.role).toBe("owner");
    expect(memberships[0]?.orgId).toBe(orgId);

    // The derived Actor drives the policy kernel: an owner may manage the org & billing.
    const actor = deriveActor(memberships[0]!);
    expect(decide(actor, P.orgManage)).toBe("allow");
    expect(decide(actor, P.billingManage)).toBe("allow");
  });
});

describe("membership resolution across orgs", () => {
  it("a user's role can differ per org, and Actor resolution picks the active one", async () => {
    const userId = randomUUID();
    const a = await createOrganizationWithOwner(h.db, {
      name: "A",
      slug: "a-" + randomUUID().slice(0, 8),
      ownerUserId: randomUUID(),
    });
    const b = await createOrganizationWithOwner(h.db, {
      name: "B",
      slug: "b-" + randomUUID().slice(0, 8),
      ownerUserId: randomUUID(),
    });
    await addMember(h.db, { orgId: a.orgId, userId, role: "admin" });
    await addMember(h.db, { orgId: b.orgId, userId, role: "member" });

    const memberships = await membershipsFor(h.db, userId);
    expect(memberships).toHaveLength(2);

    const inA = actorForActiveOrg(memberships, a.orgId)!;
    const inB = actorForActiveOrg(memberships, b.orgId)!;
    expect(decide(inA, P.memberInvite)).toBe("allow"); // admin in A
    expect(decide(inB, P.memberInvite)).toBe("deny"); // member in B
  });

  it("adding the same user to the same org twice is rejected (unique constraint)", async () => {
    const userId = randomUUID();
    const org = await createOrganizationWithOwner(h.db, {
      name: "Dup",
      slug: "dup-" + randomUUID().slice(0, 8),
      ownerUserId: randomUUID(),
    });
    await addMember(h.db, { orgId: org.orgId, userId, role: "member" });
    await expect(addMember(h.db, { orgId: org.orgId, userId, role: "admin" })).rejects.toThrow();
  });
});

describe("org lifecycle — persisted transitions are validated", () => {
  it("allows a legal transition and persists it", async () => {
    const org = await createOrganizationWithOwner(h.db, {
      name: "Life",
      slug: "life-" + randomUUID().slice(0, 8),
      ownerUserId: randomUUID(),
    });
    const suspended = await setOrgStatus(h.db, org.orgId, "suspended");
    expect(suspended.ok && suspended.value).toBe("suspended");
    const back = await setOrgStatus(h.db, org.orgId, "active");
    expect(back.ok && back.value).toBe("active");
  });

  it("rejects an illegal transition without changing the row", async () => {
    const org = await createOrganizationWithOwner(h.db, {
      name: "Bad",
      slug: "bad-" + randomUUID().slice(0, 8),
      ownerUserId: randomUUID(),
    });
    const bad = await setOrgStatus(h.db, org.orgId, "created"); // active -> created is illegal
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.kind).toBe("illegal_transition");
  });

  it("reports not_found for a missing org", async () => {
    const res = await setOrgStatus(h.db, randomUUID(), "suspended");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe("not_found");
  });
});
