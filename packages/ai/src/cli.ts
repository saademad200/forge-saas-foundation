import { spawn } from "node:child_process";
import { DEFAULT_MODEL, type Backend, type CompletionRequest, type CompletionResult } from "./backend.js";

/**
 * The keyless backend: shells out to `claude -p` (Claude Code CLI print mode), which
 * authenticates with the user's subscription — NO API key, NO per-call bill. This is
 * what makes the dev experience and the live demo free. The system
 * prompt is folded into the prompt for robustness across CLI versions rather than
 * relying on a specific flag.
 */
export interface CliOptions {
  readonly bin?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
}

export class ClaudeCliBackend implements Backend {
  readonly name = "claude-cli";
  private readonly bin: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(opts: CliOptions = {}) {
    this.bin = opts.bin ?? "claude";
    this.model = opts.model ?? DEFAULT_MODEL;
    this.timeoutMs = opts.timeoutMs ?? 120_000;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const model = req.model ?? this.model;
    const prompt = req.system ? `${req.system}\n\n${req.prompt}` : req.prompt;
    const text = await run(this.bin, ["-p", prompt, "--model", model], this.timeoutMs);
    // Subscription auth: no per-call token/cost visibility from the CLI.
    return { text: text.trim(), model, usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0 };
  }
}

function run(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`claude CLI timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`claude CLI exited ${code}: ${err.trim()}`));
    });
  });
}
