# Google Cloud configuration

Checked on 2026-11-16 with the authenticated `gcloud` CLI against project `tgoliveira11`. The project is active. The signed-in account can administer it. Billing was already enabled on the open billing account linked to the project. A separately named closed billing account was left closed. No payment method was added.

This file does not record key values, billing account identifiers, machine names, or local filesystem paths.

## Services

`routes.googleapis.com` and `maps-backend.googleapis.com` were already enabled. This phase did not enable them again and did not enable Places, Geocoding, the legacy Directions API, Distance Matrix, Roads, or the Navigation SDK.

The project already had other services enabled, including Geocoding, Roads, and Static Maps, plus services outside Maps. Those services were not disabled, not reconfigured, and not called by RouteOverlay. `billingbudgets.googleapis.com` was enabled only so the two budget alerts below could be created. It is not a Maps product.

Project-wide quotas were not changed. A lower quota could affect the other consumers of this project.

## Keys

Two new keys were created. An existing key named "Maps Platform API Key" and an existing OAuth client were not modified or reused.

| Display name | Used by | API restriction | Application restriction |
| --- | --- | --- | --- |
| `route-overlay-routes-local` | Next.js server, environment variable `GOOGLE_ROUTES_API_KEY` | Routes API only | None. A stable public egress address was not available, and a localhost or private address is not a valid Google server restriction. |
| `route-overlay-maps-js-local` | Browser map, environment variable `GOOGLE_MAPS_JS_API_KEY` | Maps JavaScript API only | HTTP referrers `http://127.0.0.1:3000/*` and `http://localhost:3000/*` only |

The server key is not placed in a `NEXT_PUBLIC_` variable, not returned by `/api/routes/status`, and redacted if it appears in a Routes response body. The browser key is returned by that status route only when `ROUTE_OVERLAY_GOOGLE_MAPS_JS_ENABLED=true` and the key is non-empty. Both values live in the gitignored local environment. The committed `.env.example` keeps the flags false and the values empty.

The missing server IP allowlist is a real limitation. API restriction and the application cap below are the controls that are actually in place.

## Cost controls

Requests use `TRAFFIC_UNAWARE`, do not ask for waypoint optimization, and do not request alternatives when intermediate waypoints are present. The field mask asks for distance, duration, the encoded polyline, description, route labels, and warnings.

| Control | What it does | What it does not do |
| --- | --- | --- |
| Budget `route-overlay-alert-brl-1` | Alert at 1 BRL of filtered project spend in a calendar month | It does not stop requests. |
| Budget `route-overlay-alert-brl-5` | Alert at 5 BRL on the same filter | It does not stop requests. |
| Local cap | Refuses the 21st `computeRoutes` call and the 31st intentional map load before the provider request | It is not a Google quota. |

The billing account currency is BRL. A budget amount in USD was rejected, so the alerts use the account currency at the same numeric thresholds. They apply to this project only.

The default test suites cannot spend these products. Playwright starts with both flags false and both keys empty unless `ROUTE_OVERLAY_LIVE_EXPERIMENT=true`. The default Vitest include does not contain `tests/live`.

## Observed usage

The experiment log counted 6 `computeRoutes` calls and 2 Maps JavaScript map loads. No other paid Google API was called. The billing invoice was not read after those calls, so this file does not state a currency amount. The expected products are Routes Compute Routes Essentials and one Dynamic Map per map construction. Candidate switches did not construct another map.
