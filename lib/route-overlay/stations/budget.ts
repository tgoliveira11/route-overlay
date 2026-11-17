import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Phase 5 ceilings. They do not replace the Phase 4 Routes and map caps. */
export const MAX_PLACES_REQUESTS = 25;
export const MAX_ADDITIONAL_ROUTES_REQUESTS = 5;
export const MAX_PHASE5_MAP_LOADS = 5;

export interface Phase5Budget {
  placesRequests: number;
  additionalRoutesRequests: number;
  mapLoads: number;
}

export interface Phase5BudgetStore {
  read(): Phase5Budget;
  write(snapshot: Phase5Budget): void;
}

const EMPTY: Phase5Budget = {
  placesRequests: 0,
  additionalRoutesRequests: 0,
  mapLoads: 0,
};

export function phase5BudgetPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.ROUTE_OVERLAY_PHASE5_BUDGET_PATH?.trim();
  if (configured) {
    return configured;
  }
  return path.join(process.cwd(), ".route-overlay", "phase5-budget.json");
}

export function filePhase5BudgetStore(filePath: string = phase5BudgetPath()): Phase5BudgetStore {
  return {
    read() {
      try {
        const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Partial<Phase5Budget>;
        return {
          placesRequests: nonNegative(parsed.placesRequests),
          additionalRoutesRequests: nonNegative(parsed.additionalRoutesRequests),
          mapLoads: nonNegative(parsed.mapLoads),
        };
      } catch {
        return { ...EMPTY };
      }
    },
    write(snapshot) {
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, `${JSON.stringify(snapshot)}\n`, "utf8");
    },
  };
}

export function memoryPhase5BudgetStore(initial: Phase5Budget = { ...EMPTY }): Phase5BudgetStore {
  let snapshot = { ...initial };
  return {
    read: () => ({ ...snapshot }),
    write(next) {
      snapshot = { ...next };
    },
  };
}

export function reservePhase5Call(
  kind: keyof Phase5Budget,
  store: Phase5BudgetStore,
): { allowed: boolean; snapshot: Phase5Budget; reason: string | null } {
  const snapshot = store.read();
  const limit = limitFor(kind);
  if (snapshot[kind] >= limit) {
    return {
      allowed: false,
      snapshot,
      reason: `Phase 5 cap reached: ${limit} ${kind}. The provider request was not sent.`,
    };
  }
  const next = { ...snapshot, [kind]: snapshot[kind] + 1 };
  store.write(next);
  return { allowed: true, snapshot: next, reason: null };
}

function limitFor(kind: keyof Phase5Budget): number {
  if (kind === "placesRequests") {
    return MAX_PLACES_REQUESTS;
  }
  if (kind === "additionalRoutesRequests") {
    return MAX_ADDITIONAL_ROUTES_REQUESTS;
  }
  return MAX_PHASE5_MAP_LOADS;
}

function nonNegative(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}
