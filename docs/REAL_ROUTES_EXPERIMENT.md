# Real Routes experiment

Date: 2026-11-16. Branch: `feature/google-routes-live-validation`. Provider: `https://routes.googleapis.com/directions/v2:computeRoutes`. Display: Maps JavaScript API on a Google map.

The first four calls were made by `tests/live/phase4-live.test.ts` with `ROUTE_OVERLAY_LIVE_EXPERIMENT=true`. Two more calls were made from the local planner in a browser. The counter ended at 6 `computeRoutes` calls and 2 map loads, inside the caps of 20 and 30. No call was retried. Polylines are not copied into this file.

Fidelity of the original on-screen Google Maps selection is **UNVERIFIED**. Confirmation does not change that.

## Scenario A — Santos to Montevideo, no intermediate waypoint

Source: the captured address-bar URL in `docs/REAL-URL-EVIDENCE.md`. `computeAlternativeRoutes` was true. Three routes came back.

| Route | Label | Distance | Duration | Closest approach |
| --- | --- | --- | --- | --- |
| `google-1` | `DEFAULT_ROUTE`, description BR-116 | 1,936,072 m | 86,755 s (24 h 6 min) | 92.9 km from Chuí, 1.2 km from Jaguarão |
| `google-2` | `DEFAULT_ROUTE_ALTERNATE`, BR-116 and Route 5 | 2,022,523 m | 95,736 s (26 h 36 min) | 256 km from Chuí, 246 km from Jaguarão |
| `google-3` | `DEFAULT_ROUTE_ALTERNATE`, Route 5 | 1,996,331 m | 96,238 s (26 h 44 min) | 256 km from Chuí, 246 km from Jaguarão |

The three geometries are distinct. The default passes near Jaguarão and does not pass near Chuí. The other two stay far from both border coordinates. All three warned about tolls, a highway, and a country border. The request used coordinates where the URL also contained a place ID. The place ID stayed on the draft.

A second direct request, made later from the planner, did not repeat this set. It returned:

| Route | Label | Distance | Duration |
| --- | --- | --- | --- |
| Default | BR-116, `DEFAULT_ROUTE` | 1,936.1 km | 24 h 6 min |
| Alternative 2 | BR-101, `DEFAULT_ROUTE_ALTERNATE` | 2,132.1 km | 26 h 15 min |
| Alternative 3 | BR-116 and Route 5, `DEFAULT_ROUTE_ALTERNATE` | 2,022.5 km | 26 h 36 min |

The BR-116 default and the combined Route 5 alternative matched the first response. The Route 5-only alternative was absent, and a longer BR-101 alternative appeared instead. The alternative set is not stable across requests.

The browser drew all three on one Google map. Selecting another candidate changed the summary and the highlighted line. The local counter stayed at one map load for that screen. Screenshots: `docs/evidence/phase4-santos-default.png`, `docs/evidence/phase4-santos-br101.png`, and `docs/evidence/phase4-santos-route5.png`. The panel with the Google logo is the live map. The schematic above it is not the live geometry.

## Scenario B — through Chuí

Controlled fixture, waypoint `-33.6900,-53.4600`. Alternatives were not requested. One route returned.

| Route | Label | Distance | Duration | Closest approach |
| --- | --- | --- | --- | --- |
| `google-1` | `DEFAULT_ROUTE`, description BR-101 | 1,978,137 m | 88,385 s (24 h 33 min) | 19 m from the Chuí coordinate, 70.0 km from Jaguarão |

The same distance and duration appeared when the planner recalculated the imported Santos URL after that coordinate was added. One candidate was offered, and the page said alternatives are not returned for intermediate waypoints. Screenshot: `docs/evidence/phase4-chui.png`. The waypoint remained listed as `-33.6900, -53.4600`.

## Scenario C — through Jaguarão

Controlled fixture, waypoint `-32.5600,-53.3700`. One route returned. It was not drawn in the browser. The geometry check is the decoded polyline.

| Route | Label | Distance | Duration | Closest approach |
| --- | --- | --- | --- | --- |
| `google-1` | `DEFAULT_ROUTE`, BR-101 and BR-116 | 1,936,506 m | 87,086 s (24 h 11 min) | 12 m from the Jaguarão coordinate, 92.9 km from Chuí |

The unconstrained default already passed 1.2 km from this coordinate. The waypoint pulls the route onto the coordinate. That is a stopover, not the same geometry as "passes nearby."

## Scenario D — captured three-stop URL

Source: the Santos, Montevideo, Porto Alegre address-bar URL in the research corpus. Montevideo is the intermediate stop and Porto Alegre is the destination. Alternatives were not requested. One route returned. It was not drawn in the browser.

| Route | Label | Distance | Duration |
| --- | --- | --- | --- |
| `google-1` | `DEFAULT_ROUTE`, BR-116 | 2,742,839 m | 123,036 s (34 h 11 min) |

The decoded line passes 1.2 km from Jaguarão, which matches the unconstrained Santos–Montevideo default, and then continues to Porto Alegre. Stop order was preserved. Three place IDs stayed on the draft while the request used coordinates.

## Scenario E — comparison with the Maps screenshot

Reference: `docs/evidence/santos-montevideo-alternatives.webp`. That screenshot lists:

| Maps card | Distance | Duration on that screen |
| --- | --- | --- |
| via BR-116 | 1,936 km | 25 hr |
| via Route 5 | 1,997 km | 27 hr |
| via BR-116 and Route 5 | 2,023 km | 27 hr |

The first Routes response uses the same road labels and the same kilometer figures, within about one kilometer. The durations are shorter because the request was `TRAFFIC_UNAWARE` and the Maps card says "Fastest route now." The second Routes response dropped the Route 5-only card and added a BR-101 route that is not on that screenshot.

The live map screenshots show three visibly different corridors: the default, a more coastal BR-101 line, and a Route 5 line that bends farther west through Uruguay. They were not overlaid on the evidence image, and the URL does not identify which card was selected. Similar distance and the same road label are not geometric proof. Original-route fidelity stays **UNVERIFIED**.

## Scenario F — confirm the drawn route

The planner selected the BR-116 default after it was drawn. Confirm was enabled. The stored session was:

- `candidateId`: `google-1`
- `source`: `google_routes_api`
- `synthetic`: false
- `fidelityIndependentlyVerified`: false
- `status`: `user_confirmed`
- distance 1,936,073 m, duration 86,755 s
- polyline length 44,023 characters, the same length as the first default polyline
- stops: Santos, then Montevideo
- the stored revision includes the origin coordinate from the imported URL

A different polyline is not treated as the rendered selection. That check passed in the live test.

## Scenario G — edit invalidates the confirmation

Adding `-33.6900, -53.4600` removed the confirm control, showed "The draft changed. The previous geometry was discarded.", and set the stored `confirmed` value to null. The following live recalculation was a new request and produced the Chuí route above, not the previously confirmed polyline.

During that click, the on-screen effort counters advanced, but the stored metrics still said the confirmation was completed. `invalidateConfirmation` now clears that completion when the draft changes. The browser walk used the build from before that correction. **Recalculate draft** also used the mock provider whenever it was pressed. It now uses live Routes when live Routes is available. The Chuí screen in this experiment was requested with **Reconstruct with Google Routes**, which already sent the current draft.

## Scenario H — failures without extra spend

- Live Routes disabled: the adapter returned before fetch and did not increment the counter.
- Counter already at 20: the adapter refused the call and did not fetch. The probe used a fake key.
- HTTP 403 and 429 response text is classified as a billing or quota error by the unit tests. Those tests use a fake fetch. No live request was sent with a bad key.
- The browser suite, with Google mocked, keeps confirmation disabled when the map script fails or the browser key is missing.

## What this does not show

- It does not recover the alternative that was selected when the link was copied.
- It does not show that the next direct request will list the same three alternatives.
- It does not show a person's preference. The clicks were made by the local agent.
- It does not show an invoice amount. Only the request counter was read.
