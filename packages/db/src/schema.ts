import { pgTable, pgEnum, uuid, text, timestamp, vector, index, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * The schema. Every TENANT-OWNED table carries `org_id` — the discriminator that
 * both the application-layer repository scope and the database RLS policy key off.
 * The two demo tables (`app_item`, `document_chunk`) are the isolation subjects:
 * one relational, one vector. They prove the belt-and-braces isolation on both data
 * shapes (the vector path is the one no boilerplate in the field guards).
 *
 * NOTE: `organization` is a minimal tenant table for P1's isolation proof. When
 * Better-Auth's org plugin is wired (P1 auth), its organization/member/user tables
 * become the source of truth and this is reconciled to reference them; the isolation
 * mechanism (org_id + RLS + actor-bound repos) is unchanged by that swap.
 */

export const orgStatus = pgEnum("org_status", ["created", "active", "suspended", "deleting"]);
export const orgRole = pgEnum("org_role", ["owner", "admin", "member"]);
export const planEnum = pgEnum("plan", ["free", "pro", "enterprise"]);
export const subStatus = pgEnum("sub_status", ["active", "past_due", "grace", "canceled"]);

export const organization = pgTable("organization", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: orgStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Membership maps a user to an org with a role. The bridge from authentication
 * (Better-Auth owns the user table) to authorization (the org role that becomes the
 * Actor's `orgRole`). System-managed for now (onboarding/auth queries it by user);
 * a tenant-scoped "list members of my org" with RLS is a later hardening.
 */
export const membership = pgTable(
  "membership",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    role: orgRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("membership_org_user_uq").on(t.orgId, t.userId)],
);

/** Relational isolation subject: a generic tenant-owned record. */
export const appItem = pgTable(
  "app_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // The user who created it (Better-Auth owns the user table; no FK yet).
    ownerId: uuid("owner_id"),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("app_item_org_idx").on(t.orgId)],
);

/** Vector isolation subject: a RAG chunk. The embedding column is tenant-scoped too. */
export const documentChunk = pgTable(
  "document_chunk",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    // 384 dims = a common free/local embedding size (e.g. all-MiniLM-L6-v2).
    embedding: vector("embedding", { dimensions: 384 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("document_chunk_org_idx").on(t.orgId)],
);

/**
 * The webhook idempotency ledger: `event_id` (Stripe's evt_...) is UNIQUE, so a
 * replayed event cannot be processed twice. The event insert and the entitlement
 * projection happen in ONE transaction (see billing.ts) — the classic no-double-grant
 * discipline.
 */
export const webhookEvent = pgTable("webhook_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: text("event_id").notNull().unique(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

/** The entitlement projection: one subscription per org, updated from webhook events. */
export const subscription = pgTable("subscription", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: "cascade" }),
  plan: planEnum("plan").notNull().default("free"),
  status: subStatus("status").notNull().default("active"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Organization = typeof organization.$inferSelect;
export type MembershipRow = typeof membership.$inferSelect;
export type SubscriptionRow = typeof subscription.$inferSelect;
export type AppItem = typeof appItem.$inferSelect;
export type DocumentChunk = typeof documentChunk.$inferSelect;
