# User friction analysis

This file records how the assisted flow counts extra work after a Google Maps URL is imported. It is an engineering measurement. It is not a usability study, and it does not report results from human participants. No external analytics service is used.

## What is counted

The counters live in `lib/route-overlay/effort.ts` and are shown on `/plan`.

| Field | When it changes |
| --- | --- |
| Actions after import | Each reconstruction, candidate selection, waypoint add, move, remove, confirm, reset-after-confirm, and opening the original URL. |
| Candidates presented | Set from the candidate list of the latest reconstruction. |
| Immediately accepted | True only when confirmation completes with zero waypoints added and zero recalculations. Choosing the non-default candidate still counts as immediate acceptance. |
| Waypoints added | Incremented when a draft waypoint is accepted. |
| Recalculations | Incremented when the user presses recalculate. The first reconstruction is an action and is not a recalculation. |
| Confirmation time | Milliseconds from the first reconstruction in the session to the confirm action, using the browser clock. It is stored on the session and is not displayed as a study result. |
| Outcome | `in_progress`, `completed`, or `abandoned`. Abandonment is recorded in memory when a confirmed session is reset. |

## Provisional bands

These bands are thresholds for the prototype. They were not validated with users.

| Band | Rule |
| --- | --- |
| Low | Confirmation completed, no waypoint added, no recalculation. |
| Moderate | Confirmation completed, at most two waypoints added, and at most two recalculations. |
| High | The session was not completed, it was abandoned, or the edit exceeded the moderate limits. |

## What the automated sessions showed

Playwright drove the page. Those runs are scripted actors.

- Import of the captured Santos–Montevideo URL, selection of the non-default mock candidate `mock-b`, and confirmation. The page text classified the session as low. No waypoint was added and no recalculation was pressed. Two mock candidates were presented. This does not mean the actor matched a Google Maps alternative. The second candidate is a synthetic bend.
- The same URL, then one typed waypoint `-33.6900, -53.4600` and one recalculation. The page then showed one candidate and the waypoint limitation. That script does not press confirm, so the outcome stays in progress and the band function would still return high until confirmation. The unit test of the band function returns moderate for a completed session with one added waypoint and one recalculation.
- Scenario B, a fixture that already contains Chuí, reconstructs to a single fallback candidate. The non-default mock id is absent. The extra work is understanding that alternatives were not returned, not picking among several real corridors.
- A session that never confirms, including the unsupported place page, does not produce a planning baseline.

No clock time from a person was collected.

One local browser session, driven on the production server at `http://127.0.0.1:3000/plan`, stored these counters after selecting mock candidate B and confirming: 2 candidates presented, 3 actions after import, 0 waypoints added, 0 recalculations, `immediatelyAccepted` true, outcome completed, and 29034 ms between the reconstruction response and the confirm click. That duration is the agent driving the page, including scrolling. It is not a participant time. The on-screen band was low. Independently verified fidelity stayed false.

## Product reading

Low friction in this harness means the prototype can be completed without rebuilding the stop list when mock mode already offers more than one corridor. It does not measure whether those corridors look like the trip the person chose in Google Maps.

Moderate friction is the designed escape hatch: one or two geographic constraints, then a new calculation. High friction is the honest outcome when the URL is not a directions link, when the user resets after confirming, or when the itinerary needs more than two edits.

Because no live Routes alternatives were retrieved, the harness cannot say whether Google would have offered a corridor the user could accept immediately. That gap is why the product verdict is conditional.
