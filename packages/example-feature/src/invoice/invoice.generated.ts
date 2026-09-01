// @generated from spec 01530ddbe963 by @forge/codegen@0.0.0 — DO NOT EDIT.
// Customize behavior in invoice.custom.ts (hand-owned; never regenerated).
// The regenerate-and-diff CI check fails if this file is hand-edited.
import { pgTable, uuid, timestamp, text, integer, boolean, index } from "drizzle-orm/pg-core";
import { and, eq } from "drizzle-orm";
import type { Actor } from "@forge/policy";
import type { Tx } from "@forge/db";

export const invoice = pgTable(
  "invoice",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull(),
    number: text("number").notNull(),
    amountCents: integer("amount_cents").notNull(),
    paid: boolean("paid"),
    memo: text("memo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invoice_org_idx").on(t.orgId)],
);

export type Invoice = typeof invoice.$inferSelect;
export interface NewInvoice {
  number: string;
  amountCents: number;
  paid?: boolean;
  memo?: string;
}

/**
 * Tenant-scoped repository. EVERY query is AND-ed with the actor's org — there is no
 * generated code path that omits the org scope. Sits on top of the DB-layer RLS.
 */
export function invoiceRepository(tx: Tx, actor: Actor) {
  const orgId = actor.orgId as unknown as string;
  return {
    list: () => tx.select().from(invoice).where(eq(invoice.orgId, orgId)),
    get: (id: string) =>
      tx.select().from(invoice).where(and(eq(invoice.id, id), eq(invoice.orgId, orgId))),
    create: (input: NewInvoice) =>
      tx.insert(invoice).values({ ...input, orgId }).returning(),
    update: (id: string, patch: Partial<NewInvoice>) =>
      tx.update(invoice).set(patch).where(and(eq(invoice.id, id), eq(invoice.orgId, orgId))).returning(),
    remove: (id: string) =>
      tx.delete(invoice).where(and(eq(invoice.id, id), eq(invoice.orgId, orgId))).returning(),
  };
}

/** Entity permissions per action, deny-by-default (composed into the policy grant table). */
export const invoiceGrants = {
  read: ["owner", "admin", "member"],
  create: ["owner", "admin"],
  update: ["owner", "admin"],
  delete: ["owner"],
} as const;
