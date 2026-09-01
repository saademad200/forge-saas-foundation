import { and, eq, sql } from "drizzle-orm";
import type { Actor } from "@forge/policy";
import { appItem, documentChunk, type AppItem, type DocumentChunk } from "./schema.js";
import type { Tx } from "./client.js";

/**
 * Tenant-scoped repositories. There is NO exported way to obtain a repository without
 * an `Actor` — every read is AND-ed with `org_id = actor.orgId`, and `list` takes a
 * FILTER, never a full predicate, so you cannot fetch-then-filter (the count you
 * showed above a list would already be wrong). This is the application-layer belt; it
 * sits on top of the database RLS braces. Forgetting the tenant scope is not a
 * discipline problem here — the factory has no code path that omits it.
 *
 * The ONE bypass is `systemRepositories` below: greppable, and intended only for
 * migrations/seed/system jobs that legitimately run without a single-tenant scope.
 */

export interface ItemFilter {
  readonly ownerId?: string;
}

export interface VectorHit extends DocumentChunk {
  readonly distance: number;
}

export interface Repositories {
  readonly items: {
    list(filter?: ItemFilter): Promise<AppItem[]>;
    create(input: { title: string; ownerId?: string }): Promise<AppItem>;
    update(id: string, patch: { title?: string }): Promise<AppItem | undefined>;
  };
  readonly chunks: {
    insert(input: { content: string; embedding: number[] }): Promise<DocumentChunk>;
    search(embedding: number[], limit: number): Promise<VectorHit[]>;
  };
}

const one = <T>(rows: T[], what: string): T => {
  const row = rows[0];
  if (row === undefined) throw new Error(`expected exactly one ${what}, got none`);
  return row;
};

/** Format an embedding as a pgvector literal, e.g. [0.1,0.2,0.3]. */
export const toVectorLiteral = (embedding: number[]): string => `[${embedding.join(",")}]`;

export function repositories(tx: Tx, actor: Actor): Repositories {
  const orgId = actor.orgId as unknown as string;

  return {
    items: {
      list: (filter) =>
        tx
          .select()
          .from(appItem)
          .where(
            and(
              eq(appItem.orgId, orgId),
              filter?.ownerId !== undefined ? eq(appItem.ownerId, filter.ownerId) : undefined,
            ),
          ),

      create: async (input) => {
        const rows = await tx
          .insert(appItem)
          .values({ orgId, ownerId: input.ownerId ?? null, title: input.title })
          .returning();
        return one(rows, "app_item");
      },

      update: async (id, patch) => {
        const rows = await tx
          .update(appItem)
          .set(patch)
          .where(and(eq(appItem.id, id), eq(appItem.orgId, orgId)))
          .returning();
        return rows[0];
      },
    },

    chunks: {
      insert: async (input) => {
        const rows = await tx
          .insert(documentChunk)
          .values({ orgId, content: input.content, embedding: input.embedding })
          .returning();
        return one(rows, "document_chunk");
      },

      // Cosine-distance ANN, tenant-scoped IN the query. Even if this scope were
      // dropped, RLS on the embedding table would still return zero of another
      // org's chunks — belt and braces.
      search: (embedding, limit) => {
        const vec = toVectorLiteral(embedding);
        return tx
          .select({
            id: documentChunk.id,
            orgId: documentChunk.orgId,
            content: documentChunk.content,
            embedding: documentChunk.embedding,
            createdAt: documentChunk.createdAt,
            distance: sql<number>`document_chunk.embedding <=> ${vec}::vector`,
          })
          .from(documentChunk)
          .where(eq(documentChunk.orgId, orgId))
          .orderBy(sql`document_chunk.embedding <=> ${vec}::vector`)
          .limit(limit);
      },
    },
  };
}

/**
 * The ONLY unscoped repository access. Greppable on purpose: a future architecture
 * test fails the build if `systemRepositories` is imported outside the CLI / migration
 * / system-job code. Never reachable from a request handler.
 */
export function systemRepositories(tx: Tx) {
  return {
    listAllItems: (): Promise<AppItem[]> => tx.select().from(appItem),
  };
}
