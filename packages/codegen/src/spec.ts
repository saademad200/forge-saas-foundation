import { z } from "zod";

/**
 * The feature spec IR — the ONLY thing the LLM is allowed to produce. Deterministic
 * templates turn a validated spec into typed code; the LLM never freehands code.
 *
 * Tenant scoping is STRUCTURALLY MANDATORY: `orgScoped` is `z.literal(true)`, so a
 * spec that is not tenant-scoped is unrepresentable — "forgot the tenant filter"
 * cannot occur at authoring time (the guarantee moves from human judgment to schema).
 */

export const fieldType = z.enum(["text", "integer", "boolean", "timestamp"]);
export type FieldType = z.infer<typeof fieldType>;

export const field = z.object({
  name: z
    .string()
    .regex(/^[a-z][a-zA-Z0-9]*$/, "field name must be camelCase (letters/digits, lowercase first)"),
  type: fieldType,
  required: z.boolean().default(false),
});
export type Field = z.infer<typeof field>;

export const specRole = z.enum(["owner", "admin", "member"]);
export type SpecRole = z.infer<typeof specRole>;

export const featureSpec = z.object({
  /** Entity name, camelCase singular, e.g. "invoice". Drives table + type names. */
  entity: z.string().regex(/^[a-z][a-zA-Z0-9]*$/, "entity must be camelCase singular"),
  /** Structurally mandatory — a non-tenant-scoped feature cannot be expressed. */
  orgScoped: z.literal(true),
  fields: z.array(field).min(1, "a feature needs at least one field"),
  /** Deny-by-default: a role gets an action only if listed here. */
  permissions: z.object({
    read: z.array(specRole),
    create: z.array(specRole),
    update: z.array(specRole),
    delete: z.array(specRole),
  }),
});
export type FeatureSpec = z.infer<typeof featureSpec>;

/** Parse + validate an untrusted spec (e.g. LLM-proposed), throwing on invalid shape. */
export function parseSpec(input: unknown): FeatureSpec {
  return featureSpec.parse(input);
}

/**
 * A plain-English readout of the permission/isolation implications, rendered at the
 * human-confirm step so a reviewer checks INTENT, not shape (the rubber-stamp fix).
 */
export function explainSpec(spec: FeatureSpec): string {
  const lines = [
    `Feature "${spec.entity}" — tenant-scoped (every row belongs to one org; cross-org access is denied).`,
    `Fields: ${spec.fields.map((f) => `${f.name}:${f.type}${f.required ? "" : "?"}`).join(", ")}.`,
  ];
  for (const action of ["read", "create", "update", "delete"] as const) {
    const roles = spec.permissions[action];
    lines.push(
      roles.length > 0
        ? `${action}: granted to ${roles.join(", ")}.`
        : `${action}: granted to no one (denied for all roles).`,
    );
  }
  return lines.join("\n");
}
