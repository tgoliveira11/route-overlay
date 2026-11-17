# Phase 7 — Confirmed Google route coverage

## 1. Route confirmation method

An agent operated the local `/plan` page on 2026-11-17. The imported URL was scenario A, Santos to Montevideo, with no intermediate waypoint. The shared URL does not encode a polyline or a route token. The page stated that the selected Google Maps alternative may not be recoverable.

The operator clicked **Reconstruct with Google Routes**, saw three non-synthetic candidates on the Google map, and clicked **Confirm selected candidate** for the candidate that was already selected:

- Label: Google default route
- Provider label: `DEFAULT_ROUTE`
- Description: BR-116
- Provider distance: 1,936,072 m
- Provider duration: 86,755 s (24 h 6 min)

The other candidates were not confirmed:

- Alternative 2, 2,022.5 km, 26 h 36 min, BR-116 and Ruta 5
- Alternative 3, 1,996.3 km, 26 h 44 min, Ruta 5

This was an agent-operated test confirmation of a reconstructed Routes API candidate. It is not proof that a person selected that alternative inside Google Maps. Independently verified fidelity stayed false, which is what the page reported after confirmation and again after reload.

The embedded browser added a forwarding header, so `POST /api/routes/confirmed-geometry` returned HTTP 403 and did not write a file. The same confirmed payload, already held in this browser's planning session, was then submitted through a direct loopback socket to the existing session store. The production endpoint was not relaxed. A second session id still reads as unavailable.

## 2. Actual API requests

Before the experiment the local counter in `.route-overlay/phase4-budget.json` was 8 `computeRoutes` calls and 5 map loads. After the experiment it was 9 and 6. Places requests stayed at the Phase 5 total of 24. No new Places call was made.

The one new Routes request used `TRAFFIC_UNAWARE`, asked for alternatives, and used the basic field mask (distance, duration, encoded polyline, description, labels, warnings). That is the Compute Routes Essentials SKU, listed at USD 5.00 per 1,000 requests after the monthly free cap. One request is at most about USD 0.005 if the free cap is already exhausted. One Maps JavaScript load is a separate small charge, well under USD 0.01 at the published Dynamic Maps rate. The marginal cost of this phase is far below USD 2.

## 3. Source and revision identity

| Identity | Value |
| --- | --- |
| Original Google Maps link | Scenario A URL. No encoded polyline. |
| Reconstructed provider | `google_routes_api` |
| Synthetic | false |
| Rendered candidate | Google default route, drawn on the Google map |
| Explicitly confirmed candidate | `google-1`, label `Google default route` |
| Revision SHA-256 | `5e7dbe78df0631efec1dbcbacedd25e81a66d4863ca795cbafb0138457f565c9` |
| Session | `640de5a9-37ef-47f4-aa14-5c6c6e4e46c3` |
| Expires | 2026-12-17T22:09:30.586Z |

The polyline remains in the gitignored session file. It is not in Git.

## 4. Geometry persistence evidence

The stored record has source `google_routes_api`, `synthetic: false`, and a revision id equal to the SHA-256 of its polyline. Decoding that stored polyline produced 11,869 points. The nearest point to the Jaguarão reference (-32.56, -53.37) is 1,227.8 m away, inside the 5 km reliability limit. The Brazilian clip has 9,670 points and a haversine length of 1,518,358.7 m. The full haversine length is 1,935,936.9 m.

Reload of `/plan` in the same browser restored the confirmation text: "Confirmed live itinerary: Google default route" and "Independently verified fidelity: false." A different session id does not receive these counts.

## 5. Historical versus confirmed comparison

The confirmed counts were recomputed from the stored polyline and the existing ANP observations. The cached default figures were not copied into the confirmed column.

| Metric | Cached default | Confirmed revision |
| --- | --- | --- |
| Source | `cached_google_default_route` | `confirmed_google_routes_revision` |
| Provider distance | 1,936,072 m | 1,936,072 m |
| Provider duration | 86,755 s | 86,755 s |
| Geometry points | 11,869 | 11,869 |
| Brazilian points | 9,670 | 9,670 |
| Brazilian length | 1,518,359 m | 1,518,358.7 m |
| Border approach | 1,228 m | 1,227.8 m |
| Premium within 2 km | 82 | 82 |
| Premium from 2 to 5 km | 42 | 42 |
| Premium outside 5 km | 165 | 165 |
| Premium without coordinates | 5 | 5 |
| Entered the 2 km band | Historical screen | 0 |
| Left the 2 km band | Historical screen | 0 |
| Band changes | Historical screen | 0 |
| Gaps over 100 km | 2 | 2 |

The two gaps on the confirmed Brazilian clip are 116,865 m and 129,575 m, the same gaps already published for the cached default. No premium station changed band.

## 6. ANP station coverage changes

Stations added to the 2 km band: 0. Stations removed from the 2 km band: 0. Stations added to the 2–5 km band: 0. Stations removed from the 2–5 km band: 0. The newly confirmed Routes default reproduces the cached-default screen. It does not identify a different Google Maps alternative.

## 7. Map screenshots

The local session showed the three live candidates and a Google map whose caption read "Google default route: 1936.1 km, 24 h 6 min" before confirmation. After reload, the page still showed the confirmed live itinerary. Those screenshots display Google map tiles and the route, so they were not committed.

## 8. Test results

The offline suite for this branch, with paid flags off:

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run test:unit` | 119 passed |
| `npm run test:integration` | 22 passed |
| `npm run test:e2e` | 20 passed, 1 skipped live-provider smoke |
| `npm run build` | Passed |
| `npm audit --omit=dev` | 0 vulnerabilities |

The live confirmation in sections 1–6 is separate from that suite. The default tests do not call Google.

## 9. Google content retention safeguards

The encoded polyline is stored only in `.route-overlay/confirmed-routes/<session-uuid>.json`, which Git ignores. Retention is 30 days. The HTTP response returns the revision id and expiry, not the polyline. The coverage response returns counts, lengths, and gap endpoints, not the polyline. A forwarding header or a non-loopback host is rejected before a file is written. The session UUID is not authentication.

## 10. Known limitations

- The original Google Maps selection is still not in the shared URL.
- This confirmation matches the cached default geometry closely enough that every premium band stayed the same. That is a measured result, not a silent fallback.
- The embedded browser cannot call the confirmed-route endpoints because it sends a forwarding header. A direct loopback client can.
- ANP coordinates remain unvalidated. Bands are straight-line distances, not driving detours.
- No station is described as open or stocked.
- No new Places request was made.

## 11. Pull request and merged commit

Recorded when the pull request is opened and again after `origin/main` is verified.
