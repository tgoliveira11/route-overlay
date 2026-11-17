# RouteOverlay

Local proof of concept for importing a Google Maps directions URL and checking whether the route that was selected can be reconstructed.

This repository was first edited in a Cursor Cloud Agent on Linux. A Cloud Agent runs on another machine. A server started there is not `localhost` on the computer where you open this project. Run the app from a local checkout. Open that checkout in the local editor when an agent must run on your computer.

The feasibility decision and the real-URL evidence are in `docs/FEASIBILITY.md` and `docs/REAL-URL-EVIDENCE.md`. Faithful recovery of the selected roads is a no-go. Recovering the stop list from a full directions URL is supported for the captured links.

The app parses the link on your machine, shows the recovered origin, destination, and waypoints, and runs a clearly labeled mock reconstruction. The Google Routes API client is implemented and disabled by default. No database and no hosted deployment are required.

## Run it locally

Requirements: Node.js 22 and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

On Windows, from the project directory:

```bat
npm install
npm run dev
```

Then open the same URL. Run the commands from the project directory. `dev` and `start` bind to 127.0.0.1 on port 3000.

The feasibility write-up is at [http://localhost:3000/report](http://localhost:3000/report) and in `docs/FEASIBILITY.md`.

The assisted confirmation flow is at [http://localhost:3000/plan](http://localhost:3000/plan). It does not replace the diagnostic console. Phase 3 notes are in `docs/ASSISTED_ROUTE_CONFIRMATION.md`, `docs/USER_FRICTION_ANALYSIS.md`, `docs/SECURITY_AUDIT.md`, and `docs/PHASE3_TEST_RESULTS.md`.

## Use the console

1. Paste a Google Maps directions URL, or choose a local sample.
2. Press **Parse URL**.
3. Read the stops and the recoverability table.
4. Press **Run mock reconstruction**.
5. Read the fidelity panel. For a normal share link it says the originally selected route was not preserved.

Full directions URLs are parsed offline. `maps.app.goo.gl` and `goo.gl/maps` links are expanded with manual HTTPS redirects. Each target is checked against an exact Google Maps hostname list, and private or local addresses are not requested. Uncheck **Expand short links** to skip that request.

## Assisted confirmation

Open `/plan` and paste a directions URL.

1. Import the URL. The page lists origin, destination, intermediate stops, preferences, what was recovered, and what is missing. The selected Maps alternative may be absent from the URL.
2. Reconstruct with mock fixtures. Those corridors are synthetic. The Google Routes button stays disabled until `ROUTE_OVERLAY_GOOGLE_API_ENABLED=true` and a key are both set.
3. Select a candidate, or add, remove, and reorder intermediate waypoints and press recalculate. Recalculation is explicit.
4. Confirm the candidate. That stores version 2 of the planning session in this browser only. A live candidate stays disabled until its polyline has been drawn on a Google map. Confirmation does not set independently verified fidelity.
5. After confirmation, generate a stop plan. The stations are labeled synthetic fixtures, not real businesses.

Routes that already contain intermediate waypoints do not receive invented alternatives. The [Routes API](https://developers.google.com/maps/documentation/routes/compute_route_directions) does not return alternatives in that case, and this app does not pretend that it does.

Live Routes geometry is not drawn on the schematic. Drawing Google route content on a non-Google basemap is outside the [Routes API policies](https://developers.google.com/maps/documentation/routes/policies). When the Maps JavaScript display is enabled, the same polylines are drawn on a Google map. Switching candidates restyles that map and does not send another Routes request. Compare the roads with the original Google Maps URL. Phase 4 evidence is in `docs/REAL_ROUTES_EXPERIMENT.md`.

## Optional Google Routes API

Create `.env.local` from `.env.example` and set:

```bash
ROUTE_OVERLAY_GOOGLE_API_ENABLED=true
GOOGLE_ROUTES_API_KEY=your-key
```

Restart `npm run dev`. The Routes key stays on the server. The Maps JavaScript key is a separate browser key and is the only key `/api/routes/status` may return. Mock mode remains available and is still labeled mock. A live result is a new route computed from the recovered stops, not a replay of the shared selection. The local process stops at 20 Routes calls and 30 map loads. `npm run test:live` does nothing unless `ROUTE_OVERLAY_LIVE_EXPERIMENT=true`.

## Tests

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
```

`npm test` runs the unit and integration suites. End-to-end tests use Playwright against `http://127.0.0.1:3100` and start `npm run dev:e2e` themselves. That command is a cold Next.js dev server on the working tree. The tests do not attach to a server already listening on port 3000. `reuseExistingServer` is false, so a stale process on 3100 makes the run fail instead of testing the wrong build. A production check is separate: stop anything using `.next`, run `npm run build`, then `npm run start`.

Stop the dev server before `npm run build` and `npm run start`. Both commands use the `.next` directory, and a running dev server will replace the production output.

Drawing a live route on a Google map is a second, optional boundary. Leave `ROUTE_OVERLAY_GOOGLE_MAPS_JS_ENABLED` false and `GOOGLE_MAPS_JS_API_KEY` empty. Live confirmation stays blocked until that map is configured and reports ready.

```bash
npx playwright install chromium
```

Install the browser once before `npm run test:e2e`.

## What is intentionally absent

- No Vercel project, database, or other hosted service.
- No Google Routes or Maps JavaScript call unless the matching flag and key in `.env.example` are both set.
- No claim that mock geometry is a road route.
