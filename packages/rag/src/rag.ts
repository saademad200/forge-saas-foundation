import type { Actor } from "@forge/policy";
import { withTenant, repositories, type DbHandle, type VectorHit } from "@forge/db";
import type { Embedder, Backend } from "@forge/ai";
import { chunk } from "./chunk.js";

/**
 * Tenant-isolated RAG. Ingest and retrieve go through `withTenant` + the actor-scoped
 * repository + RLS, so a tenant can only ever ingest into and retrieve from its OWN
 * vectors — the `iso:read/vector` gate proves cross-tenant retrieval returns zero
 * rows. This is the AI-native piece no boilerplate ships: a RAG runtime that is
 * multi-tenant-safe by construction, not by a forgotten WHERE clause.
 */

/** Chunk, embed, and store a document for the actor's org. Returns the chunk count. */
export async function ingest(
  db: DbHandle,
  embedder: Embedder,
  actor: Actor,
  text: string,
): Promise<number> {
  const chunks = chunk(text);
  await withTenant(db.db, actor.orgId, async (tx) => {
    const repo = repositories(tx, actor);
    for (const c of chunks) {
      await repo.chunks.insert({ content: c, embedding: embedder.embed(c) });
    }
  });
  return chunks.length;
}

/** Embed the query and retrieve the top-k most similar chunks — for the actor's org only. */
export function retrieve(
  db: DbHandle,
  embedder: Embedder,
  actor: Actor,
  query: string,
  k = 5,
): Promise<VectorHit[]> {
  const qvec = embedder.embed(query);
  return withTenant(db.db, actor.orgId, (tx) => repositories(tx, actor).chunks.search(qvec, k));
}

export interface CitedAnswer {
  readonly answer: string;
  readonly sources: VectorHit[];
  readonly cost: number;
  readonly model: string;
}

/** Synthesize a cited answer from retrieved chunks, grounded ONLY in the context. */
export async function answer(
  backend: Backend,
  query: string,
  hits: VectorHit[],
): Promise<CitedAnswer> {
  const context = hits.map((h, i) => `[${i + 1}] ${h.content}`).join("\n\n");
  const system =
    "Answer the question using ONLY the numbered context. Cite sources inline like [1]. " +
    "If the answer is not in the context, say you don't know — do not invent facts.";
  const res = await backend.complete({
    system,
    prompt: `Context:\n${context}\n\nQuestion: ${query}`,
    maxTokens: 1024,
  });
  return { answer: res.text.trim(), sources: hits, cost: res.costUsd, model: res.model };
}
