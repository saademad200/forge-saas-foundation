/**
 * Embeddings. The interface is what matters — a production deployment swaps in a
 * local sentence-transformer or an API embedder. `HashEmbedder` is a deterministic,
 * offline, ZERO-COST default (a hashed bag-of-words → 384-dim L2-normalized vector):
 * it gives *lexical* similarity (texts sharing vocabulary score higher under cosine),
 * which keeps the free/local vector path honest for dev, CI, and the demo. It is not
 * semantic — swap it for a real embedder when retrieval quality matters, without
 * touching the RAG pipeline.
 */
export interface Embedder {
  readonly dimensions: number;
  embed(text: string): number[];
}

function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export class HashEmbedder implements Embedder {
  readonly dimensions = 384;

  embed(text: string): number[] {
    const vec = new Array<number>(this.dimensions).fill(0);
    const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    for (const tok of tokens) {
      const idx = fnv1a(tok) % this.dimensions;
      vec[idx] = (vec[idx] ?? 0) + 1;
    }
    let sumSq = 0;
    for (const x of vec) sumSq += x * x;
    const norm = Math.sqrt(sumSq) || 1;
    return vec.map((x) => x / norm);
  }
}

/** Cosine similarity of two equal-length vectors. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot; // inputs are L2-normalized, so dot == cosine
}
