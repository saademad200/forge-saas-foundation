import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { OrgId, UserId } from "@forge/kernel";
import type { Actor } from "@forge/policy";
import { applyMigrations, createDb, createOrganizationWithOwner, type DbHandle } from "@forge/db";
import { HashEmbedder, MockBackend } from "@forge/ai";
import { ingest, retrieve, answer } from "./rag.js";

/**
 * Live RAG eval against Postgres+pgvector. Proves two things end to end:
 *   1. Retrieval quality — a query retrieves the topically-matching chunk (objective,
 *      not vibes): the invoice question surfaces the invoice doc, top-ranked.
 *   2. Tenant isolation of the RAG runtime — org B retrieving org A's query gets ZERO
 *      chunks (ingest + retrieve run under withTenant + RLS).
 */
const OWNER_URL = process.env.DATABASE_URL ?? "postgres://forge:forge@localhost:5434/forge";
const APP_URL =
  process.env.FORGE_APP_DATABASE_URL ?? "postgres://forge_app:forge_app@localhost:5434/forge";

const embedder = new HashEmbedder();
let app: DbHandle;
let actorA: Actor;
let actorB: Actor;

const DOCS = [
  "Billing and invoices. To pay an invoice, open the billing portal and choose a payment method. Invoices are issued monthly and payment is due within 30 days.",
  "Weather in the mountains. The alpine climate is cold and snowy in winter, with strong winds above the treeline and mild summers in the valleys.",
  "Security and access. Enable two-factor authentication for every account. Rotate API keys regularly and never commit secrets to source control.",
];

beforeAll(async () => {
  await applyMigrations(OWNER_URL);
  const owner = createDb(OWNER_URL, 1);
  try {
    await owner.sql.unsafe("delete from document_chunk; delete from membership; delete from app_item; delete from organization;");
    const a = await createOrganizationWithOwner(owner.db, { name: "A", slug: "rag-a-" + Date.now(), ownerUserId: crypto.randomUUID() });
    const b = await createOrganizationWithOwner(owner.db, { name: "B", slug: "rag-b-" + Date.now(), ownerUserId: crypto.randomUUID() });
    actorA = { userId: UserId("ua"), orgId: OrgId(a.orgId), orgRole: "owner" };
    actorB = { userId: UserId("ub"), orgId: OrgId(b.orgId), orgRole: "owner" };
  } finally {
    await owner.close();
  }
  app = createDb(APP_URL, 5);
  // Ingest the corpus into org A only (as the app role, under RLS).
  for (const doc of DOCS) await ingest(app, embedder, actorA, doc);
}, 60000);

afterAll(async () => {
  if (app) await app.close();
});

describe("retrieval quality", () => {
  it("retrieves the invoice doc for a billing question, top-ranked", async () => {
    const hits = await retrieve(app, embedder, actorA, "how do I pay my invoice", 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.content.toLowerCase()).toContain("invoice");
  });

  it("retrieves the security doc for a security question", async () => {
    const hits = await retrieve(app, embedder, actorA, "how do I protect API keys and accounts", 3);
    expect(hits[0]?.content.toLowerCase()).toMatch(/security|api key|two-factor/);
  });
});

describe("tenant isolation of the RAG runtime", () => {
  it("org B retrieves ZERO of org A's chunks for the same query", async () => {
    const hits = await retrieve(app, embedder, actorB, "how do I pay my invoice", 3);
    expect(hits).toHaveLength(0);
  });
});

describe("cited answer", () => {
  it("synthesizes an answer grounded in the retrieved context (mock backend, no quota)", async () => {
    const hits = await retrieve(app, embedder, actorA, "how do I pay my invoice", 2);
    const backend = new MockBackend(() => "Open the billing portal and choose a payment method [1].");
    const res = await answer(backend, "how do I pay my invoice", hits);
    expect(res.answer).toContain("[1]");
    expect(res.sources.length).toBeGreaterThan(0);
  });
});
