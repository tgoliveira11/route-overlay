# Phase 8 — Road detour experiment

## 1. Executive summary

RouteOverlay can measure a local driving detour for a premium station when both anchors sit on the confirmed Brazilian corridor and the direct route stays on that corridor. Five anchor pairs were routed. Four kept a local direct corridor. One via-station route was only ambiguous. Three Santos stations have no upstream anchor. Two further candidates were not measured because the local `computeRoutes` budget had one call left, which is not enough for a pair.

This is not a fuel-stop planner. No station is described as open or stocked.

## 2. Research question

For a station already screened near the confirmed Santos–Montevideo route, how much extra driving does Google Routes report between the same upstream and downstream anchors when the station is a stopover?

## 3. Confirmed Google route revision

Revision `5e7dbe78df0631efec1dbcbacedd25e81a66d4863ca795cbafb0138457f565c9`, the Phase 7 agent confirmation of the Google Routes default (BR-116, provider distance 1,936,072 m). The polyline stayed in the gitignored session file.

## 4. Candidate station selection

Ten premium stations were reprojected onto the confirmed Brazilian clip. LOW and MISSING coordinates, duplicate locations, and long polyline segments were excluded. The ten cover Santos, Jacupiranga, Antonina, Campina Grande do Sul, Joinville, Torres, and Pelotas, with VIBRA, RAIZEN, IPIRANGA, RAIZEN MIME, and BANDEIRA BRANCA, in both the 0–2 km and 2–5 km bands.

## 5. Baseline routing methodology

Each comparison uses two points 8 km before and 8 km after the station's progress on the confirmed clip. The direct request is DRIVE, `TRAFFIC_UNAWARE`, with no avoid flags and no waypoint optimization. Only the first returned route is used.

## 6. Via-station routing methodology

The same anchors are requested again with the station coordinate as a stopover (`via: false`), not as a pass-through. The station is not inserted into the full Santos–Montevideo itinerary. Extra distance and extra driving time are the via totals minus the direct totals. Negative results are kept. Fueling time is not added. The experiment's fueling assumption is 0 seconds.

## 7. Highway access assumptions

ANP coordinates are unvalidated. A straight-line distance below 2 km does not prove a highway ramp. The anchor spacing assumes an 8 km local segment is long enough to absorb a nearby access road and short enough to stay on the confirmed corridor.

## 8. Corridor fidelity checks

Sampled points of the provider polyline are projected onto the confirmed Brazilian clip. `valid_local` requires a median offset of at most 750 m and a 95th percentile of at most 2 km. A median above 2 km is `route_changed`. Anything between is `ambiguous_access`. The first two measurements stored only the direct-route offset. Their via-route offset is unknown.

## 9. Actual results

| Station | Direct | Via station | Extra | Extra driving | Fidelity | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Posto 4 Irmãos, Jacupiranga/SP, RAIZEN, 217.5 km, straight line 0.10 km | 16.000 km, 659 s | 38.696 km, 1,888 s | 22.70 km | 20.5 min | direct `valid_local`; via offset not retained | valid, with that warning |
| Postos Pelanda, Antonina/PR, VIBRA, 334.7 km, 0.05 km | 16.001 km, 777 s | 16.039 km, 900 s | 0.04 km | 2.1 min | direct `valid_local`; via offset not retained | valid, with that warning |
| Postos Pelanda, Campina Grande do Sul/PR, IPIRANGA, 384.1 km, 0.03 km | 16.001 km, 706 s | 16.009 km, 879 s | 0.01 km | 2.9 min | direct and via `valid_local` | valid |
| Posto Z11, Joinville/SC, VIBRA, 513.4 km, 0.08 km | 16.001 km, 697 s | 16.201 km, 780 s | 0.20 km | 1.4 min | direct and via `valid_local` | valid |
| Valência, Joinville/SC, RAIZEN MIME, 523.7 km, 4.62 km | 16.000 km, 697 s | 26.836 km, 2,019 s | 10.84 km | 22.0 min | direct `valid_local`; via median offset 1,435 m | `ambiguous_access` |

## 10. Valid and rejected comparisons

Four comparisons stayed on a local direct corridor. Only Campina Grande do Sul and Posto Z11 also have a stored via-route corridor classified `valid_local`. Jacupiranga's 22.70 km extra is measured, and the missing via-route offset means that large loop is not evidence of a simple ramp. Valência is not counted as a valid local detour because the via route's median offset is 1,435 m.

## 11. Unmeasured candidates

Oceano Atlântico, Estevez, and Auto Posto Arrastão, all in Santos, have no upstream anchor 8 km before their progress. Torres (Auto Posto São João, IPIRANGA) and Pelotas (Irmãos Cortez, VIBRA) were not sent to Google. One `computeRoutes` call remained, and a comparison needs two.

## 12. Distance comparison

The two fully checked local stopovers added 0.01 km and 0.20 km. Antonina added 0.04 km on a matched direct corridor, without a stored via offset. Jacupiranga added 22.70 km. Valência added 10.84 km on an ambiguous via route. These five numbers are not a corridor-wide access rate.

## 13. Driving-time comparison

The same rows added 2.9, 1.4, 2.1, 20.5, and 22.0 minutes of driving. None of those minutes includes fueling.

## 14. Actual paid requests

Phase 8 sent 10 `computeRoutes` requests: 4 in the first pass and 6 in the continuation. The local counter moved from 9 to 19. The cap remains 20. Places calls in this phase: 0. Intentional map loads in this phase: 0. No request was retried.

## 15. Estimated marginal cost

The requests use `TRAFFIC_UNAWARE` and do not set waypoint optimization, heading, or side-of-road. A stopover can still be billed above Essentials. The ceiling used here is USD 0.01 per request, so 10 requests are at most about USD 0.10. That is below the USD 2 stop.

## 16. Google Maps licensing considerations

Provider polylines and anchor coordinates were not written to Git. The committed summary stores identities, distances, durations, fidelity labels, and straight-line kilometers already derived from ANP coordinates.

## 17. Test results

Offline suite on this branch, with Google Routes, Places, Maps JavaScript, and the live experiment forced off:

- `npm run typecheck`: passed
- `npm run lint`: passed
- `npm run test:unit`: 11 files, 124 tests passed
- `npm run test:integration`: 4 files, 22 tests passed
- `npm run test:e2e`: 21 passed, 1 skipped (the real-provider smoke). The first run failed two mobile overflow checks because the Detours link widened the header. The navigation now wraps, and the rerun passed.
- `npm run build`: passed, including the dynamic `/detours` route
- `npm audit --omit=dev`: 0 vulnerabilities

The live measurement script is not part of that suite. It refuses to run unless `ROUTE_OVERLAY_DETOUR_EXPERIMENT=true` and `ROUTE_OVERLAY_GOOGLE_API_ENABLED=true`.

## 18. Technical limitations

Stations in the first 8 km of the Brazilian clip cannot use this anchor rule. The first two via routes were not retained for a second fidelity check. ANP coordinates remain unvalidated. The confirmed route is the Routes API default, not a proven Google Maps selection.

## 19. Product implications

A straight-line band does not predict the driving detour. Two nearby stations added well under one kilometer, and one nearby station added more than 22 km. Operational fuel-stop recommendations remain NO-GO.

## 20. Next recommended experiment

Keep the next pair of calls for Torres and Pelotas, and store the via-route offset for every new comparison before interpreting a large extra distance.

## Pull request

Pull request: https://github.com/tgoliveira11/route-overlay/pull/5

The branch commit that contains this report is rebased onto `main`. The verified `origin/main` SHA is the one observed after that merge.
