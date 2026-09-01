import { describe, it, expect } from "vitest";
import { z } from "zod";
import { costFor, DEFAULT_MODEL } from "./backend.js";
import { MockBackend } from "./mock.js";
import { classify, extract, summarize } from "./steps.js";

describe("costFor", () => {
  it("prices Opus 4.8 by tokens", () => {
    expect(costFor("claude-opus-4-8", { inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(5);
    expect(costFor("claude-opus-4-8", { inputTokens: 0, outputTokens: 1_000_000 })).toBeCloseTo(25);
  });
  it("returns 0 for an unknown model (e.g. the subscription CLI backend)", () => {
    expect(costFor("mystery", { inputTokens: 999, outputTokens: 999 })).toBe(0);
  });
});

describe("MockBackend", () => {
  it("is deterministic and free, defaulting to the owner's model", async () => {
    const b = new MockBackend();
    const r = await b.complete({ prompt: "hi" });
    expect(r.text).toBe("hi");
    expect(r.model).toBe(DEFAULT_MODEL);
    expect(r.costUsd).toBe(0);
  });
});

describe("classify", () => {
  const labels = ["billing", "technical", "sales"];

  it("returns the label + confidence, accepting when confidence is high", async () => {
    const b = new MockBackend(() => JSON.stringify({ label: "billing", confidence: 0.92 }));
    const r = await classify(b, "my card was charged twice", labels);
    expect(r.output).toBe("billing");
    expect(r.confidence).toBe(0.92);
    expect(r.needsReview).toBe(false);
  });

  it("routes to review when confidence is below the threshold", async () => {
    const b = new MockBackend(() => JSON.stringify({ label: "sales", confidence: 0.4 }));
    const r = await classify(b, "maybe interested", labels, { reviewThreshold: 0.7 });
    expect(r.needsReview).toBe(true);
  });

  it("routes to review when the model returns an invalid label", async () => {
    const b = new MockBackend(() => JSON.stringify({ label: "nonsense", confidence: 0.99 }));
    const r = await classify(b, "x", labels);
    expect(r.needsReview).toBe(true);
    expect(r.confidence).toBe(0);
  });

  it("routes to review when the model returns unparseable output", async () => {
    const b = new MockBackend(() => "I think it's billing, probably.");
    const r = await classify(b, "x", labels);
    expect(r.needsReview).toBe(true);
  });
});

describe("extract", () => {
  const schema = z.object({ amount: z.number(), currency: z.string() });

  it("returns validated structured output on a good response", async () => {
    const b = new MockBackend(() => 'Here you go: {"amount": 42, "currency": "USD"}');
    const r = await extract(b, "invoice text", schema);
    expect(r.output).toEqual({ amount: 42, currency: "USD" });
    expect(r.needsReview).toBe(false);
  });

  it("returns null + needsReview when the output fails validation", async () => {
    const b = new MockBackend(() => '{"amount": "not a number"}');
    const r = await extract(b, "invoice text", schema);
    expect(r.output).toBeNull();
    expect(r.needsReview).toBe(true);
  });
});

describe("summarize", () => {
  it("returns the trimmed summary text", async () => {
    const b = new MockBackend(() => "  A concise summary.  ");
    const r = await summarize(b, "long text ...");
    expect(r.output).toBe("A concise summary.");
    expect(r.needsReview).toBe(false);
  });
});
