# Phase 5 — Premium gasoline station coverage and data quality

Verdict: **CONDITIONAL GO**

RouteOverlay can identify registered stations and explicit premium-gasoline authorizations for the selected Brazilian municipalities, and it can place most of those premium stations on a straight-line screen around the cached Google route. The same evidence is not sufficient for reliable fuel-stop planning. Coordinates are almost entirely unvalidated, opening hours were not cross-checked, Petrobras Podium is absent from ANP product text, two stretches longer than 100 km have no premium station inside 5 km, and the geometry is the cached Google default rather than the browser-confirmed revision. Uruguayan stations are outside ANP coverage.

This verdict is not a change to the Phase 4 route verdict or to the H1/H2 findings in `docs/FEASIBILITY.md`.

## 1. Executive summary

The research scope is the Brazilian portion of the cached Santos–Montevideo Google default route. One hundred thirty-seven municipalities were selected from municipal seats, not from cadastral boundaries. Inside those municipalities the official ANP CSV and the ANP revendedores API both contain 2,472 records. Two hundred ninety-four records explicitly authorize premium gasoline. Two hundred eighty-nine of those have usable coordinates. Eighty-two are within 2 km of the polyline and 42 are between 2 and 5 km. Five premium records have no coordinates.

A stratified Places sample of 24 stations returned 21 conservative identity confirmations, 3 reviews, and 20 structured opening-hour records. None of those hour records was cross-checked against an independent published schedule. ANP product text contains zero Podium strings. A bounded public Petrobras locator check confirmed Podium advertising, by address, for 4 premium Vibra stations. That sample does not estimate how many of the 157 premium Vibra stations advertise Podium.

## 2. Exact route analyzed

| Field | Value |
| --- | --- |
| Label | `cached_google_default_route` |
| Scenario / candidate | A / google-1 |
| Google description | BR-116, labeled DEFAULT_ROUTE |
| Full distance | 1,936,072 m |
| Full duration | 86,755 s |
| Polyline points | 11,869 |
| Confirmed geometry available | false |
| Fidelity | UNVERIFIED |
| Brazilian clip | 9,670 points, 1,518,359 m |
| Clip method | nearest vertex to the Phase 4 Jaguarão reference |
| Approach to that reference | 1,228 m, reliable at the 5 km threshold |
| Segments longer than 2,000 m | 18 |

The browser-confirmed polyline from Phase 4 was not persisted. No additional `computeRoutes` call was spent to recover it. Phase 5.1 adds a local confirmed-geometry file for future explicit confirmations and refuses to substitute this cached default when a confirmed Google route is required. This analysis still uses the cached default. Google’s label says BR-116. Sampled coordinates also follow the Santa Catarina coast before turning inland through Porto Alegre toward Jaguarão. The corridor was not relabeled.

Uruguay is excluded from the ANP proximity calculation. Missing ANP records there are not evidence that fuel stations are absent.

## 3. Dataset sources and retrieval times

### Source A — ANP open-data CSV

- Page: https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/dados-cadastrais-dos-revendedores-varejistas-de-combustiveis-automotivos
- File: https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/arquivos-dados-cadastrais-dos-revendedores-varejistas-de-combustiveis-automotivos/dados-cadastrais-revendedores-varejistas-combustiveis-automoveis.csv
- Publication label: page updated 17/11/2026 09:29; CSV link labeled updated 17/11/2026
- Retrieved locally: 2026-11-17T14:20:06-03:00
- Phase 5.1 chronology: that string reuses the filesystem clock digits and attaches `-03:00`. The CSV file mtime is 2026-11-17T14:20:06.476Z. The absolute instant implied by the published offset is 2026-11-17T17:20:06Z, 180 minutes later. The published string is retained as the historical claim and is classified OFFSET_MISLABEL. See `docs/PHASE5_1_DATA_QUALITY_AUDIT.md`.
- Bytes: 7,910,007
- SHA-256: `e89cfa0761dd3edb84b4c3bb9b2690c5d0a69f3be9d5d21f794888548bf0da64`
- Encoding: UTF-8, ASCII-compatible, CRLF
- Delimiter: semicolon
- Data rows: 45,848
- Columns: `CODIGOISIMP`, `AUTORIZACAO`, `DATAPUBLICACAO`, `RAZAOSOCIAL`, `CNPJ`, `ENDERECO`, `COMPLEMENTO`, `BAIRRO`, `CEP`, `UF`, `MUNICIPIO`, `BANDEIRA`, `DATAVINCULACAO`
- The CSV does not contain products, coordinates, or opening hours.

The file stays in gitignored `.route-overlay/anp/`.

### Source B — ANP revendedores API

- Documented endpoint: `https://revendedoresapi.anp.gov.br/v1/combustivel`
- Official description page: https://www.gov.br/anp/pt-br/centrais-de-conteudo/paineis-dinamicos-da-anp/paineis-dinamicos-do-abastecimento/painel-dinamico-de-relatorio-de-revenda
- Retrieval timestamp used for the analysis: 2026-11-17T14:40:00Z
- Phase 5.1 chronology: `2026-11-17T14:40:00Z` is a hardcoded label in the analysis script, not a measured run time. Local API files were written from 2026-11-17T14:32:09.911Z through 2026-11-17T14:45:30.619Z, and the observation file was written at 2026-11-17T14:45:57.201Z. HTTP `Date` headers were not stored, so the upstream retrieval instants are UNVERIFIED. The historical label is unchanged.
- Local curl, Node, and the IDE browser received HTTP 403 from Cloudflare. No bypass was attempted.
- The documented endpoint returned JSON through the research fetch path. Those payloads were stored under gitignored `.route-overlay/anp/api/`.
- Page size observed: 5,000. Pages retrieved: 22 (complete state pages for PR, SC, and RS, plus 19 São Paulo municipality files).
- Observed fields used: identity, address, distributor, product names, latitude, longitude, validation text, coordinate date, and SIGAF status.
- Five larger São Paulo responses were stored in full. Fourteen smaller São Paulo responses were reduced to the fields the parser reads. Each file’s `data.length` matched `totalRegistro`. Tank capacity and nozzle counts were not retained in the reduced copies and are not used in the metrics.

### Source C — Petrobras / Vibra public locator

- https://www.postospetrobras.com.br/buscar-postos
- Used on 2026-11-17 through the public filter “Gasolina Petrobras Podium” and the public search box.
- No undocumented API was called. Brand Vibra was not treated as Podium evidence.

### Source D — Google Places API (New)

- Endpoint: `POST https://places.googleapis.com/v1/places:searchText`
- SKU: Text Search Enterprise, because `regularOpeningHours` and `currentOpeningHours` were requested.
- Published price consulted before the calls: about USD 35 per 1,000 requests after a monthly cap of 1,000 free Text Search Enterprise requests.
- Field mask: `places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.regularOpeningHours,places.currentOpeningHours`
- Region code BR, page size 1, one request per station, no retry.
- Raw Google responses were not written to Git.

### Corridor municipality source

Municipal seats from an IBGE/Kelvins CSV, gitignored, were used only to choose which ANP queries to run. A municipality is in scope when its seat is the nearest southern-state seat (SP 35, PR 41, SC 42, RS 43) to a route sample every 5 km, or the seat is within 20 km of the polyline. This is not a boundary intersection. Result: 137 municipalities (SP 19, PR 13, SC 60, RS 45).

## 4. ANP CSV results

National population: 45,848 data rows.

Corridor-municipality population: 2,472 rows. The API returned the same 2,472 identities for the same municipality keys. Duplicate CNPJs in that population: 0. Identity confidence for the 294 premium records is HIGH because the CSV and API agree on CNPJ, municipality, state, and legal name, and the CNPJ checksum is valid.

## 5. ANP API availability

The API is documented and returned the expected JSON shape, including products and coordinates. It was not reachable from this local network: Cloudflare returned 403. The analysis uses the documented responses retrieved without a local bypass. SIGAF status was empty on every observed corridor record. Empty SIGAF is unknown interdiction status, not evidence that a station is clear.

## 6. Premium classification methodology

Original ANP product strings are preserved. Classification rules:

| Class | Rule |
| --- | --- |
| `PREMIUM_GASOLINE` | text contains gasoline and either premium or alta octanagem, including “GASOLINA C PREMIUM ADITIVADA” |
| `ADDITIVE_GASOLINE` | additive gasoline without a premium term |
| `REGULAR_GASOLINE` | common gasoline |
| `PODIUM_SPECIFIC` | the text itself says Podium |
| `UNKNOWN` | bare “GASOLINA” or “GASOLINA C”, or any ambiguous gasoline wording |
| `NOT_GASOLINE` | ethanol, diesel, or GNV with no gasoline term |

Observed premium strings were `GASOLINA C PREMIUM` and `GASOLINA C PREMIUM ADITIVADA`. No product string contained Podium. Additive common gasoline is not counted as premium. Authorized tank volume is not stock. Nothing in this phase infers current inventory.

## 7. Registered station count

Population, not a sample: 2,472 registered records in the 137 corridor municipalities, out of 45,848 national CSV rows.

## 8. Premium station count

Population: 294 records explicitly authorize premium gasoline. That is 11.9% of the corridor-municipality records.

## 9. Coordinate coverage

| Population | Count |
| --- | --- |
| Premium with usable coordinates | 289 |
| Premium without coordinates | 5 |
| Geolocated premium coordinates marked “Posição Geográfica não validada” | 289 of 289 |
| Premium location quality MEDIUM | 288 |
| Premium location quality LOW | 1 |
| Premium location quality MISSING | 5 |

HIGH location quality requires validation text that says the position was validated and does not say “não validada”. No premium record met that test. MEDIUM means a coordinate exists inside the accepted Brazil range but is unvalidated. LOW means the axes were swapped or the point is more than 80 km from the claimed municipal seat. The one LOW premium coordinate is in Criciúma and falls outside the 5 km band.

Example of a rejected coordinate, not counted as a corridor premium location: Auto Posto Portal do Vale, Itariri, CNPJ 20.966.937/0001-23, published coordinate near -22.778, -43.337, which is not Itariri.

Latitude/longitude order is checked by accepting a swapped pair only when the reversed pair is inside Brazil and the original pair is not. Empty coordinates stay missing. Straight-line distance is a screen, not a driving detour and not evidence of highway access.

Freshness uses `dataObtencao` against 2026-11-17: 365 days or newer is HIGH, 730 days or newer is MEDIUM, older is LOW, missing or future is UNKNOWN. Among the 294 premium records: HIGH 49, MEDIUM 33, LOW 207, UNKNOWN 5. Most premium coordinates are older than two years.

## 10. Stations within 2 km

Population: 82 premium stations. Any fuel type within 2 km: 695. These are straight-line screens.

## 11. Stations between 2 and 5 km

Population: 42 premium stations. Any fuel type in that band: 449. Premium stations within 5 km altogether: 124. Geolocated premium stations outside 5 km: 165.

## 12. Station distribution by state and brand

Premium counts are population counts inside the seat-selected municipalities. “Within 5 km” is the straight-line screen.

| State | Registered | API | Premium | Premium within 5 km |
| --- | --- | --- | --- | --- |
| PR | 546 | 546 | 83 | 9 |
| RS | 776 | 776 | 80 | 36 |
| SC | 885 | 885 | 83 | 51 |
| SP | 265 | 265 | 48 | 28 |

| Brand | Premium | Premium within 5 km |
| --- | --- | --- |
| VIBRA | 157 | 66 |
| IPIRANGA | 89 | 41 |
| RAIZEN | 19 | 6 |
| BANDEIRA BRANCA | 9 | 3 |
| RAIZEN MIME | 9 | 5 |
| CHARRUA | 4 | 2 |
| NEXTA | 4 | 0 |
| RODOIL | 2 | 0 |
| SIM DISTRIBUIDOR | 1 | 1 |

Brand is not premium evidence. Vibra is the distributor name on Petrobras-branded stations and is not a Podium claim.

## 13. Google Places sample results

Sample, not population. Twenty-four Text Search requests. The first 18 followed progress order and were clustered in Santos, Joinville, and Torres. Six further requests were spent to spread the sample: Peruíbe, São José dos Pinhais, Araquari, Itapema, Araranguá, and Capão do Leão. States SP, PR, SC, and RS are present. Brands include Vibra, Ipiranga, Raízen, Raízen Mime, Bandeira Branca, Charrua, and Sim. Both the 0–2 km and 2–5 km bands are present. The only LOW premium coordinate is outside 5 km and was not sent to Places. All 24 sent stations have MEDIUM location quality.

| Decision | Count |
| --- | --- |
| MATCH_CONFIRMED | 21 |
| MATCH_REVIEW_REQUIRED | 3 |
| MATCH_REJECTED | 0 |
| MATCH_NOT_FOUND | 0 |
| Request errors | 0 |

Confirmation requires either a candidate within 300 m plus municipality or address overlap, or a candidate within 150 m plus name overlap and the same municipality. A permanently closed business is rejected. Anything else with a candidate stays in review. The three review records are Auto Posto Oceano Atlântico (Santos), an Ipiranga station in Campina Grande do Sul (CNPJ 78.901.915/0017-22), and Abastecedora de Combustíveis Oriente (Capão do Leão). Oceano Atlântico was later confirmed by address on the Petrobras locator, so the Places review is a conservative miss, not evidence that the ANP identity is wrong.

Google place IDs, Google addresses, and weekday text are not stored in the committed summary.

## 14. Opening-hours coverage

ANP does not publish opening hours. Population hours: UNKNOWN.

Places sample: regular hours returned for 20 of 24 requests. Current hours were returned for the same 20. Four confirmed or reviewed matches returned no regular hours. Those four are not a population rate.

## 15. Hours cross-validation

Cross-checked hours: 0. Conflicting hours: 0. Google hours are labeled `not_cross_checked`. No independent published schedule was retrieved for the sample. This phase does not claim that Google hours are verified.

## 16. Petrobras Podium evidence

ANP population: 0 product strings contain Podium.

Public locator sample, filter “Gasolina Petrobras Podium”, 2026-11-17:

| ANP legal name | CNPJ | ANP address | Locator card | Locator products include |
| --- | --- | --- | --- | --- |
| POSTO GLORIA LTDA | 17.898.787/0001-53 | Rua Marques de Olinda, 3700, Joinville/SC | POSTO GLORIA, same street and number | Gasolina Podium |
| AUTO POSTO SANTA CATARINA LTDA | 05.294.302/0001-33 | Rua 246, 801, Itapema/SC | A P SANTA CATARINA, R 246 801 | Gasolina Podium |
| MODESTO AUTO POSTO LTDA | 18.436.138/0002-84 | Avenida Nereu Ramos, 1048, Itapema/SC | POSTO MODESTO 2, same avenue and number | Gasolina Podium |
| AUTO POSTO OCEANO ATLANTICO LTDA | 73.032.088/0001-05 | Avenida Washington Luiz, 224, Santos/SP | OCEANO ATLANTICO, same avenue and number | Gasolina Podium |

ANP classifies all four as premium gasoline, not as Podium. The locator commercial name can differ from the legal name. Address agreement is what confirms these four.

Name-only candidates, card not opened, not counted as confirmed: POSTO ZANDONA 11 in the Joinville Podium view versus ANP POSTO Z11 LTDA; TAMBURELLO in the Santos Podium view versus ANP AUTO POSTO TAMBURELLO LTDA, which has no ANP coordinate.

Jaguarão, with the same Podium filter, showed no named station marker at the search zoom or after two zoom-outs. That is a view observation. It does not prove that Jaguarão has no Petrobras station.

The four confirmations are not a rate for the 157 premium Vibra stations.

## 17. Geographic coverage gaps

Two gaps exceed 100 km with no premium station inside the 5 km screen:

| From progress | To progress | Length |
| --- | --- | --- |
| 218 km | 335 km | 117 km |
| 1,389 km | 1,518 km | 130 km |

The first runs from the Jacupiranga / Pariquera area toward the Paraná serra. The second runs from the Pelotas area to the Jaguarão end of the Brazilian clip. Phase 5.1 remeasured complete Paraná, Santa Catarina, and Rio Grande do Sul pages: no geolocated premium record outside the seat-selected municipalities fell within 5 km. Twenty-six premium records in those states have no usable coordinate, and São Paulo outside the 19 retrieved municipalities remains unknown. The gaps mean “no premium station in the analyzed set is inside 5 km,” not “no fuel station exists.”

## 18. Identity and duplicate issues

Duplicate CNPJs in the corridor population: 0. Locations within 50 m with different CNPJs: 86 flags. They were flagged and not merged. Repeated geocodes are one possible cause. CSV and API identity agreement for the premium population is complete in this retrieval. Places produced 3 review decisions; one of those was independently confirmed on the Petrobras locator.

## 19. Real API usage

| Call | Count | Ceiling |
| --- | --- | --- |
| Places Text Search Enterprise | 24 | 25 |
| Additional Routes `computeRoutes` | 0 | 5 |
| Phase 5 map loads before the diagnostic check | 0 | 5 |

No retries. Denied reservations do not increment. Paid Places calls are outside the default test suite. Playwright forces `ROUTE_OVERLAY_PLACES_ENABLED=false` and an empty Places key.

The Phase 4 budget file is left as found. It is not reset by this phase.

## 20. Estimated cost

Worst case if the monthly free Text Search Enterprise cap is already exhausted: 24 × USD 0.035 = USD 0.84. If the free cap still covers these calls, the marginal cost is USD 0. Observed billing export was not queried. Existing BRL budget alerts are not a hard spending limit. No Routes call was added. A later diagnostic map load, if the browser key is enabled, is a Maps JavaScript load and is counted separately under the Phase 5 map ceiling of 5 and the existing global map ceiling.

## 21. Test results

Commands run on 2026-11-17 after the Phase 5 changes:

| Command | Result |
| --- | --- |
| `npm run typecheck` | passed |
| `npm run lint` | passed, no warnings |
| `npm run test:unit` | 103 passed |
| `npm run test:integration` | 18 passed, including the Phase 5 map ceiling and the check that the response does not contain a Places key |
| `npm run test:e2e` | 20 passed, 1 skipped |
| `npm run build` | passed |
| `npm audit --omit=dev` | 0 vulnerabilities |

The skipped end-to-end test is the real-provider smoke, which stays skipped unless `ROUTE_OVERLAY_LIVE_EXPERIMENT` is set. Default tests do not call Places or Routes. Unit and integration tests use fixtures. They are not live ANP or live Places validation. The live evidence is the retrieval and the 24 Places requests described above.

## 22. Security review

- A dedicated key named `route-overlay-places-local` is restricted to `places.googleapis.com`. It is stored only in gitignored `.env.local`.
- The key has no application restriction because the local egress address was not treated as stable.
- Existing Routes and Maps JavaScript keys were not reused for Places.
- Billing was already enabled. No payment method, quota, IAM, or unrelated API was changed. Places API (New) was already enabled.
- `.env.local`, `.route-overlay/`, and `LOCAL.md` stay gitignored.
- The committed summary stores match counts and hours presence. It does not store place IDs, Google addresses, weekday text, API keys, emails, or machine paths.
- The repository remains public. Visibility was not changed. This branch was not pushed or merged.

## 23. Data licensing implications

ANP cadastral and API fields used here are official public records and may be reported. Google Places content is restricted: the committed artifact keeps counts only. The diagnostic map draws ANP coordinates, not a stored Google route and not a bulk Places export. Petrobras locator cards were read on the public page for a bounded sample; the report keeps names, addresses, and the Podium product label, not a copy of the locator database. Opening hours returned by Google are not republished.

## 24. Architectural changes

New typed modules under `lib/route-overlay/stations/` cover CSV ingestion, schema checks, CNPJ normalization, product classification, coordinate checks, route proximity, identity, quality, Places matching, hours interpretation, and the Phase 5 budget. `scripts/phase5-*.ts` are the one-off research runners. `/coverage` reads `data/phase5-coverage-summary.json` and renders the diagnostic without replacing `/plan`. The map posts to `/api/stations/map-load`, which reserves both the Phase 5 map ceiling and the existing global map ceiling, and returns no credentials.

## 25. Product feasibility implications

The ANP join is strong enough to build a candidate list of explicit premium-gasoline authorizations along this Brazilian corridor. It is not strong enough to promise a stop:

- location quality is unvalidated for every geolocated premium station observed;
- distance is not driving access;
- two gaps exceed 100 km on the 5 km screen;
- hours are unknown for the population;
- Podium cannot be inferred from ANP or from the Vibra brand;
- the route itself is the cached default, not the confirmed revision;
- the municipality screen can miss a station whose seat is far from the road and can include stations in a large city whose seat is near the road;
- Uruguay is uncovered by this source.

## 26. Recommended next step

Keep this branch unmerged. Before any fuel-stop feature, persist the confirmed route geometry, replace seat screening with a corridor buffer that does not depend on municipal seats, and treat ANP coordinates as unvalidated until a second source agrees. Use the Petrobras locator only as a bounded Podium check, not as a brand-wide assumption. Do not add opening hours to the product until an independent schedule source exists.

## INDEPENDENT REVIEW SUMMARY

| Metric | Numerator | Denominator | Percentage | Evidence | Confidence | Limitations |
| --- | --- | --- | --- | --- | --- | --- |
| Registered stations in scope | 2,472 | 2,472 municipality records; 45,848 national CSV rows | 100% of the selected municipalities | ANP CSV and API | High for those municipalities | Seat screen, not a boundary intersection |
| Explicit premium gasoline | 294 | 2,472 | 11.9% | ANP product text | High | Authorization, not stock |
| Premium with usable coordinates | 289 | 294 | 98.3% | ANP API | Medium | 289 of 289 geolocated points are “não validada” |
| Premium within 2 km | 82 | 294 | 27.9% | Straight-line screen on the cached route | Medium | Not a driving detour |
| Premium between 2 and 5 km | 42 | 294 | 14.3% | Same screen | Medium | Same limitation |
| Places identity confirmed | 21 | 24 sample requests | 87.5% of the sample | Places Text Search plus conservative matcher | Medium for the sample | Not a population rate; 3 remain in review |
| Structured opening hours | 20 | 24 sample requests | 83.3% of the sample | Google regular hours | Low | Population is UNKNOWN |
| Hours cross-checked | 0 | 24 | 0% | No independent schedule | High that none were cross-checked | Google hours are not verified |
| Explicit Podium in ANP | 0 | 294 | 0% | ANP product strings | High for the text | Does not mean Podium is absent at the station |
| Podium confirmed on the public locator | 4 | 4 opened address cards | not a population percentage | Petrobras public locator | High for those four | Does not generalize to 157 Vibra stations |
| Reliable fuel-stop planning | — | — | — | Combined gaps above | High that the data are insufficient | See verdict |

## Representative public records

These are official ANP identities. Distances are straight-line screens. “Locator” is the public Petrobras check, not a population result.

| Station | CNPJ | Place | Brand | ANP premium text | Distance | Places | Locator |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AUTO POSTO OCEANO ATLANTICO LTDA | 73.032.088/0001-05 | Santos/SP | VIBRA | GASOLINA C PREMIUM | 0.61 km | Review | Podium confirmed, Av. Washington Luiz 224 |
| ESTEVEZ & ESTEVEZ COMERCIO E SERVICOS AUTOMOTIVOS LTDA | 58.190.083/0001-09 | Santos/SP | VIBRA | GASOLINA C PREMIUM ADITIVADA | 4.31 km | Confirmed, no hours | Not opened |
| POSTO GAIVOTA LTDA | 51.645.646/0001-67 | Santos/SP | IPIRANGA | GASOLINA C PREMIUM ADITIVADA | 0.99 km | Confirmed, no hours | Not a Vibra station |
| AUTO POSTO POR DO SOL LTDA | 57.984.437/0001-24 | Itanhaém/SP | VIBRA | GASOLINA C PREMIUM | within 2 km | Confirmed | Not opened |
| AUTO POSTO FILADELFIA DE PERUIBE LTDA | 00.984.942/0001-51 | Peruíbe/SP | VIBRA | GASOLINA C PREMIUM | 2–5 km | Confirmed | Not opened |
| POSTOS PELANDA COMBUSTIVEIS LTDA | 78.901.915/0006-70 | Antonina/PR | VIBRA | GASOLINA C PREMIUM | within 2 km | Confirmed | Not opened |
| AUTO POSTO TULIO LTDA | 75.026.807/0001-00 | Campina Grande do Sul/PR | IPIRANGA | GASOLINA C PREMIUM | 2–5 km | Confirmed | Not a Vibra station |
| POSTO GLORIA LTDA | 17.898.787/0001-53 | Joinville/SC | VIBRA | GASOLINA C PREMIUM | 1.85 km | Confirmed | Podium confirmed, Rua Marques de Olinda 3700 |
| MODESTO AUTO POSTO LTDA | 18.436.138/0002-84 | Itapema/SC | VIBRA | GASOLINA C PREMIUM and GASOLINA C PREMIUM ADITIVADA | within 2 km | Confirmed | Podium confirmed, Av. Nereu Ramos 1048 |
| AUTO POSTO SANTA CATARINA LTDA | 05.294.302/0001-33 | Itapema/SC | VIBRA | GASOLINA C PREMIUM | 0.09 km | Not in the Places sample | Podium confirmed, Rua 246, 801 |
| RIZZOTTO & CIA LTDA | 05.298.376/0001-48 | Araranguá/SC | VIBRA | GASOLINA C PREMIUM | 2–5 km | Confirmed | Not opened |
| MARAVILHA POSTO DE COMBUSTIVEIS LTDA | 33.753.491/0001-09 | Torres/RS | VIBRA | GASOLINA C PREMIUM | within 2 km | Confirmed | Not opened |
| ABASTECEDORA DE COMBUSTIVEIS ORIENTE LTDA | 41.645.591/0001-31 | Capão do Leão/RS | VIBRA | GASOLINA C PREMIUM ADITIVADA | within 2 km | Review | Not opened |
| AUTO POSTO TAMBURELLO LTDA | 01.277.960/0001-66 | Santos/SP | VIBRA | GASOLINA C PREMIUM | no coordinate | Not sent | Name visible; card not opened |

## Confirmed facts, sample observations, assumptions, unknowns

Confirmed facts: CSV schema and checksum; 45,848 national rows; 2,472 matching CSV and API identities in the selected municipalities; 294 explicit premium records; 289 usable coordinates, all observed as unvalidated; 82 and 42 premium stations in the two distance bands; 0 ANP Podium strings; 24 Places requests with the decisions above; 4 locator address confirmations; two gaps over 100 km; the route label and the fact that confirmed geometry was not available.

Sample observations: Places match rate, Google hours presence, and the four Podium cards. Joinville, Itapema, Santos, and the initial Florianópolis map view showed additional Podium-filtered commercial names that were not tied to an ANP address.

Assumptions: the cached google-1 polyline is the correct corridor to analyze when the confirmed revision is unavailable; seat proximity is an acceptable query screen; 80 km from the claimed seat is a useful rejection threshold; straight-line bands of 2 km and 5 km are useful screens. None of these assumptions is treated as highway access or as fuel in stock.

Unknowns: population opening hours; cross-checked hours; current stock; SIGAF interdiction; the Podium share of Vibra stations; stations in municipalities the seat screen missed; driving detours; Uruguay; the browser-confirmed polyline; observed Google invoice cost.

## Machine-readable result

`data/phase5-coverage-summary.json` is the sanitized aggregate. Large CSV, API payloads, station-level observations, and the Places sample file remain outside Git.
