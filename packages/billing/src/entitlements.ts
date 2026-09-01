/**
 * The entitlement domain — pure. Plans map to features as a DATA table (same
 * discipline as the authorization grants), and the subscription lifecycle decides
 * the EFFECTIVE plan: a `past_due`/`grace` org keeps its features (a grace window
 * before downgrade, not an immediate cutoff — the state-machine case the design notes
 * flagged), while a `canceled` org falls back to free. Entitlement checks compose
 * with RBAC in the app so "feature X requires plan Y" is one uniform gate.
 */
export const PLANS = ["free", "pro", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];

export const SUB_STATUSES = ["active", "past_due", "grace", "canceled"] as const;
export type SubStatus = (typeof SUB_STATUSES)[number];

export type Feature = "rag" | "agents" | "advanced_analytics" | "seats_unlimited";

const PLAN_ENTITLEMENTS: Record<Plan, ReadonlySet<Feature>> = {
  free: new Set<Feature>(["rag"]),
  pro: new Set<Feature>(["rag", "agents", "advanced_analytics"]),
  enterprise: new Set<Feature>(["rag", "agents", "advanced_analytics", "seats_unlimited"]),
};

export function entitlementsFor(plan: Plan): ReadonlySet<Feature> {
  return PLAN_ENTITLEMENTS[plan];
}

/** The plan actually in effect given the subscription status. */
export function effectivePlan(plan: Plan, status: SubStatus): Plan {
  return status === "canceled" ? "free" : plan; // active/past_due/grace keep the plan
}

/** The one uniform gate: does this subscription entitle the feature right now? */
export function isEntitled(plan: Plan, status: SubStatus, feature: Feature): boolean {
  return entitlementsFor(effectivePlan(plan, status)).has(feature);
}
