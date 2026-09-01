import { z } from "zod";
import type { Backend } from "./backend.js";
import { firstJson } from "./steps.js";

/**
 * A minimal tool-using agent primitive over a text backend (a ReAct-style JSON
 * protocol, so it works with the keyless CLI backend and the mock alike). Guardrails
 * are first-class: a step cap AND a cost cap bound every run. Tools are supplied by
 * the caller already bound to an Actor (a closure), so a tool that queries app data
 * only ever sees that tenant's rows and can call the policy kernel first — the agent
 * itself never crosses the tenant boundary.
 */
export interface AgentTool {
  readonly name: string;
  readonly description: string;
  readonly schema: z.ZodType<unknown>;
  execute(input: unknown): Promise<string>;
}

export interface AgentOptions {
  readonly maxSteps?: number;
  readonly maxCostUsd?: number;
  readonly model?: string;
}

export type StoppedReason = "answer" | "max_steps" | "cost_cap";

export interface AgentResult {
  readonly answer: string;
  readonly steps: number;
  readonly cost: number;
  readonly stoppedReason: StoppedReason;
}

const decision = z.union([
  z.object({ tool: z.string(), input: z.unknown() }),
  z.object({ final: z.string() }),
]);

export async function runAgent(
  backend: Backend,
  task: string,
  tools: readonly AgentTool[],
  opts: AgentOptions = {},
): Promise<AgentResult> {
  const maxSteps = opts.maxSteps ?? 6;
  const maxCost = opts.maxCostUsd ?? Number.POSITIVE_INFINITY;
  const toolList = tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  const system =
    `You are an agent. Available tools:\n${toolList}\n\n` +
    `Respond ONLY with JSON: {"tool":"<name>","input":<object>} to call a tool, ` +
    `or {"final":"<answer>"} to finish.`;

  const transcript: string[] = [`Task: ${task}`];
  let cost = 0;
  let steps = 0;

  while (steps < maxSteps) {
    const res = await backend.complete({
      system,
      prompt: transcript.join("\n"),
      ...(opts.model !== undefined ? { model: opts.model } : {}),
      maxTokens: 512,
    });
    cost += res.costUsd;
    steps++;

    if (cost > maxCost) return { answer: "", steps, cost, stoppedReason: "cost_cap" };

    const parsed = decision.safeParse(firstJson(res.text));
    if (!parsed.success) {
      transcript.push("(invalid response; respond with the required JSON)");
      continue;
    }
    const d = parsed.data;
    if ("final" in d) {
      return { answer: d.final, steps, cost, stoppedReason: "answer" };
    }
    const tool = tools.find((t) => t.name === d.tool);
    if (!tool) {
      transcript.push(`Tool "${d.tool}" not found.`);
      continue;
    }
    const input = tool.schema.safeParse(d.input);
    if (!input.success) {
      transcript.push(`Invalid input for "${tool.name}".`);
      continue;
    }
    const result = await tool.execute(input.data);
    transcript.push(`Called ${tool.name} -> ${result}`);
  }

  return { answer: "", steps, cost, stoppedReason: "max_steps" };
}
