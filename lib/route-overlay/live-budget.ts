import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Hard local cap for this phase. This is not a Google Cloud quota. */
export const MAX_COMPUTE_ROUTES_CALLS = 20;
export const MAX_MAP_LOADS = 30;

export interface LiveBudgetSnapshot {
  computeRoutesCalls: number;
  mapLoads: number;
}

export interface LiveBudgetStore {
  read(): LiveBudgetSnapshot;
  write(snapshot: LiveBudgetSnapshot): void;
}

const EMPTY_BUDGET: LiveBudgetSnapshot = {
  computeRoutesCalls: 0,
  mapLoads: 0,
};

export function liveBudgetPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.ROUTE_OVERLAY_BUDGET_PATH?.trim();
  if (configured) {
    return configured;
  }
  return path.join(process.cwd(), ".route-overlay", "live-budget.json");
}

export function fileLiveBudgetStore(
  filePath: string = liveBudgetPath(),
): LiveBudgetStore {
  return {
    read() {
      try {
        const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Partial<LiveBudgetSnapshot>;
        return {
          computeRoutesCalls: nonNegativeInteger(parsed.computeRoutesCalls),
          mapLoads: nonNegativeInteger(parsed.mapLoads),
        };
      } catch {
        return { ...EMPTY_BUDGET };
      }
    },
    write(snapshot) {
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, `${JSON.stringify(snapshot)}\n`, "utf8");
    },
  };
}

export function memoryLiveBudgetStore(
  initial: LiveBudgetSnapshot = { ...EMPTY_BUDGET },
): LiveBudgetStore {
  let snapshot = { ...initial };
  return {
    read: () => ({ ...snapshot }),
    write(next) {
      snapshot = { ...next };
    },
  };
}

/**
 * Reserves one live Google call. A denied reservation does not increment.
 * There is no retry. The caller must not send the provider request when
 * `allowed` is false.
 */
export function reserveLiveCall(
  kind: "computeRoutes" | "mapLoad",
  store: LiveBudgetStore = fileLiveBudgetStore(),
): { allowed: boolean; snapshot: LiveBudgetSnapshot; reason: string | null } {
  const snapshot = store.read();
  if (kind === "computeRoutes") {
    if (snapshot.computeRoutesCalls >= MAX_COMPUTE_ROUTES_CALLS) {
      return {
        allowed: false,
        snapshot,
        reason: `Local experiment cap reached: ${MAX_COMPUTE_ROUTES_CALLS} computeRoutes calls. No further Google Routes request was sent.`,
      };
    }
    const next = {
      ...snapshot,
      computeRoutesCalls: snapshot.computeRoutesCalls + 1,
    };
    store.write(next);
    return { allowed: true, snapshot: next, reason: null };
  }
  if (snapshot.mapLoads >= MAX_MAP_LOADS) {
    return {
      allowed: false,
      snapshot,
      reason: `Local experiment cap reached: ${MAX_MAP_LOADS} Google map loads. The map was not created.`,
    };
  }
  const next = { ...snapshot, mapLoads: snapshot.mapLoads + 1 };
  store.write(next);
  return { allowed: true, snapshot: next, reason: null };
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}
