import { DEFAULT_MODEL, type Backend, type CompletionRequest, type CompletionResult } from "./backend.js";

/**
 * A deterministic backend for CI and tests — no network, no quota, no key. The
 * responder maps a request to the model's "reply", so a test can script exactly what
 * the LLM step will parse. Default: echo the prompt. Cost is always 0 (mock is free),
 * which is why CI runs on this backend.
 */
export class MockBackend implements Backend {
  readonly name = "mock";
  private readonly responder: (req: CompletionRequest) => string;
  private readonly modelId: string;

  constructor(responder?: (req: CompletionRequest) => string, model = DEFAULT_MODEL) {
    this.responder = responder ?? ((r) => r.prompt);
    this.modelId = model;
  }

  complete(req: CompletionRequest): Promise<CompletionResult> {
    const text = this.responder(req);
    const model = req.model ?? this.modelId;
    // Deterministic fake usage (char-based) so tests can assert stable numbers.
    const usage = { inputTokens: req.prompt.length, outputTokens: text.length };
    return Promise.resolve({ text, model, usage, costUsd: 0 });
  }
}
