import { describe, it, expect } from "vitest";
import { HashEmbedder, cosine } from "./embedder.js";

const e = new HashEmbedder();

describe("HashEmbedder", () => {
  it("produces a 384-dim, deterministic, L2-normalized vector", () => {
    const v1 = e.embed("the quick brown fox");
    const v2 = e.embed("the quick brown fox");
    expect(v1).toHaveLength(384);
    expect(v1).toEqual(v2); // deterministic
    const norm = Math.sqrt(v1.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("gives higher cosine to texts that share vocabulary (lexical similarity)", () => {
    const query = e.embed("how do I pay my invoice");
    const related = e.embed("your invoice payment is due");
    const unrelated = e.embed("the weather in the mountains is cold");
    expect(cosine(query, related)).toBeGreaterThan(cosine(query, unrelated));
  });
});
