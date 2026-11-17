# Phase 5.1 — Final acceptance review

Review date: 2026-11-17.

Branch: `feature/anp-premium-station-coverage`.

HEAD: `6c29fa36db2e383bfb796b5239897733a58c7a19`, the same commit as `origin/main`.

## Verdict

Three decisions are separate. Public repository visibility is an authorized product-owner choice and is not a blocker.

| Decision | Verdict |
| --- | --- |
| Research feasibility | **CONDITIONAL GO**. The stored ANP extract can identify explicit premium-gasoline authorizations inside the selected Brazilian municipalities. |
| Experimental integration | Not decided in this 5.1 review. See `docs/PHASE5_2_VALIDATION.md`. |
| Operational fuel-stop recommendations | **NO-GO** until coordinates, hours, stock, and the confirmed route revision can be trusted. These counts are not evidence that a station is open or has premium gasoline in stock. |

## Technical acceptance status

The Phase 5 and Phase 5.1 code is internally consistent and the offline test suite passes. Operational use remains blocked by the unverified HTTP retrieval, fourteen transformed São Paulo files, unvalidated ANP coordinates, and the absence of the browser-confirmed route geometry. Public GitHub visibility is intentional and is not one of those blockers.

No commit, push, merge, deploy, or visibility change was made. No paid API was called.

## Reproducibility findings

| Result | Status |
| --- | --- |
| National CSV row count 45,848, byte size, and SHA-256 | Reproducible from the local CSV artifact |
| 2,472 registered records and 2,472 API records in the 137 selected municipalities | Reproducible from the local CSV, the 22 stored JSON files, and the seat list |
| 294 explicit premium records, 289 with coordinates, 82 within 2 km, 42 between 2 and 5 km | Reproducible from those stored files and the cached polyline |
| State, brand, gap, and Places decision totals | Reproducible from the stored artifacts. See `data/phase5-1-reproducibility.json` |
| Pagination inside each stored file (`data.length` equals `totalRegistro`, one page) | Partially verified. This checks the stored JSON. It does not prove the official server total |
| Paraná 2,961, Santa Catarina 2,096, Rio Grande do Sul 3,136, and the five larger São Paulo files that still contain tank capacity | Partially verified stored responses |
| Fourteen reduced São Paulo files, including 10 of the 294 premium records | Partially verified. Official page totals are unverified |
| HTTP status and upstream retrieval time of the successful API responses | Unverified. File modification times are local write times, not HTTP retrieval timestamps |
| São Paulo outside the 19 retrieved municipalities | Unverified |
| 26 premium records in PR, SC, and RS outside the seat set with no usable coordinate | Present in the stored state pages and not projected |
| Additional geolocated premium stations within 5 km in those three states, outside the seat set | Reproducible from the stored pages: 0 |
| Places coordinate disagreement | Unverified. Candidate coordinates were not retained |
| Direct re-download from the ANP API | Not repeated. A local direct request remains blocked by Cloudflare. No bypass was attempted |

The published `generatedAt` value `2026-11-17T14:40:00.000Z` is a hardcoded label. The published CSV timestamp `2026-11-17T14:20:06-03:00` reuses the file-clock digits and applies a `-03:00` offset. The CSV file mtime is `2026-11-17T14:20:06.476Z`. Those strings were left unchanged.

## Route persistence findings

Confirmation used to live only in browser `localStorage`. The Phase 5 analysis read the cached `google-1` summary, so the browser-confirmed polyline was never written. That polyline is still not on disk. Recovering it would require a new Routes call, which was not made.

The local store now does the following:

- The revision id is the SHA-256 of the encoded polyline. The provider `routingRevision` stays a separate field.
- `source: "google_routes_api"` with `synthetic: false` is the only record `selectAnalysisGeometry("confirmed_google")` accepts.
- A mock, a synthetic record, a missing file, or an expired file returns `unavailable`. The cached default is returned only when the caller asks for `labeled_default`, and that choice does not attach the confirmed polyline.
- Playwright writes `.route-overlay/e2e-confirmed-route.json`. The application default is `.route-overlay/confirmed-route.json`. A test confirmed that deleting one file leaves the other in place.
- Two browser sessions on the same server path still share one file. Isolation is by file path, not by browser profile.
- `loadConfirmedRoute` deletes a file whose `expiresAt` is at or before the load time, and it deletes a file whose revision id does not match the polyline. A missing file is left untouched.
- The confirmation POST loads the current path before handling the body, so an expired file is removed even when the new body is rejected.
- The POST response returns `stored`, `revisionId`, `expiresAt`, `source`, and `synthetic`. It does not return the polyline.
- The polyline remains in the gitignored local file and in browser storage until expiry or replacement. The coverage study still uses `cached_google_default_route` and does not read this file.

Offline fixtures cover a valid Google record, a mock record, expiry, a bad revision id, path isolation, and a response that does not echo the polyline.

A live confirmation was not run. If the owner later authorizes one, the bounded test is a single explicit confirmation of one already computed route, or one new `computeRoutes` call when no confirmed polyline is available. The Phase 4 budget file currently shows 7 `computeRoutes` calls of 20 and 4 map loads of 30. The Phase 5 budget shows 24 Places requests of 25, 0 additional Routes calls of 5, and 1 map load of 5. One new `computeRoutes` call would consume one additional Routes request. Opening the map would consume one map load. No Places request is required for that test.

## Geographic limitations

The municipality set is a seat screen, not a boundary intersection. The distance is a straight-line projection onto the cached default polyline, not a driving detour.

Measured on the stored PR, SC, and RS pages: no additional geolocated premium station outside the selected municipalities falls within 5 km. Twenty-six premium records in those states have no usable coordinate. São Paulo outside 19 municipalities is unknown. Uruguay is outside ANP coverage. Two gaps remain, about 117 km and about 130 km, where no premium station in the analyzed set is inside 5 km. The second gap runs to the Jaguarão end of the Brazilian clip, so there is no later Brazilian station after it in this screen.

## Data quality shortlist

These 14 records are explicit ANP premium authorizations inside the 0–2 km or 2–5 km screen of the cached route. They are candidates for a later validation sample. The list does not say that a station is open or that premium gasoline is in stock. Every coordinate below comes from the ANP API text, and every validation string says the position was not validated. `SIGAF` text in this corridor population is empty, so interdiction status is unknown.

| Progress | Band and straight-line distance | Brand | Station | ANP product | Why it was selected | Uncertainty and evidence still needed |
| --- | --- | --- | --- | --- | --- | --- |
| 0 km, Santos/SP | 0–2 km, 606 m | VIBRA | AUTO POSTO OCEANO ATLANTICO LTDA, CNPJ 73032088000105 | GASOLINA C PREMIUM | Start of the clip | Places decision `MATCH_REVIEW_REQUIRED`. Phase 5 matched the address on the public Petrobras locator. A retained coordinate comparison is still absent |
| 0 km, Santos/SP | 2–5 km, 4,309 m | VIBRA | ESTEVEZ & ESTEVEZ COMERCIO E SERVICOS AUTOMOTIVOS LTDA, CNPJ 58190083000109 | GASOLINA C PREMIUM ADITIVADA | Same progress as the start | Places `MATCH_CONFIRMED` without a stored distance. The straight-line distance is near the 5 km edge |
| 218 km, Jacupiranga/SP | 0–2 km, 105 m | RAIZEN | POSTO 4 IRMAOS JL LTDA, CNPJ 46209847000181 | GASOLINA C PREMIUM | Last premium station before the first gap | The Jacupiranga file is one of the 14 reduced copies. The official page total is unverified |
| 384 km, Campina Grande do Sul/PR | 0–2 km, 32 m | IPIRANGA | POSTOS PELANDA COMBUSTIVEIS LTDA, CNPJ 78901915001722 | GASOLINA C PREMIUM | First premium station after the first gap | Places `MATCH_REVIEW_REQUIRED`. Identity remains ambiguous |
| 411 km, São José dos Pinhais/PR | 0–2 km, 1,028 m | VIBRA | J.R.F.M. COMERCIO DE COMBUSTIVEIS E LUBRIFICANTES LTDA, CNPJ 21385122000113 | GASOLINA C PREMIUM | Paraná segment after the serra | No Places sample. Coordinate is unvalidated |
| 411 km, São José dos Pinhais/PR | 2–5 km, 3,923 m | IPIRANGA | AUTO POSTO ALMIRANTE LTDA, CNPJ 11393320001147 | GASOLINA C PREMIUM ADITIVADA | Same segment, outer band | No Places sample. Straight-line distance is not a driving detour |
| 418 km, São José dos Pinhais/PR | 2–5 km, 4,162 m | RAIZEN | AUTO POSTO E MECANICA BARAO LTDA, CNPJ 75176859000317 | GASOLINA C PREMIUM ADITIVADA | Same segment | Places `MATCH_CONFIRMED` without a stored distance |
| 524 km, Joinville/SC | 2–5 km, 4,623 m | RAIZEN MIME | POSTO DE COMBUSTIVEIS VALENCIA LTDA, CNPJ 11127350000130 | GASOLINA C PREMIUM ADITIVADA | Santa Catarina coast | Places `MATCH_CONFIRMED` without a stored distance |
| 557 km, Araquari/SC | 0–2 km, 103 m | SIM DISTRIBUIDOR | SIM REDE DE POSTOS LTDA, CNPJ 07473735015880 | GASOLINA C PREMIUM | Coast, close to the polyline | Places `MATCH_CONFIRMED`. Brand text is the distributor name, not a Podium claim |
| 619 km, Balneário Camboriú/SC | 0–2 km, 139 m | BANDEIRA BRANCA | ROSA ESTER AUTO POSTO LTDA, CNPJ 35274726000105 | GASOLINA C PREMIUM ADITIVADA | Unbranded distributor | No Places sample. White-flag brand is not an independent quality grade |
| 954 km, Torres/RS | 2–5 km, 2,961 m | CHARRUA | ABASTECEDORA DE COMBUSTIVEIS ENGENHO VELHO LTDA, CNPJ 02670376000139 | GASOLINA C PREMIUM | Northern Rio Grande do Sul | Places `MATCH_CONFIRMED` without a stored distance |
| 1,108 km, Gravataí/RS | 0–2 km, 87 m | VIBRA | SIM REDE DE POSTOS LTDA, CNPJ 07473735006970 | GASOLINA C PREMIUM ADITIVADA | Porto Alegre approach | No Places sample. The legal name and the ANP distributor brand differ; identity needs a source check |
| 1,121 km, Cachoeirinha/RS | 2–5 km, 2,503 m | VIBRA | COMERCIAL DE COMBUSTIVEIS THIESEN LTDA, CNPJ 32157668000133 | GASOLINA C PREMIUM ADITIVADA | Same metropolitan segment, outer band | No Places sample |
| 1,386 km, Pelotas/RS | 0–2 km, 1,405 m | VIBRA | IRMAOS CORTEZ LTDA, CNPJ 92193200000126 | GASOLINA C PREMIUM ADITIVADA | Last premium station before the second gap | No Places sample. The gap continues to the end of the Brazilian clip |

The selector is `scripts/phase5-1-shortlist.ts`. It reads only the local observation file and the retained Places decisions.

## Security and privacy findings

GitHub visibility on 2026-11-17: **PUBLIC** (`isPrivate: false`). Visibility was not changed.

Committed history at HEAD has two commits, `e204eff` and `6c29fa3`. A search of that tree found no API key, private key, billing-account identifier, email address, or local filesystem path. `docs/GOOGLE_CLOUD_CONFIGURATION.md` names the public project `tgoliveira11`, key display names, and budget display names. It states that key values and billing-account identifiers were omitted. Those names are already on the public default branch.

Pending Phase 5 and Phase 5.1 files are uncommitted. The tracked-to-be summary contains public ANP aggregates, ANP coordinates rounded to six decimals, and the Google route description, distance, duration, and point count. It does not contain an encoded polyline, a Places response, a place ID, or an API key. `.env.local`, `LOCAL.md`, and `.route-overlay/` are ignored. The confirmed-route files, the ANP source files, and the Places sample stay in that ignored directory.

The public repository means a later commit of this branch would publish the research summary. That decision belongs to the owner.

## Test results

Paid external requests stayed disabled. Playwright forces Places off and an empty Places key. The real-provider smoke stayed skipped.

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, no warnings |
| `npm run test:unit` | 110 passed |
| `npm run test:integration` | 20 passed |
| `npm run test:e2e` | 20 passed, 1 skipped |
| `npm run build` | Passed, Next.js 15.5.29 |
| `npm audit --omit=dev` | 0 vulnerabilities |

## Remaining blockers

- The browser-confirmed polyline is not stored. The published counts use the cached default, fidelity UNVERIFIED.
- Successful ANP API HTTP status lines and upstream retrieval times were not retained.
- Fourteen São Paulo responses are reduced copies. Ten premium records depend on them.
- São Paulo outside the 19 retrieved municipalities is unknown.
- ANP coordinates in this extract are unvalidated by ANP's own text.
- Places distances were not retained, so coordinate disagreement is unknown.
- Opening hours for 20 of 24 sample stations were not cross-checked.
- One local confirmation file is shared by every browser session that uses the same server path.
- Empty SIGAF text leaves interdiction status unknown.

## Proposed next experiment

Do not merge this branch.

The next experiment, only after the owner decides the repository visibility, is one explicit route confirmation that writes the local geometry file. Use the confirmation already held in a browser session if it is still available. That path spends no Routes call. If that polyline is gone, the authorized test is one `computeRoutes` request, one map load only if the map is opened, and no Places request. The current budgets leave room for that single Routes call and do not authorize a larger sample.

After a confirmed revision exists, repeat the 2 km and 5 km counts on that revision and label them separately from the cached-default counts. Keep the 14-station shortlist as the validation queue. Do not treat authorization text as stock or as an open business.
