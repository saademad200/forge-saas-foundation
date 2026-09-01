import { ok, err, type Result } from "@forge/kernel";

/**
 * The organization lifecycle, as a pure state machine. `suspended` keeps data but
 * makes it inaccessible; `deleting` is terminal and triggers a tenant-scoped cascade.
 * Only an `active` org serves requests — a gate the app enforces on every tenant
 * resolution, so a suspended org's data is unreachable even though it still exists.
 */
export const ORG_STATUSES = ["created", "active", "suspended", "deleting"] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

const TRANSITIONS: Record<OrgStatus, readonly OrgStatus[]> = {
  created: ["active", "deleting"],
  active: ["suspended", "deleting"],
  suspended: ["active", "deleting"],
  deleting: [], // terminal
};

export const canTransition = (from: OrgStatus, to: OrgStatus): boolean =>
  TRANSITIONS[from].includes(to);

export interface TransitionError {
  readonly kind: "illegal_transition";
  readonly from: OrgStatus;
  readonly to: OrgStatus;
}

/** Validate a status change, returning the target status or a typed error. */
export const assertTransition = (
  from: OrgStatus,
  to: OrgStatus,
): Result<OrgStatus, TransitionError> =>
  canTransition(from, to) ? ok(to) : err({ kind: "illegal_transition", from, to });

/** Whether an org in this status may serve requests (its data is reachable). */
export const isAccessible = (status: OrgStatus): boolean => status === "active";
