# Route import feasibility

Decision for faithful recovery of the route a person selected in Google Maps: **NO-GO**.

Decision for recovering the stop list from a full directions URL: **GO**, for the real URLs captured in `docs/REAL-URL-EVIDENCE.md`.

Whether an undocumented data-blob integer such as `!5i2` is a stable alternative index: **INCONCLUSIVE**. It is not road geometry.

This file is the project report. The URL corpus, redirect log, and screenshots are in `docs/REAL-URL-EVIDENCE.md`.

## Execution environment

Checked on 2026-11-16 from the Cursor Cloud Agent that edited this repository.

- The machine is Linux (`x86_64`), not Windows.
- `/mnt` and `/media` are empty. There is no drvfs, 9p, or virtiofs mount of another computer's files.
- This working tree is not a Windows checkout. A path on another computer is not visible here.
- `http://localhost:3000` in this VM is not the user's browser. Do not treat a server started here as the app running on another computer.

The source of this project, when this section was written, was the Cursor Cloud Agent workspace (git branch `main`). It was not yet published and it had not been copied to another computer.

To run it elsewhere:

1. Copy the project files. Skip `node_modules` and `.next`.
2. In that folder run `npm install`, then `npm run dev`, and open `http://localhost:3000` on that computer.

A later agent can read and write a checkout only when it is started with that folder open. A Cloud Agent boots a remote Linux VM and does not receive another computer's filesystem. Changing `environment.json` on a cloud environment does not mount a local user profile.

## Hypothesis H1

**Stop identity and travel mode can be recovered from a shared Google Maps directions URL without calling the Routes API.**

**GO** for these real, fully captured URLs:

- Two public `maps.app.goo.gl` links that redirect to the same London endpoints. Path segments are latitude,longitude. No Routes API call was required.
- A public `maps.app.goo.gl` link to Tempe Municipal Court. The origin coordinate is in the path. The court coordinate is in the data blob (`!1d` longitude, `!2d` latitude).
- The live redirect of `https://goo.gl/maps/HcikiDXFwN2coeFN8` (Eiffel Tower to Palais Garnier). Two named stops and two coordinate pairs. The 2021 write-up of that short link showed extra via coordinates; the redirect on 2026-11-16 does not.
- The address bar after a desktop click on the second Santos–Montevideo alternative. Both place names and both place coordinates are present. Travel mode is the observed token `!3e0` (driving), which Maps URLs does not document.
- A three-stop desktop URL whose path order is Santos, Montevideo, Porto Alegre. That is the order of the form fields. Porto Alegre is the last stop in the URL, not a via point inserted before Montevideo.

**INCONCLUSIVE** for the first Santos–Montevideo address-bar string saved from the omnibox. It ends inside the data blob after only the Santos coordinate. The screenshot shows the omnibox was visually truncated. That string is not evidence of a complete share.

**Not executed:** a link copied from the Google Maps mobile share sheet by the phone's Share control. That still requires a link the user copies on the device. See the evidence note.

Documented Maps URLs (`api=1` with `origin`, `destination`, `waypoints`, `travelmode`, `avoid`, and place ids) remain supported. Google's Maps URLs guide lists those parameters and does not require an API key. Address-bar URLs that the Maps website writes often omit `api=1`. The guide says that without `api=1` the documented query parameters are ignored. The `/maps/dir/.../data=!...` form is still explicit text, and this parser reads it, but it is not the documented developer contract.

## Hypothesis H2

**The specific alternative the person selected, including its geometry, is preserved in that URL and can be reconstructed faithfully.**

**NO-GO.** The main hypothesis is not supported.

Evidence from real links:

- None of the captured URLs contains an encoded polyline or a Routes API route token.
- The two London shares use the same origin and destination. The poster identified them as different routes. After the live redirects, the route-related difference is the integer field `!5i2` on one of them, plus a different viewport distance. There is no road name and no polyline. The integer is recorded and is not used as a route choice.
- On the desktop map, three driving alternatives were visible (via BR-116, 1,936 km; via Ruta 5, 1,997 km; a third, 2,023 km). Those names and distances were on screen. They are not in the URL text that was captured. Clicking the second alternative changed the address bar. The saved "before" URL is truncated, so the byte-level diff of that click is inconclusive. The complete "after" URL still has no polyline.
- Mock reconstruction of the Santos alternative is labeled mock and reports that the selected route was not preserved. A new computed route would not be evidence that the original selection was recovered, so the Routes API was not called.

The official Maps URLs parameters for directions are `origin`, `destination`, `travelmode`, `dir_action`, `waypoints`, `waypoint_place_ids`, place ids, and `avoid` (`tolls`, `highways`, `ferries`). There is no parameter for the selected alternative or for its geometry.

`avoid` on a query string is documented. An earlier draft of this report called it undocumented. That was wrong and is corrected in the parser: a query `avoid` value is `recovered`. Legacy `dirflg` remains partial. Data-blob fields are not read as avoidance.

## What a share still does not carry

- The encoded polyline of the chosen alternative.
- A Routes API route token.
- A documented index of the alternative that was on screen. `!5i2` is an observed integer, not a documented index.
- The on-screen road label ("via BR-116") or the on-screen distance.
- Traffic at share time. One public Tempe URL contains `!8j1751276700`. If that integer were Unix seconds it would be `2025-06-30T09:45:00.000Z`. Maps URLs does not document the field, so the parser leaves it inconclusive and does not set `departureTime`.

## Reconstruction

Mock reconstruction stays the default. It never calls Google. Synthetic geometry is bent on purpose so it cannot be mistaken for the roads on screen. It is not a fidelity proof.

The optional Routes API client remains disabled unless `ROUTE_OVERLAY_GOOGLE_API_ENABLED=true` and `GOOGLE_ROUTES_API_KEY` are both set. It was not called for this validation. No paid Google API request was made.

A via point still produces the verdict `constrained_not_proven`. None of the real multi-stop URLs in this pass used a `via:` prefix. The three-stop URL is an ordered stop list. The roads between those stops are not identified.

`selectedRoutePreserved` stays true only when the URL itself carries a polyline. No real share in this corpus did.

## Coordinate order, confirmed on real URLs

- Path segments such as `51.5199302,-0.1103523` are latitude, then longitude.
- Data-blob pairs `!1d-0.1103523!2d51.5199302` are longitude then latitude.
- Documented query coordinates (`origin=-23.56,-46.65`) are latitude, then longitude, per Maps URLs.

## Short links

Full directions URLs are parsed with no network. `maps.app.goo.gl` and `goo.gl/maps` are expanded with one HTTPS GET that follows the redirect and accepts only a Google Maps host.

The desktop Share dialog showed a preview card that mentioned `maps.app.goo.gl`. The Copy control was reported to place the long `google.com` URL on the clipboard, and no short-link string was captured from that dialog. Real short-link behavior in this report comes from the public links whose `302` targets were recorded.

## What requires Google credentials

Nothing in parsing, the recoverability table, mock reconstruction, or this report.

A live Routes API call needs the two environment variables above and a billed key. Even then the call computes a new route from the recovered stops. It does not receive the alternative that was selected in Maps.

## What remains

- A link the user copies from the Google Maps app on a phone, after choosing an alternative, including a Santos–Montevideo trip if they can share that one. Paste the `maps.app.goo.gl` URL unchanged.
- An independent geometry (a GPX or another export of the same driven roads). Until that exists, no distance shown by Maps can be used as proof that a reconstruction matched.
- A complete address-bar capture of the default Santos–Montevideo route, taken from the full `location.href`, not from the truncated omnibox display.
- Whether `!5i2` keeps meaning the same alternative on other days. It must not be promoted to a route index without a published contract and a geometry check.

## Test status for this revision

Parser, recoverability, mock reconstruction, route handlers, and the real-URL fixtures were run with Vitest in this Linux workspace (37 tests). Typecheck and ESLint were run on the changed parser. Playwright was re-run against the dev server when it was already listening in this VM. Those runs do not move the project onto Windows and do not call the Routes API.

## Assisted confirmation, phase 3

H1 and H2 above are unchanged. Faithful recovery of the alternative that was on screen remains **NO-GO**. This section answers a different question: whether a person can import the recoverable stops, compare reconstructed candidates, confirm one, and use that confirmation as a stop-planning baseline.

The assisted work continued on a local Windows checkout of branch `feature/assisted-route-confirmation`. No Routes API call was made. Mock corridors and synthetic fuel stations are fixtures. Counts and the verdict are in `docs/PHASE3_TEST_RESULTS.md`, `docs/USER_FRICTION_ANALYSIS.md`, and `docs/ASSISTED_ROUTE_CONFIRMATION.md`.

**CONDITIONAL GO** for the assisted workflow as a product prototype.

The import, candidate, refinement, confirmation, and synthetic stop-planning path works without a Google key. An automated browser session can accept a non-default mock candidate without adding waypoints. That is technical feasibility. It is not evidence that a real person recognized their Google Maps itinerary, and it is not evidence that the confirmed geometry matches the roads that were on screen.

### Answers

1. A shared URL can supply stops and preferences. It does not supply the selected geometry. Mock mode then offers labeled synthetic candidates. Live mode would compute new Routes API routes from those stops, and that call was not executed.
2. When mock mode offers more than one corridor and the user does not need extra waypoints, the user can select a candidate and confirm it. The Playwright session did that and the screen classified the effort as low. The selected mock corridor is not the Maps alternative.
3. With intermediate waypoints, alternatives are not requested. [Google documents that `computeAlternativeRoutes` does not return alternatives when intermediates are present](https://developers.google.com/maps/documentation/routes/compute_route_directions). The screen shows one corridor and says so. Live responses are not padded with mock bends.
4. Intermediate stops keep their order. The user can add, remove, and reorder them. The route changes only after an explicit recalculation.
5. One added coordinate and one recalculation are enough to constrain a fixture such as Chuí. The engineering label for that amount of editing, once the user confirms, is moderate. No person was timed doing it.
6. The URL still does not carry the encoded polyline, a route token, a documented alternative index, the on-screen road label, or the on-screen distance. See “What a share still does not carry” above.
7. After an explicit confirmation, the stored polyline is the only geometry the stop planner reads. In this phase the stations are synthetic fixtures. The planner does not claim a complete set of real businesses.
8. Local counters classify a completed confirmation with no added waypoints and no recalculation as low, one or two additions and at most two recalculations as moderate, and abandonment or more editing as high. Those bands are engineering thresholds. They are not a usability study.
9. Remaining technical risks: no live Routes response was compared with Maps; live polylines are intentionally not drawn on the schematic; waypoint routes have no alternatives; confirmation is stored only in `localStorage`; synthetic stations are not a directory.
10. The nested PostCSS 8.4.31 copy under Next.js was replaced with 8.5.33. The vulnerable minimatch 10.2.6 copies used by the lint and shadcn tooling were replaced with 11.0.8. The `shadcn` CLI was moved to devDependencies. Vitest moved from 3.2.4 to 3.2.7 inside its existing range. Details are in `docs/SECURITY_AUDIT.md`.
11. Tinypool 1.1.1 and Vitest 3.2.7 remain inside advisory ranges that npm would clear only by installing Vitest 5.1.0. They are test-runner dependencies. The production audit after this phase reports no findings. `deepmerge` 4.3.1 remains on the shadcn CLI path. Next.js was not upgraded to 16 because the PostCSS finding was patched without that major upgrade.
12. The assisted confirmation approach is worth continuing as a prototype. It is not yet a decision that users will accept the extra work, and it does not revive faithful import of the selected Google Maps alternative.

## Live Routes, phase 4

H1 and H2 above are unchanged. Faithful recovery of the alternative that was on screen remains **NO-GO**. This section records a different question: whether Google Routes can compute the recovered Santos–Montevideo stops, draw those polylines on an official Google map, and let a person confirm the polyline that was actually drawn.

The experiment ran on 2026-11-16 from the local checkout on branch `feature/google-routes-live-validation`. Counts, labels, and screenshots are in `docs/REAL_ROUTES_EXPERIMENT.md` and `docs/PHASE4_TEST_RESULTS.md`. Six `computeRoutes` calls and two Maps JavaScript loads were made. The default unit and browser suites do not make those calls.

**CONDITIONAL GO** for assisted reconstruction of a new Routes API itinerary.

The direct Santos–Montevideo request returned three real alternatives. They rendered on a Google map. A Chuí waypoint and a Jaguarão waypoint each produced one route that passed within a few tens of meters of the requested coordinate. Confirmation was stored only after the selected polyline was on the map, and adding a waypoint cleared it. The original shared selection is still absent from the URL. A second direct request did not return the same three alternatives. Durations do not match the traffic-aware times in the earlier Maps screenshot, because these requests were `TRAFFIC_UNAWARE`. Exact road fidelity against the screenshot remains **UNVERIFIED**.
