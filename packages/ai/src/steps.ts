import { z } from "zod";
import type { Backend } from "./backend.js";

/**
 * Reusable LLM steps. Each returns a uniform, typed `StepResult` — structured,
 * validated, confidence-gated, cost-aware — so an app can treat every AI call the
 * same way (accept, or route to a human-review queue when needsReview). Same shape
 * reusable across LLM steps.
 */
export interface StepResult<T> {
  readonly output: T;
  readonly confidence: number;
  readonly needsReview: boolean;
  readonly cost: number;
  readonly model: string;
}

export interface StepOptions {
  readonly model?: string;
  readonly maxTokens?: number;
  /** Confidence below this routes to human review. Default 0.7. */
  readonly reviewThreshold?: number;
}

/** Pull the first JSON object/array out of a model response (which may wrap it in prose). */
export function firstJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (match === null) return undefined;
  try {
    return JSON.parse(match[0]);
  } catch {
    return undefined;
  }
}

const classifyShape = z.object({ label: z.string(), confidence: z.number().min(0).max(1) });

/** Classify input into exactly one of `labels`. Low confidence or an invalid label → needsReview. */
export async function classify(
  backend: Backend,
  input: string,
  labels: readonly string[],
  opts: StepOptions = {},
): Promise<StepResult<string>> {
  const threshold = opts.reviewThreshold ?? 0.7;
  const system =
    `You are a classifier. Choose exactly ONE label from: ${labels.join(", ")}. ` +
    `Respond ONLY with JSON: {"label": <one label>, "confidence": <0..1>}.`;
  const res = await backend.complete({ system, prompt: input, ...maybeModel(opts), maxTokens: opts.maxTokens ?? 256 });
  const parsed = classifyShape.safeParse(firstJson(res.text));
  if (!parsed.success || !labels.includes(parsed.data.label)) {
    return { output: labels[0] ?? "", confidence: 0, needsReview: true, cost: res.costUsd, model: res.model };
  }
  const { label, confidence } = parsed.data;
  return { output: label, confidence, needsReview: confidence < threshold, cost: res.costUsd, model: res.model };
}

/** Extract structured data validated against a Zod schema. A parse/validation miss → needsReview. */
export async function extract<T>(
  backend: Backend,
  input: string,
  schema: z.ZodType<T>,
  opts: StepOptions = {},
): Promise<StepResult<T | null>> {
  const system =
    `Extract the requested fields from the input. Respond ONLY with a JSON object. ` +
    `Omit or null any field not present. Do not invent values.`;
  const res = await backend.complete({ system, prompt: input, ...maybeModel(opts), maxTokens: opts.maxTokens ?? 1024 });
  const parsed = schema.safeParse(firstJson(res.text));
  if (!parsed.success) {
    return { output: null, confidence: 0, needsReview: true, cost: res.costUsd, model: res.model };
  }
  return { output: parsed.data, confidence: 1, needsReview: false, cost: res.costUsd, model: res.model };
}

/** Summarize input to a few sentences. */
export async function summarize(
  backend: Backend,
  input: string,
  opts: StepOptions = {},
): Promise<StepResult<string>> {
  const system = `Summarize the input concisely in 1-3 sentences. Respond with only the summary text.`;
  const res = await backend.complete({ system, prompt: input, ...maybeModel(opts), maxTokens: opts.maxTokens ?? 512 });
  return { output: res.text.trim(), confidence: 1, needsReview: false, cost: res.costUsd, model: res.model };
}

function maybeModel(opts: StepOptions): { model?: string } {
  return opts.model !== undefined ? { model: opts.model } : {};
}
