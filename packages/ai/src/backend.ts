/**
 * The uniform Claude client. One `Backend` interface, three implementations:
 *   - MockBackend      deterministic, for CI (no quota spent) and tests
 *   - ClaudeCliBackend `claude -p` subprocess — subscription auth, NO API key (dev/demo)
 *   - (SDK backend)    the Anthropic SDK with a client's own key — documented follow-up
 * so an AI feature runs keyless in dev/demo, on the client's key in prod, and offline in CI.
 */

/** Owner directive: the AI layer targets Claude Opus 4.8 by default. */
export const DEFAULT_MODEL = "claude-opus-4-8";

/** Per-1M-token USD pricing, for cost accounting (per-tenant cost is a selling point). */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export interface CompletionRequest {
  readonly prompt: string;
  readonly system?: string;
  readonly model?: string;
  readonly maxTokens?: number;
}

export interface Usage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface CompletionResult {
  readonly text: string;
  readonly model: string;
  readonly usage: Usage;
  readonly costUsd: number;
}

export interface Backend {
  readonly name: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

/** USD cost for a usage on a model; 0 for unknown models or a subscription backend. */
export function costFor(model: string, usage: Usage): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (usage.inputTokens * p.input + usage.outputTokens * p.output) / 1_000_000;
}
