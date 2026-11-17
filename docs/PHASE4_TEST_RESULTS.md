# Phase 4 test results

Date: 2026-11-16. Branch: `feature/google-routes-live-validation`. The commands below were run from the local checkout after the live experiment. Paid calls are not part of `typecheck`, `lint`, `test:unit`, `test:integration`, `test:e2e`, or `build`.

## Live counter

| Call | Where | Result |
| --- | --- | --- |
| 1 | Live test, scenario A | 3 routes |
| 2 | Live test, scenario B | 1 route, 19 m from Chuí |
| 3 | Live test, scenario C | 1 route, 12 m from Jaguarão |
| 4 | Live test, scenario D | 1 route, Santos–Montevideo–Porto Alegre |
| 5 | Planner, direct URL | 3 routes, one Google map |
| 6 | Planner, after adding Chuí | 1 route, second Google map |

Map loads: 2. Candidate switches on the first map did not add a load.

## Automated suites

The default Playwright file `tests/e2e/live-map.spec.ts` mocks the status, reconstruction, map-load, and Maps JavaScript responses. It checks that a mocked map enables confirmation, that switching candidates does not reserve another map load, that a waypoint removes confirmation, that a failed script keeps confirmation disabled, and that a missing browser key blocks live confirmation. The real-provider browser test is skipped unless `ROUTE_OVERLAY_LIVE_EXPERIMENT=true`.

`tests/live/phase4-live.test.ts` is outside the default Vitest include. It ran once with the experiment flag and passed. A later run reuses a successful scenario from the gitignored summary instead of calling Google again.

Unit coverage added in this phase includes a single returned route, an empty route list, billing and quota errors, the 20-call refusal, selected-polyline readiness, and clearing a completed confirmation after a draft edit. Integration coverage checks that the status route can return the browser key without the server key, and that the 31st map-load reservation is refused.

## Browser walk

This was an agent session on the local planner, not a usability study. The page was `http://127.0.0.1:3000/plan` with live Routes and the Google map enabled for that process only. The committed environment example still has both flags false.

| Step | Observed |
| --- | --- |
| Import the captured Santos URL | Origin Santos, destination Montevideo, both place IDs kept, polyline and route token missing |
| Reconstruct | 3 live candidates. Confirm became available after the Google map drew the default |
| Compare | Selecting the other two candidates updated the distance and duration without another Routes call |
| Confirm the default | Stored `google-1`, not synthetic, fidelity still false. Effort counters: low, 5 actions after import, 0 waypoints, 0 recalculations |
| Time | 114,886 ms from the reconstruction response to the confirm click. That interval includes the three-candidate comparison |
| Add Chuí | Confirm control removed. Stored confirmation became null |
| Reconstruct the draft | 1 live candidate, 1,978.1 km, BR-101. Confirm became available again |

The shortest path the screen allowed, if the default is accepted without comparison, is import, reconstruct, and confirm. The recorded 5 actions are the comparison path. Phase 3's mock session also reached confirmation without a waypoint. That session confirmed a synthetic bend. This session confirmed a Routes polyline that had been drawn. Neither session proves the person would recognize the original Maps selection.

## Comparison with phase 3

| Question | Phase 3 mock | Phase 4 live |
| --- | --- | --- |
| Candidates for the direct URL | Two labeled synthetic bends | Three Routes alternatives on the first call, a different trio on the second |
| Chuí | One mock fallback | One Routes polyline 19 m from the coordinate |
| Map | SVG schematic | Official Google map, plus the schematic kept separate |
| Confirmation | Allowed on the schematic | Allowed only after the selected live polyline was drawn |
| Fidelity | Not independently verified | Still not independently verified |

## Verdict

**CONDITIONAL GO.**

Real reconstruction and the Google map work for the tested stops. The intended journey can be confirmed after the polyline is visible. The original selected corridor still cannot be identified from the URL, the alternative list can change between requests, and the traffic-unaware durations do not match the earlier Maps screenshot. Those are material limits, so this is not a GO. It is also not a NO-GO: the tested routes were real, constrained, and drawable.

## Publish checks on this working tree

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed after `.route-overlay` was excluded. That directory is gitignored local state. |
| `npm run test:unit` | 85 passed |
| `npm run test:integration` | 17 passed |
| `npm run test:e2e` | 19 passed, 1 skipped. The skipped test is the real-provider browser smoke. |
| `npm run test:live` | 1 passed earlier, with the experiment flag. It made the first four Routes calls. |
| `npm run build` | Passed. Next.js 15.5.29. |
| `npm audit --omit=dev` | 0 findings |

These checks do not repeat the live counter. The default unit and browser suites did not call Google.
