# Architecture

RouteOverlay is a local Next.js App Router application. Domain logic lives in `lib/route-overlay` and does not import React. The diagnostic console remains on `/`. The assisted flow is a separate page at `/plan`.

## Boundaries

| Concern | Module | Notes |
| --- | --- | --- |
| Route import | `parse-maps-url.ts`, `redirect-policy.ts`, `recoverability.ts` | Full directions URLs are parsed offline. Short links use manual redirects and an exact hostname allowlist. |
| Reconstruction providers | `mock-reconstruct.ts`, `google-routes.ts` | Mock is the default. Live calls require `ROUTE_OVERLAY_GOOGLE_API_ENABLED=true` and a non-empty `GOOGLE_ROUTES_API_KEY`. |
| Candidate policy | `candidates.ts` | Decides which reconstructed lines the assisted flow may offer. |
| Draft identity | `revision.ts` | `routingRevision` identifies the stops, avoid flags, and travel mode that a geometry belongs to. |
| Geometry | `polyline.ts`, `geo.ts`, `components/route-map.tsx` | Encoded polylines and an SVG schematic. The schematic is not a map tile service. |
| Live map boundary | `maps-display.ts`, `components/google-route-map.tsx` | Loads the Maps JavaScript API only when that display is explicitly configured. It is off by default. |
| Refinement | `refinement.ts` | Draft waypoints, order, place IDs, via semantics, avoid flags, and a rebuilt Maps URLs `api=1` link. The original imported URL is kept. |
| Confirmation | `confirmation.ts` | Version 2 session in `localStorage` key `route-overlay.planning-session.v2`. The confirmed itinerary stores `routingRevision`. |
| Effort counters | `effort.ts` | In-browser counts only. No analytics endpoint. |
| Stop planning | `fuel-stations.ts`, `stop-plan.ts` | Synthetic stations with `synthetic: true`. |
| HTTP | `app/api/routes/import`, `reconstruct`, `status` | The existing handlers. The planner calls them. |
| UI | `components/route-console.tsx`, `components/assisted-planner.tsx` | Diagnostics and assisted confirmation stay separate. |

## Reconstruction request

`buildRoutesRequest` sends a minimal field mask:

`routes.distanceMeters`, `routes.duration`, `routes.polyline.encodedPolyline`, `routes.description`, `routes.routeLabels`, `routes.warnings`.

`computeAlternativeRoutes` is set only when the travel mode maps to `DRIVE` or `TWO_WHEELER` and the request has no intermediate waypoint. That follows the [compute route directions](https://developers.google.com/maps/documentation/routes/compute_route_directions) limitation: alternatives are not returned when intermediate waypoints are present. The API may return a default route and up to three additional routes, and fewer is a valid response. This client does not invent the missing ones.

Driving requests use `TRAFFIC_UNAWARE` so a live call does not ask for traffic-aware billing beyond the basic route.

For `DRIVE` and `TWO_WHEELER`, recovered `avoid=tolls`, `avoid=highways`, and `avoid=ferries` are sent as `routeModifiers.avoidTolls`, `avoidHighways`, and `avoidFerries`. A flag that was not present is omitted. `false` is not invented. For walking, bicycling, and transit the same flags stay visible as an unsupported constraint, and `routeModifiers` is not sent. A stop that has both coordinates and a place ID is sent to Routes as coordinates, because a Routes waypoint is one of those forms. The place ID remains on the draft and on the rebuilt URL, and the request warning says so.

## What the schematic may draw

Mock corridors are synthetic bends. They are labeled mock and may be drawn in the SVG.

A live Routes polyline is stripped before it reaches the SVG. [Routes API policies](https://developers.google.com/maps/documentation/routes/policies) do not allow Google route content on a non-Google basemap.

The supported display is the [Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/overview) polyline on a Google map, implemented in `components/google-route-map.tsx`. The component is mounted only when `ROUTE_OVERLAY_GOOGLE_MAPS_JS_ENABLED=true` and `GOOGLE_MAPS_JS_API_KEY` is non-empty. Both stay unset in `.env.example`. The key is returned by `/api/routes/status` only in that case, because the browser script needs it. Loading that script is a separate billable Maps JavaScript product. It is not enabled by the Routes API flag.

Until that map reports ready, live confirmation is blocked. RouteOverlay does not draw a synthetic stand-in for a live polyline and does not describe an unseen live route as confirmed. Mock geometry can still be confirmed on the schematic, and it stays labeled mock.

## Confirmation semantics

A stored itinerary has `status: "user_confirmed"` and `fidelityIndependentlyVerified: false`. It also stores `routingRevision`, the exact draft identity of the geometry. `parseSession` rejects a payload that claims independent verification, a version other than 2, an empty revision, a confirmed `originalUrl` that differs from `importedUrl`, or malformed stops.

The planner keeps a request generation counter. A reconstruction response is applied only when both the generation and the draft revision still match the request that started it. Adding, removing, or reordering a waypoint increments the generation, discards the current candidates, and clears confirmation eligibility. A successful import of another URL writes a new session with `confirmed: null` before any further action. A failed import removes the session. Reset removes the key. There is no database.

Labels used in the product:

- Imported information: the parser output and the original URL.
- Reconstructed geometry: a provider result, mock or live.
- Mock geometry: `reconstruction.mock === true` and a visible MOCK badge.
- User-confirmed itinerary: the session written only after the confirm action.
- Independently verified fidelity: always false in this application.

## Stop planner

`planStopsAlongPolyline` walks samples of the confirmed polyline. Spacing is the smaller of the preferred interval and the usable range (`rangeKm - reserveKm`). It picks an unused synthetic station that matches the fuel type, and the 24-hour flag when requested, only when the straight-line detour is inside the maximum and the distance since the last fuel point is still inside the usable range. A miss does not reset that distance. The same station is not selected twice. If the usable range is exceeded without an eligible unused station, the plan records a gap and stops. `feasible` is true only when `gaps` is empty. Each detour is labeled `straight_line`. The disclaimer says the fixtures are not real businesses, that the detour is not a road distance, and that the plan does not claim real-world refueling safety. This phase does not call Places.

## Scenarios

`scenarios.ts` separates `parsed_real_link` URLs copied from `docs/REAL-URL-EVIDENCE.md` from `controlled_fixture` URLs built for Chuí, Jaguarão, and the unsupported place page. Fixture coordinates are not claimed to be captured shares.

## Phase 3.1 corrections

The first assisted implementation could confirm a newly edited draft against the previous polyline. Confirmation read the current stops and the previously selected encoded polyline. The correction gives every reconstruction a `routingRevision` and a generation. Draft edits discard that geometry. Confirmation stays disabled until a reconstruction of the current draft succeeds, and a late response from an older request is ignored.

Rebuilding the `api=1` URL used to drop `avoid`, place IDs, and via semantics. The parser now keeps aligned `waypoint_place_ids`, including empty slots, and `place_id:` tokens. The rebuilt URL writes `origin_place_id`, `destination_place_id`, `via:` waypoint prefixes, aligned place IDs, and `avoid=tolls|highways|ferries` when those flags were recovered. Constraints the Routes request cannot represent are listed in the import summary.

A confirmed session used to survive the next import, including a failed one, and a refresh could show the previous itinerary. The storage key is now version 2. A new import replaces the session with an unconfirmed record for that URL. A failed import deletes it.

The stop planner used to reset the fuel clock after a miss, so a later station could be chosen after the usable range had already been exceeded. It can also select the same fixture twice. The current planner reports those cases as unresolved gaps and does not mark the itinerary feasible. The mock Santos–Montevideo corridor, with the default 500 km range and 80 km reserve, has its first sampled vertex beyond the 420 km usable range, so that default plan is not feasible. A station inside the range and the detour is still selected. The samples follow segment ends at about 20 km, so a long mock segment does not invent intermediate road points.
