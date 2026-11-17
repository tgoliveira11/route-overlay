/**
 * Local interaction counts for the assisted confirmation flow.
 * These are engineering measurements, not a usability study.
 */

export type FrictionLevel = "low" | "moderate" | "high";

export type EffortOutcome = "in_progress" | "completed" | "abandoned";

export interface EffortMetrics {
  actionsAfterImport: number;
  candidatesPresented: number;
  immediatelyAccepted: boolean | null;
  waypointsAdded: number;
  recalculations: number;
  confirmationStartedAt: string | null;
  confirmationCompletedAt: string | null;
  confirmationMs: number | null;
  outcome: EffortOutcome;
}

export function emptyEffort(): EffortMetrics {
  return {
    actionsAfterImport: 0,
    candidatesPresented: 0,
    immediatelyAccepted: null,
    waypointsAdded: 0,
    recalculations: 0,
    confirmationStartedAt: null,
    confirmationCompletedAt: null,
    confirmationMs: null,
    outcome: "in_progress",
  };
}

export function recordAction(metrics: EffortMetrics, count = 1): EffortMetrics {
  return {
    ...metrics,
    actionsAfterImport: metrics.actionsAfterImport + count,
  };
}

export function markConfirmationStarted(metrics: EffortMetrics, now: string): EffortMetrics {
  if (metrics.confirmationStartedAt) {
    return metrics;
  }
  return { ...metrics, confirmationStartedAt: now };
}

export function markConfirmed(metrics: EffortMetrics, now: string): EffortMetrics {
  const started = metrics.confirmationStartedAt
    ? Date.parse(metrics.confirmationStartedAt)
    : Date.parse(now);
  const completed = Date.parse(now);
  const confirmationMs = Number.isFinite(started) && Number.isFinite(completed)
    ? Math.max(0, completed - started)
    : null;
  const immediatelyAccepted = metrics.waypointsAdded === 0 && metrics.recalculations === 0;
  return {
    ...metrics,
    actionsAfterImport: metrics.actionsAfterImport + 1,
    immediatelyAccepted,
    confirmationCompletedAt: now,
    confirmationMs,
    outcome: "completed",
  };
}

/**
 * A draft edit discards the confirmed geometry. The previous completion no
 * longer describes the current itinerary.
 */
export function invalidateConfirmation(metrics: EffortMetrics): EffortMetrics {
  return {
    ...metrics,
    confirmationCompletedAt: null,
    confirmationMs: null,
    immediatelyAccepted: null,
    outcome: "in_progress",
  };
}

export function markAbandoned(metrics: EffortMetrics): EffortMetrics {
  return {
    ...metrics,
    actionsAfterImport: metrics.actionsAfterImport + 1,
    outcome: "abandoned",
    immediatelyAccepted: false,
  };
}

/**
 * Provisional engineering thresholds. They are not validated user research.
 * Low: a candidate was confirmed without adding waypoints or recalculating.
 * Moderate: one or two waypoint additions and at most two explicit recalculations.
 * High: more editing, abandonment, or no completed confirmation.
 */
export function classifyFriction(metrics: EffortMetrics): FrictionLevel {
  if (metrics.outcome !== "completed") {
    return "high";
  }
  if (metrics.waypointsAdded === 0 && metrics.recalculations === 0) {
    return "low";
  }
  if (metrics.waypointsAdded <= 2 && metrics.recalculations <= 2) {
    return "moderate";
  }
  return "high";
}
