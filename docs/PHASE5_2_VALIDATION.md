# Phase 5.2 — Focused validation and integration readiness

Review date: 2026-11-17.

Branch: `feature/anp-premium-station-coverage`.

HEAD remains `6c29fa36db2e383bfb796b5239897733a58c7a19`. This phase did not commit, push, merge, or change repository visibility.

Public GitHub visibility is an authorized product-owner decision. It is not a development blocker. Secrets, local environment files, restricted Google content, and personal contact details stay out of the repository.

## 1. What changed

- Phase 5.1 acceptance text now separates research feasibility, experimental integration, and operational fuel-stop readiness. Public visibility is no longer listed as a blocker.
- Confirmed geometry is stored per browser session. The session id is a UUID kept in `sessionStorage`. The server writes only `.route-overlay/confirmed-routes/<session-id>.json`.
- One session cannot address another session's file. An expired file, or a file whose revision id does not match the polyline, is deleted on load. The HTTP response does not return the polyline.
- The coverage diagnostic asks only the current session for a confirmed revision. If that revision is missing, the historical cached-default counts stay on screen and are labeled as historical. They are not presented as the confirmed revision.
- The coverage page states that the view is an experimental diagnostic, not a fuel-stop recommendation.

## 2. Route persistence and session isolation

| Check | Result |
| --- | --- |
| Revision identity | SHA-256 of the encoded polyline. The provider routing revision stays a separate field. |
| Google versus mock | Only `google_routes_api` with `synthetic: false` can feed a confirmed count. |
| Route selection | `selectAnalysisGeometry("confirmed_google")` returns `unavailable` for a missing, expired, mock, or synthetic record. `labeled_default` does not attach the confirmed polyline. |
| Session isolation | A second session id reads `null` and does not see the first file. Tested with two UUIDs in one temporary directory. |
| Expiration | A file whose `expiresAt` is at or before the load time is deleted. A neighboring session file remains. |
| Google content | The polyline stays in the gitignored session file and in browser storage. API JSON for storage and for coverage counts omits it. |
| Disclosure | Integration responses were asserted not to contain the fixture polyline. |

Playwright uses `.route-overlay/e2e-confirmed-routes`, so a browser test does not write into the developer's session directory.

## 3. Confirmed versus cached route comparison

No real Google confirmation is stored on this machine. The Phase 4 browser confirmation was not found in `.route-overlay`. A new `computeRoutes` call would create a new route, not that lost revision, so no paid Routes call was made.

| Screen | Cached default, historical | Confirmed revision |
| --- | --- | --- |
| Premium within 2 km | 82 | Unavailable |
| Premium from 2 to 5 km | 42 | Unavailable |
| Cached default substituted | No | The confirmed slot stays empty |

The comparison code was tested offline. A fixture polyline that reaches the Jaguarão reference counted 1 nearby premium fixture and left the historical 82 untouched. A second session received `unavailable` and a null confirmed count.

## 4. Validation of the 14 stations

Sources used: the stored ANP product text, public company-registry mirrors derived from the federal CNPJ database, the operator's own public unit sheet for SIM, the station site for Posto 4 Irmãos, and the operator site for Pelanda. No new Google Places search was made. No restricted endpoint was scraped. Hours and product claims below are not stock and not proof that the station is open now.

Personal telephone numbers and personal email addresses from those pages are omitted here.

| Station | Identity | Premium product | Location | Hours | Podium | Uncertainty |
| --- | --- | --- | --- | --- | --- | --- |
| Oceano Atlântico, 73032088000105 | Registry name and Santos fuel-retail activity match the ANP record. Address on registry mirrors is Avenida Washington Luís, 224. | ANP: GASOLINA C PREMIUM. | ANP coordinate still says "não validada". Secondary directories disagree with each other on hours and were not used as coordinates. | Unverified. Two secondary pages give different schedules. | Phase 5 public Petrobras locator matched the address. Not rechecked with a new Places call. | Places decision remains `MATCH_REVIEW_REQUIRED`. |
| Estevez / Mar Azul, 58190083000109 | Registry mirrors show an active fuel retailer, trade name Auto Posto Mar Azul, Rua Professor Aristides de Menezes, 36, Santos. | ANP: GASOLINA C PREMIUM ADITIVADA. No public premium claim found in this pass. | ANP coordinate unvalidated. The registry address is in Ponta da Praia, about 4.3 km from the cached route. | Unverified. | None found. | Places `MATCH_CONFIRMED` still has no stored distance. |
| Posto 4 Irmãos, 46209847000181 | Registry mirrors and the station site place an active fuel retailer on BR-116 at km 467, Jacupiranga. The site also lists a southbound point at km 468. | ANP: GASOLINA C PREMIUM. A Shell locator page lists diesel products, not premium gasoline. | ANP coordinate unvalidated. The municipality file is one of the 14 reduced copies. | Unverified. | None found. Shell branding is not Podium. | Official ANP page total for this reduced file remains unverified. |
| Pelanda, 78901915001722 | Registry mirrors show an active branch opened 2025-05-07 on Régis Bittencourt, km 68, Campina Grande do Sul. The operator site describes the same site. | ANP: GASOLINA C PREMIUM. The operator page does not name that grade. | ANP coordinate unvalidated. | Unverified. | None found. | Places decision remains `MATCH_REVIEW_REQUIRED`. |
| J.R.F.M., 21385122000113 | Public registry page was not retrieved in this pass. | ANP: GASOLINA C PREMIUM. | ANP coordinate unvalidated. | Unverified. | None found. | Identity beyond the stored ANP row is unverified. |
| Almirante, 11393320001147 | Public registry page was not retrieved in this pass. | ANP: GASOLINA C PREMIUM ADITIVADA. | ANP coordinate unvalidated. Straight-line distance is 3.9 km. | Unverified. | None found. | Identity beyond the stored ANP row is unverified. |
| Barão, 75176859000317 | Registry mirrors agree the branch is an active fuel retailer in São José dos Pinhais. They do not agree on the street: one lists Rua Izabel a Redentora, 1200, and another lists a different street. | ANP: GASOLINA C PREMIUM ADITIVADA. | ANP coordinate unvalidated. Address conflict is unresolved. | Unverified. | None found. | Places `MATCH_CONFIRMED` has no stored distance. |
| Valência, 11127350000130 | Registry mirrors show an active fuel retailer, trade name Rede de Postos Poffo, Rua Tenente Antônio João, 897, Joinville. | ANP: GASOLINA C PREMIUM ADITIVADA. | ANP coordinate unvalidated. | Unverified. | None found. | Places `MATCH_CONFIRMED` has no stored distance. |
| SIM Araquari, 07473735015880 | The operator's public unit sheet names this CNPJ as SIM Araquari BR-101 Sul, Rainha. ANP distributor text is SIM DISTRIBUIDOR. The sheet's brand column says PETRONAS. | ANP: GASOLINA C PREMIUM. The same operator row lists GASOLINA PREMIUM among fuels. | ANP coordinate unvalidated. The sheet publishes its own coordinate, which was not copied into the repository. | Operator sheet says 24-hour service. That is an advertisement, not an observed open status. | The same row includes the words "Gasolina podium" in the services text. ANP product text has no PODIUM string. | Operator advertising is not stock. |
| Rosa Ester, 35274726000105 | Registry mirrors show an active fuel retailer, trade name Rosa, Avenida do Estado Dalmo Vieira, 5000, Balneário Camboriú. | ANP: GASOLINA C PREMIUM ADITIVADA. | ANP coordinate unvalidated. | Unverified. | None found. ANP brand is BANDEIRA BRANCA. | White-flag brand is not a fuel grade. |
| Engenho Velho, 02670376000139 | Registry mirrors show an active fuel retailer, trade name Posto Charão, Avenida Castelo Branco, 1051, Torres. | ANP: GASOLINA C PREMIUM. | ANP coordinate unvalidated. | Unverified. | None found. | Places `MATCH_CONFIRMED` has no stored distance. |
| SIM Gravataí, 07473735006970 | The operator sheet names this CNPJ as SIM Gravataí Freeway, BR-290 km 69, and brand PETROBRAS. ANP distributor text is VIBRA. The legal name is SIM Rede de Postos. | ANP: GASOLINA C PREMIUM ADITIVADA. The operator row lists GASOLINA PREMIUM among fuels. | ANP coordinate unvalidated. | Operator sheet says 24-hour service. | The Gravataí row does not include a Podium label. | The name/brand difference is explained by operator versus distributor. It is still not stock. |
| Thiesen, 32157668000133 | Public registry page was not retrieved in this pass. | ANP: GASOLINA C PREMIUM ADITIVADA. | ANP coordinate unvalidated. | Unverified. | None found. | Identity beyond the stored ANP row is unverified. |
| Irmãos Cortez, 92193200000126 | The federal transparency portal and registry mirrors show an active fuel retailer, trade name Posto Cortez, Avenida Duque de Caxias, 1152, Pelotas. The company site shows the same address. | ANP: GASOLINA C PREMIUM ADITIVADA. The company site does not name that grade. | ANP coordinate unvalidated. This is the last premium station before the second gap. | Unverified. | None found. | No Places sample. |

## 5. Actual external API usage

| Call | Count |
| --- | --- |
| Places | 0 |
| `computeRoutes` | 0 |
| Map loads caused by this phase | 0 |

Phase 4 budget file remains 7 Routes calls and 4 map loads. Phase 5 budget file remains 24 Places requests, 0 additional Routes requests, and 1 map load. Public web search was used for the station review. It is not a Google Maps Platform call.

## 6. Updated confidence

| Subject | Classification |
| --- | --- |
| Explicit ANP premium text for the 14 records | Unchanged. The stored product string is the evidence. |
| Legal identity for 11 of 14 CNPJs | Partially corroborated by public registry mirrors. Three CNPJs were not retrieved in this pass. |
| ANP coordinates | Still unvalidated by ANP's own text. |
| Operating hours | Verified only as operator advertisements for the two SIM rows. Every other candidate is unverified. Conflicting secondary schedules were not promoted. |
| Podium | Operator text exists for SIM Araquari only. It is not an ANP product string and it is not stock. |
| Confirmed-route band counts | Unavailable. |
| Fuel in stock or a station being open now | Unknown. This phase does not infer either. |

## 7. Test results

Paid requests stayed disabled.

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, no warnings |
| `npm run test:unit` | 112 passed |
| `npm run test:integration` | 22 passed |
| `npm run test:e2e` | 20 passed, 1 skipped |
| `npm run build` | Passed |
| `npm audit --omit=dev` | 0 vulnerabilities |

## 8. Remaining technical risks

- The browser-confirmed Phase 4 polyline is still absent. Confirmed 2 km and 5 km counts cannot be compared with the historical 82 and 42.
- Fourteen São Paulo API files are reduced copies. Posto 4 Irmãos depends on one of them.
- ANP coordinates in this extract remain unvalidated.
- Places distances were not retained.
- Hours are missing or only operator-advertised.
- SIGAF text is empty, so interdiction status is unknown.
- São Paulo outside the 19 retrieved municipalities is unknown.
- Successful ANP HTTP status lines were not retained.
- Session isolation is per browser tab through `sessionStorage`, and only on a direct loopback request. The UUID separates files. It is not authentication and it is not a multi-user security boundary. A proxied or public host receives HTTP 403 before any session file is read or written. `npm run dev`, `npm run dev:e2e`, and `npm run start` bind `127.0.0.1`. That bind is required. The Host allowlist is not sufficient on its own, because a process listening on another interface could be reached with a spoofed Host header.

## 9. Research feasibility verdict

**CONDITIONAL GO.** The stored ANP extract still identifies explicit premium authorizations in the selected municipalities. This phase did not upgrade that finding.

## 10. Experimental integration readiness verdict

**GO** for this experimental diagnostic on the loopback deployment model. The coverage page is labeled as research, missing confirmed geometry fails closed, and the confirmed-route endpoints reject any host other than a direct loopback request. This is not a multi-user authentication boundary.

## 11. Production recommendation readiness verdict

**NO-GO.** The 14 candidates are not a fuel-stop recommendation. Coordinates, hours, stock, and the confirmed route revision are not trusted enough for an operational stop list.

## 12. Commit boundaries and pull request

Do not merge this branch as a production fuel-stop feature. The owner authorized merging the experimental diagnostic while that operational verdict stays NO-GO.

Commits:

1. `feat: add experimental ANP premium coverage analysis`
2. `fix: isolate confirmed route persistence by session`
3. `test: validate premium station coverage and data quality`

One pull request carries those commits. The title says the coverage view is experimental. The description repeats the three verdicts above and states that no paid call runs by default.

| Action | Ready |
| --- | --- |
| Commit, push, and open a pull request | Yes, for the experimental diagnostic |
| Merge the experimental diagnostic to `main` | Yes, when the suite passes, no secrets are published, and the loopback bind remains |
| Enable operational fuel-stop recommendations | No |
