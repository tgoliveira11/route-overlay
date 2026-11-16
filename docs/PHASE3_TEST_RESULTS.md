# Phase 3 test results

Recorded on 2026-11-16 on Windows, in this repository, branch `feature/assisted-route-confirmation`. Node.js 24.19.0 and npm 11.17.0. The system Node installation was not changed.

These counts are from this machine. The historical Linux total of 37 Vitest tests, and the restoration totals of 62 unit and 9 integration tests, are earlier revisions. The tables in the first sections are the phase 3 run. The phase 3.1 rerun is recorded at the end and supersedes those counts for the current tree.

## Commands

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed, including the final planner and Playwright edits. |
| `npm test` (Vitest 3.2.7) | 8 files, 85 tests passed. |
| `npm run test:e2e` | 13 passed with one Playwright worker. |
| `npm run build` | Passed. Next.js 15.5.29, Turbopack. `/plan` is a static page. |
| Live Google Routes | Not called. `ROUTE_OVERLAY_GOOGLE_API_ENABLED` is false and `GOOGLE_ROUTES_API_KEY` is empty. |

Vitest breakdown:

- Unit: `expand-short-link` 34, `parse-maps-url` 12, `assisted-plan` 9, `reconstruct` 8, `real-urls` 6, `polyline` 2.
- Integration: `routes` 9, `plan-flow` 5.

The redirect-policy tests are included in the 34 short-link tests. No existing assertion was deleted to obtain a pass. The reconstruction unit test that used to expect `computeAlternativeRoutes` together with a via waypoint now expects the flag to be omitted and a warning that alternatives were not requested. A direct route without waypoints still expects the flag to be true.

## Playwright

Existing diagnostic tests in `tests/e2e/import.spec.ts`: 5 passed, including the mobile-width import.

Assisted tests in `tests/e2e/plan.spec.ts`: 8 passed.

| Check | Observed result |
| --- | --- |
| Import the captured Santos–Montevideo URL | Origin Santos, destination Montevideo, missing polyline called out, original URL shown. |
| Candidates | 2 mock candidates. The non-default `mock-b` can be selected and confirmed. Friction text is low. |
| Stop planning | Locked before confirmation. After confirmation, the generated rows contain “Synthetic” and the disclaimer says they are not real businesses. |
| Waypoint and recalculation | Adding `-33.6900, -53.4600` and recalculating shows 1 candidate and the no-alternatives explanation. |
| Scenario B | The Chuí fixture shows the limitation and does not render `mock-b`. |
| Credentials absent | The Google Routes button is disabled and the page says live reconstruction is not available. |
| Invalid text | `not a url` shows the absolute-URL error and no origin. |
| 390px plan page | No horizontal overflow. |

An earlier parallel run failed two tests while the dev server was compiling under two browsers and files were still being saved. One failure was the diagnostic mobile import still sitting on “Parsing URL…”. The other reached the stop-planning result and then hit the 60 second test budget on the submit click. The serial rerun after those edits passed all 13. The Google Routes control is a `type="button"` so the test click does not wait for a form navigation.

## Mocked HTTP versus live Google

`tests/integration/plan-flow.test.ts` passes a Vitest `fetch` stub into `computeGoogleRoutes`. The request body for scenario A includes `computeAlternativeRoutes: true`. The scenario D body omits it. The returned object has `mock: false` and `source: "google_routes_api"` because the adapter is the live adapter, and the test key is redacted. That test did not open a socket to `routes.googleapis.com`.

`reconstructFromUrl` for scenario D in live mode returns status 409 while the API is disabled. Scenario G imports as `unsupported` and reconstruction returns 422.

## Audit

Before: 16 findings in the full tree (2 low, 11 moderate, 1 high, 2 critical) and 8 in production (2 low, 5 moderate, 1 high).

After the PostCSS override, the minimatch override, the Vitest 3.2.7 patch, and moving `shadcn` to devDependencies: 6 findings in the full tree (3 low, 1 moderate, 2 critical) and 0 in production.

## Browser pass

After the production build, `npm run start` listens on `127.0.0.1` port 3000 only. `GET /api/routes/status` returned `liveAvailable: false`.

The local browser pass of `http://127.0.0.1:3000/plan` imported the captured Santos–Montevideo URL, showed Santos and Montevideo, reconstructed two MOCK candidates, selected mock candidate B, and confirmed it. The screen read low friction, 3 actions, 0 waypoints added, and 0 recalculations. Stop planning then listed two rows that include the word Synthetic and the not-real-businesses disclaimer. That stop result belongs to the phase 3 planner, which reset the fuel clock after a miss. The phase 3.1 planner reports the same default corridor as not feasible. `not a url` produced “The text is not an absolute URL.” The MASP place page imported with origin missing, left mock reconstruction disabled, and kept stop planning locked. At 390px the document did not overflow horizontally. No Next.js error overlay was present. This pass is not a human usability study. The stored confirmation interval was 29034 ms and is the agent’s own clicking time.

## Phase 3.1 rerun

Recorded on the same host and branch after the correctness fixes. No paid Google API was called. `package-lock.json` was not changed by this pass. The production listener already bound to `127.0.0.1:3000` (`next start`, pid 18228) was left running. Playwright did not attach to it.

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed after the final planner edit. |
| `npm run lint` | Passed after the final planner edit. |
| `npm test` (Vitest 3.2.7) | 8 files, 95 tests passed. The later two-line effort reset is covered by Playwright, not by a new unit test. |
| `npm run test:e2e` | 16 passed, 1 worker, 2.8 min. A second run passed 16 tests in 2.2 min. A third run, after a failed import was also required to clear the effort counters, passed 16 tests in 2.5 min. Retries stayed 0. |
| `npm run build` | Passed. Next.js 15.5.29, Turbopack. `/plan` is static. |
| `npm audit --json` | Exit 1. 3 findings: 0 low, 1 moderate, 0 high, 2 critical. |
| `npm audit --omit=dev --json` | Exit 0. 0 findings. |
| Live Google Routes and Maps JavaScript | Not called. Both feature flags stay false and both keys stay empty. |

Vitest breakdown for this tree:

- Unit: `expand-short-link` 34, `assisted-plan` 18, `parse-maps-url` 12, `reconstruct` 8, `real-urls` 6, `polyline` 2.
- Integration: `routes` 9, `plan-flow` 6.

New or tightened coverage:

- Unit: stale geometry cannot be confirmed; an older reconstruction generation is rejected; live confirmation waits for a ready Google map; avoid flags, place IDs, via semantics, and order survive a rebuild and a Routes request; walking avoid flags are reported and not sent; map display stays unavailable without both the flag and the key; a session for route A is rejected as the confirmation of route B; a missed station does not restore range or get repeated; an unreachable end is not feasible.
- Integration: after importing Santos–Montevideo, reconstructing, and adding Chuí, confirmation eligibility is false until the updated draft is reconstructed, and the new polyline is not the previous one. The default mock corridor now expects `feasible: false` and a usable-range gap.
- Playwright: confirmation is absent after Chuí is added and returns only after recalculation; importing scenario B clears the Santos confirmation across reload; a failed import clears the confirmation across reload.

Playwright cold start: `npm run test:e2e` starts `npm run dev:e2e`, which is `next dev --turbopack -H 127.0.0.1 -p 3100`. `reuseExistingServer` is false, so an occupied port 3100 fails the run. The web server timeout is 120 seconds. Workers stay at 1, retries stay at 0, and the test timeout stays at 60 seconds. The dev server is the working tree, not a previously built `.next` snapshot. A production-build check is `npm run build` followed by `npm run start` on 127.0.0.1 port 3000. Stop any process already using `.next` before that build. This rerun did not stop the listener already on port 3000.

The default stop-planning assertion changed on purpose. The safer planner finds no station inside the usable range on the bent mock Santos–Montevideo polyline, so the integration test expects zero stops and a gap, and the Playwright test expects “Not feasible” plus the straight-line disclaimer. A separate unit test still selects a station that is inside both the detour and the usable range.

A browser pass of `http://127.0.0.1:3100/plan`, served by `npm run dev:e2e` from this working tree, imported Santos–Montevideo, reconstructed two mock candidates, added `-33.6900, -53.4600`, and showed “The draft changed. The previous geometry was discarded.” The confirm control was gone until recalculation. Recalculation presented one `mock_waypoint_fallback` candidate at 1962.7 km. Confirming it listed the Chuí coordinate in the stops and kept independently verified fidelity false. The synthetic plan then read “Not feasible.” Submitting `not a url` removed the confirmation and the stored session, and the page showed “The text is not an absolute URL.” `/api/routes/status` on that server returned `mapsDisplayAvailable: false` and `mapsJsKey: null`. No Google script was loaded.

The process already listening on port 3000, pid 18228, was not stopped. After `npm run build` it still answered `/api/routes/status` without `mapsDisplayAvailable`, so that process is the previous server image. It does not demonstrate this correction. The dev overlay seen in the instrumented browser cited a `data-cursor-ref` hydration mismatch injected by the browser tool. Playwright, which does not inject that attribute, passed.
