# Development history

This file records the Windows restoration. It does not replace `docs/FEASIBILITY.md` or `docs/REAL-URL-EVIDENCE.md`.

## Source provenance

The application was originally implemented in a Cursor Cloud Agent on Linux. That environment was not this PC. The original source commit recorded for provenance is `c44e24d95acea9afa3e051a8e641a601bd8a23d3`.

The archive `route-overlay-source.zip` did not contain a `.git` directory. The original Git history is not in this repository. This Windows repository starts with a new initial commit. No earlier commits were fabricated.

Verified archive:

- Archive name: `route-overlay-source.zip`. The absolute download path is not recorded here.
- Size: 2,034,062 bytes
- SHA-256: `a6f27afd8b8ea0ddd86e4018ac731c64fbb8e25f92089a9690a313a6a9d9addc`
- 55 project files, extracted directly into the project directory
- No path traversal, symbolic links, embedded secrets, or unexpected executables
- The only lockfile install scripts were the known `esbuild` and `fsevents` scripts

## Local migration

Restored on 2026-11-16 in a local Windows console session. The host name and the account name are omitted. The work ran in the local Cursor desktop terminal, not in a Cloud Agent.

The installed runtime was Node.js 24.19.0 and npm 11.17.0. It was left in place. Node.js 22 was preferred, but the system installation was not replaced. Dependencies were installed with `npm ci` from the archived `package-lock.json` (584 packages). npm reported that the `esbuild` postinstall script was not on the allow-scripts list. The Windows package `@esbuild/win32-x64` was installed, and `esbuild` 0.28.2 loaded successfully. Playwright Chromium was installed for the end-to-end tests.

`npm audit` reported 16 advisories in the locked tree, including PostCSS issues that npm would fix only by moving Next.js to 16, and Vitest/tinypool issues in the test tooling. Those upgrades were not applied. The lockfile from the archive was kept so the application behavior stayed on the reviewed dependency set.

## Windows compatibility

`dev` and `start` previously listened on `0.0.0.0`. Both now bind to `127.0.0.1` port 3000. Playwright still targets `http://127.0.0.1:3000`. The production server was checked with `Get-NetTCPConnection`: the listener address was `127.0.0.1` only.

## Security changes

Short-link expansion no longer uses automatic redirect following. Each request uses `redirect: "manual"`. Before a request is sent, the target must be HTTPS, must have no userinfo and no non-default port, and its hostname must be an exact member of the Google Maps host set. Prefix checks such as `startsWith("google.")` were removed, so names like `google.evil.com` are rejected. DNS answers are checked before the request. Loopback, private, link-local, and other non-global addresses are not fetched. At most five redirects are followed. The same host set is used when a pasted URL is classified, so offline parsing of `www.google.com` and `www.google.com.br` still works.

Tests in `tests/unit/expand-short-link.test.ts` record the injected fetch and show that unsafe redirect targets are never requested. Legitimate `maps.app.goo.gl` and `goo.gl/maps` expansion remains covered.

Google Routes stays disabled. `.env.local` sets `ROUTE_OVERLAY_GOOGLE_API_ENABLED=false` and leaves `GOOGLE_ROUTES_API_KEY` empty. That file is gitignored.

## Validation on this PC

Executed after the code changes, on Windows:

- `npm run typecheck`: passed
- `npm run lint`: passed
- `npm run test:unit`: 62 passed
- `npm run test:integration`: 9 passed
- `npm run test:e2e`: 5 passed against a local Next.js server
- `npm run build`: passed (Next.js 15.5.29)

The earlier Linux run reported 37 Vitest tests. That count is historical. The Windows total is 71 Vitest tests because the redirect guards added 34 unit tests. No existing test was removed or weakened.

Browser checks against `http://localhost:3000` used the production server:

- Home page loaded and reported that live Google calls are off.
- The three-stop Santos, Montevideo, Porto Alegre URL from `docs/REAL-URL-EVIDENCE.md` was pasted and parsed. Origin Santos, waypoint Montevideo, and destination Porto Alegre were recovered with coordinates.
- Mock reconstruction was labeled `MOCK`, showed `MOCK GEOMETRY`, and the fidelity verdict was `not_preserved`.
- `not a url` produced the absolute-URL error and cleared the stops.
- `/report` rendered Hypothesis H1 and Hypothesis H2.
- A 390px viewport parsed a sample and ran mock reconstruction without horizontal overflow.
- No unexpected console errors were captured during the desktop flow.
- `GET /api/routes/status` returned `liveAvailable: false`.

## Architectural decisions

- Parsing a full directions URL stays local. Only short-link expansion uses the network, and only after each hop is approved.
- Mock reconstruction remains the default and is visually distinct from a Google response.
- Fidelity does not treat a mock corridor, or a new Routes API computation, as the alternative that was selected in Maps.
- The research documents were not rewritten. The report page still shows the original feasibility text, including its description of the earlier redirect behavior. The current request policy is the one in `lib/route-overlay/redirect-policy.ts`.

## Current limitations

- The selected roads are still not present in a normal share URL. Faithful recovery remains a no-go, as recorded in `docs/FEASIBILITY.md`.
- A phone share-sheet `maps.app.goo.gl` link for Santos–Montevideo was not captured in the original evidence and was not invented here.
- The hostname allowlist is a static exact set. A Google country host that is missing from that set will fail closed instead of being fetched.
- No Google API key was created, and no paid Routes API call was made.
- No hosting project was created.
- Dependency advisories that require a Next.js 16 upgrade, or a broader Vitest upgrade, remain in the locked tree.

## Phase 3 — assisted confirmation

Implemented locally on 2026-11-16 on the same Windows host, on branch `feature/assisted-route-confirmation`. This section was written before any commit of that branch. The diagnostic console on `/` was kept.

Added `/plan`: import, mock or live reconstruction, candidate selection, waypoint refinement, explicit confirmation in `localStorage` version 1, and a synthetic fuel-stop prototype. `computeAlternativeRoutes` is sent only for driving or two-wheeler requests that have no intermediate waypoints, matching the [Routes API directions contract](https://developers.google.com/maps/documentation/routes/compute_route_directions). Live polylines are not drawn on the SVG schematic.

The dependency lockfile changed in this phase. `npm audit fix` without `--force` moved Vitest from 3.2.4 to 3.2.7 and `@typescript-eslint/*` from 8.72.2 to 8.73.0, and moved one minimatch copy to 11.0.8. An override pins `postcss` to 8.5.33 so Next.js no longer installs PostCSS 8.4.31. A second override pins `@ts-morph/common`'s minimatch to 11.0.8. `shadcn` moved from `dependencies` to `devDependencies`. Next.js stayed on 15.5.29. Vitest was not upgraded to 5. The production audit after these changes reports zero findings. The full tree still reports the Vitest, tinypool, mocker, and deepmerge advisories. See `docs/SECURITY_AUDIT.md`.

No Google Routes request left this machine. No commit or push of this branch was made as part of the implementation.

## Phase 3.1 — correctness and acceptance hardening

Continued on the same uncommitted branch on 2026-11-16. No commit, push, merge, or deploy.

Confirmed defects and the corrections:

- Confirmation could pair a new waypoint list with the previous polyline. Each reconstruction now carries `routingRevision`. Draft edits invalidate candidates and confirmation. In-flight responses are dropped when the generation or the revision changed. The imported URL is preserved.
- Rebuilt Maps URLs dropped avoid flags, place IDs, and via semantics. Those recoverable constraints are written back into the `api=1` URL and, where the Routes API documents them, into `routeModifiers`. Constraints that cannot be sent are shown in the planner.
- Live Routes polylines were removed from the SVG and confirmation was still offered. Live confirmation is now blocked unless a separately configured Maps JavaScript map reports ready. The flag and key default to off. Mock confirmation remains on the schematic. No synthetic geometry stands in for a live route.
- A confirmed `localStorage` session survived another import and a failed import. The key is now `route-overlay.planning-session.v2`. A new import stores an unconfirmed session for that URL. A failed import deletes the session and clears the visible effort counters.
- The stop planner reset the fuel clock after a miss and could repeat a station. It now leaves an unresolved gap, refuses to mark that itinerary feasible, and labels detours as straight-line estimates.
- Playwright used `reuseExistingServer: true` on port 3000. The suite now starts `npm run dev:e2e` on `127.0.0.1:3100` with `reuseExistingServer: false`. The existing production listener on port 3000 was not stopped.

`npm audit` was read again and the lockfile was not changed by this pass. Production findings remain zero. The full tree still reports Vitest, tinypool, and `@vitest/mocker`. No paid Google API was called, and the Maps JavaScript display was not enabled.
