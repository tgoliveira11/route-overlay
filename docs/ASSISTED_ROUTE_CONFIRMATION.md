# Assisted route confirmation

This document describes the phase 3 workflow. It does not replace `docs/FEASIBILITY.md` or `docs/REAL-URL-EVIDENCE.md`. Faithful recovery of the Google Maps alternative that was on screen remains a no-go.

## Workflow

1. The user plans a route in Google Maps and pastes the shared URL into `/plan`.
2. RouteOverlay parses the URL with the existing parser and lists origin, destination, intermediate waypoints and their order, travel preferences, recovered fields, missing fields, and the original URL.
3. The user reconstructs. Mock mode is the default and is labeled synthetic. Live mode calls the Google Routes API only when the server flag and key are both set.
4. The user compares the candidates that the provider actually returned. Distance and duration are shown when the provider supplied them.
5. The user selects a candidate or edits intermediate waypoints. Any edit that changes routing constraints discards the current geometry. Confirmation stays blocked until the user recalculates that draft and a current response arrives.
6. The user confirms a candidate whose geometry revision matches the draft. The confirmed polyline becomes the planning baseline in this browser. A live candidate cannot be confirmed until it is drawn on a configured Google map.
7. Stop planning unlocks. The first prototype uses synthetic fuel stations.

The page states that confirmation is a planning choice. Independently verified fidelity stays false. Selecting a candidate does not prove it is the line that was on screen in Maps.

## Provider behavior

Official Maps URLs parameters do not include the selected alternative or its polyline. The guide is [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started).

The Routes API can compute a new route from the recovered stops. For `DRIVE` and `TWO_WHEELER` with no intermediates, this client sets `computeAlternativeRoutes`. [Google's directions documentation](https://developers.google.com/maps/documentation/routes/compute_route_directions) says intermediate waypoints suppress alternatives. This client omits the flag in that case and shows one corridor. It does not label extra mock bends as Google responses.

Mock mode without intermediates returns the existing synthetic pair so the comparison UI can be tested offline. Mock mode with intermediates shows only the primary synthetic corridor, kind `mock_waypoint_fallback`. A live response is returned as `live_alternative` or `live_only_route` and is never padded.

## Manual refinement

The draft can add, remove, and reorder intermediate waypoints, including a `via:` prefix and a `place_id:` token. `applyDraft` keeps `inputUrl` as the imported link and rebuilds `normalizedUrl` with the documented `api=1` parameters: ordered waypoints, `via:` for pass-through stops, aligned `waypoint_place_ids`, origin and destination place IDs, travel mode, and recovered avoid flags. Recalculation is a separate button. Adding a waypoint discards the previous candidates immediately, so an old polyline cannot be confirmed with the new stops. The import summary lists constraints that were represented and constraints that cannot be sent.

## Persistence

`localStorage` key `route-overlay.planning-session.v2` stores the imported URL, the confirmed itinerary, and the local effort counters. The confirmed itinerary includes `routingRevision`. Version mismatches, an empty revision, a confirmation whose `originalUrl` is not the imported URL, and a `fidelityIndependentlyVerified` value of true are rejected. A successful import overwrites the key with `confirmed: null` for the new URL. A failed import removes the key and clears the on-screen effort counters, so the previous itinerary's friction is not left behind. Reset removes the key. A reset after confirmation marks the in-memory counters abandoned. That abandoned state is not sent anywhere. Version 1 sessions are ignored.

## Stop planning

The planner reads only the confirmed polyline. Inputs are fuel type, estimated range, safety reserve, maximum detour, preferred interval, and an optional 24-hour preference. Stations come from `SYNTHETIC_STATIONS`. Every station is marked synthetic. Detours are straight-line estimates. A plan with an unresolved gap is labeled not feasible. The UI says the fixtures are not real businesses and that the plan does not claim real-world refueling safety. This phase does not call Places. On the default Santos–Montevideo mock corridor the first sampled vertex is beyond the usable range, so the default plan reports gaps and zero stops.

## Map rendering

The preview is an SVG schematic of mock geometry. Live encoded polylines are removed before drawing because [Routes API policies](https://developers.google.com/maps/documentation/routes/policies) restrict Google route content to a Google map.

A live polyline can be drawn only by `components/google-route-map.tsx`, which loads the [Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/overview) with the geometry library. That requires both `ROUTE_OVERLAY_GOOGLE_MAPS_JS_ENABLED=true` and a non-empty `GOOGLE_MAPS_JS_API_KEY`. The key is a server environment variable and is exposed to the browser only when the display is available, because the Maps script cannot authenticate without it. The feature stays disabled without those credentials. Live confirmation stays blocked until the map reports ready. No synthetic geometry is substituted for a live Google route. This repository has not enabled the flag, has not supplied a key, and has not verified a live map. The original URL remains available so the user can compare the route in Google Maps itself.

## Evidence classes

| Class | Meaning in this phase |
| --- | --- |
| Parsed real link | URL text copied from `docs/REAL-URL-EVIDENCE.md`. Parsing it does not recover the clicked alternative. |
| Controlled fixture | An `api=1` URL or a place page built for a test. Not a captured share. |
| Mock geometry | Output of `reconstructMock`. Not a Google route. |
| Mocked HTTP | A Vitest `fetch` stub passed into `computeGoogleRoutes`. Not a call to Google. |
| Live API | Not executed. No key was configured and no billing was enabled. |

## Scenarios

| Id | Evidence | What it checks |
| --- | --- | --- |
| A | Parsed Santos–Montevideo address-bar URL | Stops without an intermediate waypoint, then mock candidates. |
| B | Fixture through Chuí (`-33.6900,-53.4600`) | A preferred border is expressed as a waypoint. Alternatives are withheld. |
| C | Fixture through Jaguarão (`-32.5600,-53.3700`) | Same policy as B, different coordinate. |
| D | Parsed Santos, Montevideo, Porto Alegre URL | Ordered stops. The Routes request omits `computeAlternativeRoutes`. |
| E | Same URL as A | The non-default mock candidate can be selected. It is not a recovered Google alternative. |
| F | Same URL as A, then a typed waypoint | Manual refinement and an explicit recalculation. |
| G | `https://www.google.com/maps/place/MASP` | Unsupported place page. Reconstruction returns 422. |
| H | Same URL as A | Confirmation unlocks the synthetic stop plan. With the default limits the mock corridor is reported not feasible. |

B and C were not copied from a Maps session. Their coordinates are test constraints.
