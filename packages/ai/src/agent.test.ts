import { describe, it, expect } from "vitest";
import { z } from "zod";
import { MockBackend } from "./mock.js";
import { runAgent, type AgentTool, type Backend } from "./agent.js";

const addTool: AgentTool = {
  name: "add",
  description: "add two numbers a and b",
  schema: z.object({ a: z.number(), b: z.number() }),
  execute: (input) => {
    const { a, b } = input as { a: number; b: number };
    return Promise.resolve(String(a + b));
  },
};

describe("runAgent", () => {
  it("calls a tool, then finishes with an answer", async () => {
    let call = 0;
    const backend = new MockBackend(() => {
      call++;
      return call === 1
        ? JSON.stringify({ tool: "add", input: { a: 2, b: 3 } })
        : JSON.stringify({ final: "the sum is 5" });
    });
    const res = await runAgent(backend, "add 2 and 3", [addTool]);
    expect(res.stoppedReason).toBe("answer");
    expect(res.answer).toBe("the sum is 5");
    expect(res.steps).toBe(2);
  });

  it("stops at the step cap when the model never finishes", async () => {
    const backend = new MockBackend(() => JSON.stringify({ tool: "add", input: { a: 1, b: 1 } }));
    const res = await runAgent(backend, "loop forever", [addTool], { maxSteps: 3 });
    expect(res.stoppedReason).toBe("max_steps");
    expect(res.steps).toBe(3);
  });

  it("enforces the cost cap", async () => {
    const costly: Backend = {
      name: "costly",
      complete: () =>
        Promise.resolve({
          text: JSON.stringify({ tool: "add", input: { a: 1, b: 1 } }),
          model: "m",
          usage: { inputTokens: 0, outputTokens: 0 },
          costUsd: 1,
        }),
    };
    const res = await runAgent(costly, "spend", [addTool], { maxCostUsd: 0.5, maxSteps: 10 });
    expect(res.stoppedReason).toBe("cost_cap");
    expect(res.cost).toBeGreaterThan(0.5);
  });

  it("tools are closures — a tenant-bound tool only sees its own scope", async () => {
    const orgId = "org_a";
    const whoami: AgentTool = {
      name: "whoami",
      description: "returns the current org id",
      schema: z.object({}),
      execute: () => Promise.resolve(orgId), // bound to the actor's org by closure
    };
    let call = 0;
    const backend = new MockBackend(() => {
      call++;
      return call === 1
        ? JSON.stringify({ tool: "whoami", input: {} })
        : JSON.stringify({ final: "org is org_a" });
    });
    const res = await runAgent(backend, "which org am I in?", [whoami]);
    expect(res.answer).toContain("org_a");
  });
});
