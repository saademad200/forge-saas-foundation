import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { OrgId, UserId } from "@forge/kernel";
import type { Actor } from "@forge/policy";
import { applyMigrations } from "./apply.js";
import { createDb, type DbHandle } from "./client.js";
import { withTenant, withoutTenant } from "./tenant.js";
import { repositories } from "./repositories.js";

/**
 * THE ISOLATION PROOF SUITE — the release-blocker gate (ARCHITECTURE §5).
 *
 * Run as the non-owner `forge_app` role, so RLS actually applies. Seeded as the
 * owner (RLS-exempt). The claim these gates certify, and no more: cross-tenant READ
 * and WRITE are denied under the application layer AND Postgres RLS, on relational
 * AND vector data, and an unset tenant fails closed (zero rows, never all).
 *
 * Requires a running Postgres+pgvector (docker-compose). Connection via env:
 *   DATABASE_URL           owner (default postgres://forge:forge@localhost:5434/forge)
 *   FORGE_APP_DATABASE_URL app role (default postgres://forge_app:forge_app@localhost:5434/forge)
 */
const OWNER_URL = process.env.DATABASE_URL ?? "postgres://forge:forge@localhost:5434/forge";
const APP_URL =
  process.env.FORGE_APP_DATABASE_URL ?? "postgres://forge_app:forge_app@localhost:5434/forge";

const EMBED_A = `[${Array(384).fill(0.1).join(",")}]`;
const EMBED_B = `[${Array(384).fill(0.9).join(",")}]`;

let app: DbHandle;
let orgA: string;
let orgB: string;

const actorFor = (orgId: string): Actor => ({
  userId: UserId("u_" + orgId.slice(0, 8)),
  orgId: OrgId(orgId),
  orgRole: "owner",
});

beforeAll(async () => {
  await applyMigrations(OWNER_URL);

  // Seed as the owner (RLS-exempt): two orgs, each with one item and one chunk.
  const owner = createDb(OWNER_URL, 1);
  try {
    await owner.sql.unsafe("delete from document_chunk; delete from app_item; delete from organization;");
    const [a] = await owner.sql.unsafe(
      "insert into organization (name, slug) values ('Org A', 'org-a') returning id",
    );
    const [b] = await owner.sql.unsafe(
      "insert into organization (name, slug) values ('Org B', 'org-b') returning id",
    );
    orgA = (a as unknown as { id: string }).id;
    orgB = (b as unknown as { id: string }).id;
    await owner.sql.unsafe(
      `insert into app_item (org_id, title) values ('${orgA}', 'A-item'), ('${orgB}', 'B-item')`,
    );
    await owner.sql.unsafe(
      `insert into document_chunk (org_id, content, embedding) values ` +
        `('${orgA}', 'A-chunk', '${EMBED_A}'::vector), ('${orgB}', 'B-chunk', '${EMBED_B}'::vector)`,
    );
  } finally {
    await owner.close();
  }

  app = createDb(APP_URL, 5);
}, 60000);

afterAll(async () => {
  if (app) await app.close();
});

describe("iso:read/relational — a tenant reads only its own rows", () => {
  it("org A's repository lists only A's items", async () => {
    const items = await withTenant(app.db, OrgId(orgA), (tx) =>
      repositories(tx, actorFor(orgA)).items.list(),
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("A-item");
  });

  it("a RAW select under tenant A returns zero of B's rows (RLS, not just the repo scope)", async () => {
    const rows = await withTenant(app.db, OrgId(orgA), (tx) =>
      tx.execute(sql`select * from app_item where title = 'B-item'`),
    );
    expect(rows).toHaveLength(0);
  });
});

describe("iso:read/vector — a tenant's ANN search returns only its own chunks", () => {
  it("org A searching with B's own vector still gets only A's chunk", async () => {
    // Even querying with B's embedding, RLS + the repo scope admit only A's chunks.
    const hits = await withTenant(app.db, OrgId(orgA), (tx) =>
      repositories(tx, actorFor(orgA)).chunks.search(
        Array(384).fill(0.9),
        10,
      ),
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.content).toBe("A-chunk");
  });
});

describe("iso:write — a tenant cannot write into another org", () => {
  it("inserting a row attributed to org B under tenant A is rejected (RLS WITH CHECK)", async () => {
    await expect(
      withTenant(app.db, OrgId(orgA), (tx) =>
        tx.execute(sql.raw(`insert into app_item (org_id, title) values ('${orgB}', 'smuggled')`)),
      ),
    ).rejects.toThrow();
  });

  it("updating org B's item under tenant A affects zero rows", async () => {
    // Fetch B's item id as the owner (RLS-exempt) — a real cross-tenant id to attack with.
    const targetId = await bItemId();
    const updated = await withTenant(app.db, OrgId(orgA), (tx) =>
      repositories(tx, actorFor(orgA)).items.update(targetId, { title: "hijacked" }),
    );
    expect(updated).toBeUndefined();
  });
});

describe("iso:fail-closed — no tenant set yields zero rows, never all", () => {
  it("a query with no forge.org_id GUC returns nothing", async () => {
    const rows = await withoutTenant(app.db, (tx) => tx.execute(sql`select * from app_item`));
    expect(rows).toHaveLength(0);
  });
});

/** Fetch B's item id as the owner (RLS-exempt) — a legitimate cross-tenant id to attack with. */
async function bItemId(): Promise<string> {
  const owner = createDb(OWNER_URL, 1);
  try {
    const [row] = await owner.sql.unsafe(`select id from app_item where org_id = '${orgB}'`);
    return (row as unknown as { id: string }).id;
  } finally {
    await owner.close();
  }
}
