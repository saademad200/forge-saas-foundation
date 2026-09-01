import { describe, it, expect } from "vitest";
import { MockBackend } from "@forge/ai";
import type { VectorHit } from "@forge/db";
import { chunk } from "./chunk.js";
import { answer } from "./rag.js";

const hit = (content: string): VectorHit => ({
  id: "id",
  orgId: "org",
  content,
  embedding: null,
  createdAt: new Date(0),
  distance: 0.1,
});

describe("chunk", () => {
  it("splits paragraphs", () => {
    expect(chunk("Para one.\n\nPara two is here.")).toEqual(["Para one.", "Para two is here."]);
  });

  it("splits a long paragraph by sentences within the size budget", () => {
    const sentence = "This is a sentence of moderate length. ";
    const long = sentence.repeat(30); // ~1170 chars, one paragraph
    const chunks = chunk(long, 300);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(340);
  });
});

describe("answer", () => {
  it("synthesizes a cited answer grounded in the retrieved context", async () => {
    const backend = new MockBackend(() => "Invoices are paid via the billing portal [1].");
    const res = await answer(backend, "how do I pay?", [hit("Invoices are paid via the billing portal.")]);
    expect(res.answer).toContain("[1]");
    expect(res.sources).toHaveLength(1);
    expect(res.cost).toBe(0); // mock backend
  });
});
