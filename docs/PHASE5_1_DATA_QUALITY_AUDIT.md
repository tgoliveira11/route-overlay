# Phase 5.1 — Data quality and reproducibility audit

Audit date: 2026-11-17.

Branch: `feature/anp-premium-station-coverage`.

HEAD: `6c29fa36db2e383bfb796b5239897733a58c7a19`.

This audit does not change the Phase 5 verdict. That verdict remains **CONDITIONAL GO** for identifying explicit premium gasoline inside the selected Brazilian municipalities. It is not a fuel-stop planning clearance, and it does not change the Phase 4 route verdict or the H1/H2 findings in `docs/FEASIBILITY.md`.

No commit, push, merge, deploy, or visibility change was made. No Places request and no Routes request was sent.

## 1. Executive summary

The published population counts are reproducible from the stored ANP CSV, the 22 stored API JSON files, and the cached route polyline. The timestamp contradiction is real. It comes from hardcoded labels, not from a later CSV download. The published `generatedAt` and `csvRetrievedAt` strings were left in place and classified.

The 22 stored pages are internally consistent: each `data` array length equals `totalRegistro`, and each file reports one page. They are not a raw HTTP archive. Fourteen São Paulo files are reduced copies. Ten of the 294 premium records come from those reduced files. Local direct requests to the ANP API are blocked by Cloudflare. This audit did not fetch the API again.

For Paraná, Santa Catarina, and Rio Grande do Sul, projecting complete stored state pages found no additional geolocated premium station within 5 km of the cached polyline outside the seat-selected municipalities. Twenty-six premium records in those states have no usable coordinate and were not projected. São Paulo outside the 19 retrieved municipalities is unknown. The published 82 and 42 corridor counts are therefore unchanged, with that scope limit.

Places coordinate disagreement cannot be calculated. The retained sample stores match decisions and hour flags, not candidate coordinates. The Phase 4 browser-confirmed polyline was not persisted because confirmation lived only in browser storage. A local 30-day confirmation file now exists for future explicit confirmations. The cached default is not substituted when a confirmed Google route is required. The historical analysis geometry is still the cached default.

## 2. Source provenance verdict

Verdict: **partially verified stored responses. Not a raw official archive. Not proof of national completeness.**

| Item | Evidence | Status |
| --- | --- | --- |
| CSV | 7,910,007 bytes, SHA-256 `e89cfa0761dd3edb84b4c3bb9b2690c5d0a69f3be9d5d21f794888548bf0da64`, 45,848 data rows, no products or coordinates | Verified from the local file |
| API endpoint in code | `GET https://revendedoresapi.anp.gov.br/v1/combustivel` with `uf`, `municipio`, and `numeropagina` | Verified in `lib/route-overlay/stations/anp-api.ts` |
| HTTP status of the successful retrievals | No status line or `Date` header was stored | UNVERIFIED |
| Local direct request | A stored sample is a Cloudflare interstitial HTML page, not a station payload. No bypass was attempted in Phase 5 or in this audit | Blocked from this machine |
| PR, SC, RS pages | 2,961, 2,096, and 3,136 rows. Each file has one page, `data.length` equals `totalRegistro`, and the tank-capacity field is present | Pagination consistent inside the stored JSON |
| Five larger SP files | Santos 55, Praia Grande 38, Guarujá 32, São Vicente 26, Itanhaém 21. Tank-capacity field present | Pagination consistent inside the stored JSON |
| Fourteen smaller SP files | Row counts match `totalRegistro`, and the tank-capacity field is absent | Transformed copies. Official page totals UNVERIFIED |
| Truncated SP state page | Prior page check recorded an unterminated JSON at 5,000,000 characters. That file was not parsed | Incomplete. Not used |
| CNPJ reconciliation inside the 137 municipalities | CSV CNPJs missing from the API: 0. API CNPJs missing from the CSV: 0 | Verified for that municipality set |
| Premium classification | Re-running the classifier on the stored product strings reproduces 294 explicit premium records | Verified against stored files |
| Premium records in reduced SP files | Cubatão 3, Jacupiranga 2, Peruíbe 2, Juquiá 1, Miracatu 1, Pariquera-Açu 1 | 10 of 294 depend on transformed files |

The 294 records are all explicit premium records in the stored municipality extract. They are not evidence that every relevant station in every municipality along the road was retrieved. São Paulo was not retrieved as a complete state page.

## 3. Timestamp findings

The two published strings disagree by 160 minutes when read as absolute instants:

| Label | Published string | Absolute instant | Classification |
| --- | --- | --- | --- |
| Report `generatedAt` | `2026-11-17T14:40:00.000Z` | 2026-11-17T14:40:00Z | HARDCODED |
| CSV `retrievedAt` | `2026-11-17T14:20:06-03:00` | 2026-11-17T17:20:06Z | OFFSET_MISLABEL |

The CSV string copies the filesystem clock digits `14:20:06` and then attaches `-03:00`. The file mtime is `2026-11-17T14:20:06.476Z`. Applying the offset moves that clock 180 minutes later. The 160-minute gap is `17:20:06Z` minus the hardcoded `14:40:00Z`.

Filesystem evidence, which records local writes and not ANP publication time:

| Event | Instant |
| --- | --- |
| CSV file written | 2026-11-17T14:20:06.476Z |
| Earliest stored API file | 2026-11-17T14:32:09.911Z |
| Latest stored API file | 2026-11-17T14:45:30.619Z |
| Observation file written | 2026-11-17T14:45:57.201Z |
| Places sample last written | 2026-11-17T14:55:08.438Z |
| Summary content before this audit's annotation | 2026-11-17T15:03:38.961Z |

The hardcoded generation label is about six minutes earlier than the observation write, and it precedes the latest API file. It cannot be the completion time of the analysis. Upstream HTTP retrieval instants were not stored and remain UNVERIFIED. The ANP page label “updated 17/11/2026 09:29” is unchanged; this audit does not assign it a timezone.

The historical strings were not rewritten. `data/phase5-coverage-summary.json` now also carries a `chronologyAudit` object that points here. `scripts/phase5-analyze.ts` now records a future CSV time from the file mtime and a future generation time from the clock. That script was not re-run, because a re-run would replace the historical summary.

## 4. Original versus corrected metrics

No population count was replaced. The recalculation from the CSV, the 22 JSON files, the seat list, and the cached polyline matches the published summary.

| Metric | Published | Recalculated | Result |
| --- | --- | --- | --- |
| National CSV rows | 45,848 | 45,848 | Match |
| Registered in selected municipalities | 2,472 | 2,472 | Match |
| API records in those municipalities | 2,472 | 2,472 | Match |
| Explicit premium | 294 | 294 | Match |
| Premium with coordinates | 289 | 289 | Match |
| Premium within 2 km | 82 | 82 | Preserved |
| Premium between 2 and 5 km | 42 | 42 | Preserved |
| Premium without coordinates | 5 | 5 | Match |
| Any fuel within 2 km | 695 | 695 | Match |
| Any fuel between 2 and 5 km | 449 | 449 | Match |
| State premium and within-5 km totals | PR 83/9, RS 80/36, SC 83/51, SP 48/28 | Same | Match |
| Brand premium totals | Same nine brands | Same | Match |
| Gaps over 100 km | 116,865 m and 129,575 m | Same after rounding to meters | Match |
| Places sample | 24 requested, 21 confirmed, 3 review, 20 hour records | Same | Match |
| Hours cross-check | 0 consistent, 0 conflicting | 20 `not_cross_checked`, 4 `missing` | Match |

The machine-readable comparison is `data/phase5-1-reproducibility.json`.

## 5. Geographic coverage limitations

The municipality set is still a municipal-seat screen: nearest southern-state seat to a sample every 5 km, or a seat within 20 km of a simplified polyline. It is not a boundary intersection.

This audit projected station coordinates from the complete stored PR, SC, and RS pages onto the same cached polyline.

| Measurement | Value | Scope |
| --- | --- | --- |
| Geolocated stations outside the selected municipalities and inside the route bounding box | 3,277 | PR, SC, RS |
| Additional geolocated premium within 2 km | 0 | PR, SC, RS |
| Additional geolocated premium within 5 km | 0 | PR, SC, RS |
| Premium outside the selected municipalities with no usable coordinate | 26 | PR, SC, RS; not projected |
| Premium outside the 19 retrieved São Paulo municipalities | Unknown | The full SP page is truncated and was not parsed |

The 82 and 42 counts stay the seat-selected results. They now have a measured limit: stored geolocated PR, SC, and RS pages do not add a premium station inside 5 km. They do not cover the 26 ungeolocated records, São Paulo outside the retrieved municipalities, or Uruguay.

No missing establishment was invented.

## 6. Location validation results

These are separate claims.

| Claim | Result | Basis |
| --- | --- | --- |
| ANP coordinate validation | Not validated | 289 geolocated premium records say “Posição Geográfica não validada”. Five premium records have an empty validation string and no coordinate. Quality remains MEDIUM 288, LOW 1, MISSING 5 |
| Independent coordinate corroboration | UNKNOWN | `places-sample.json` has no candidate location, distance, place ID, or address |
| Identity matching | 21 `MATCH_CONFIRMED`, 3 `MATCH_REVIEW_REQUIRED`, 0 rejected, 0 not found | Retained decision only. A confirmed decision means the matcher ran. It does not retain the distance |
| Mere geographic proximity | Not available as a separate stored measurement | The live matcher used distance rules. Those distances were discarded |
| Aggregate coordinate disagreement | UNKNOWN | Cannot be computed from the retained evidence |
| Petrobras locator | Four address matches from Phase 5 | Identity and advertised Podium product. Not a coordinate comparison |

The three review decisions stay ambiguous. One of them, Oceano Atlântico in Santos, had an address match on the public locator in Phase 5. That match still does not supply a stored coordinate difference.

No new Places request was made. No restricted Google attribute was added to the repository.

## 7. Route geometry persistence results

The Phase 4 browser confirmation was stored in `localStorage` under the planning session. The Phase 5 analysis read the server-side cached `google-1` summary. The confirmed polyline was never written to disk. Its length, 1,936,073 m, remains a historical note. It was not recovered. No Routes call was made.

The new mechanism:

- An explicit confirmation posts to `/api/routes/confirmed-geometry`.
- The server writes a gitignored local file, by default `.route-overlay/confirmed-route.json`.
- Playwright uses `.route-overlay/e2e-confirmed-route.json` so a test does not overwrite a real confirmation.
- The revision ID is the SHA-256 of the encoded polyline.
- The file expires 30 days after `confirmedAt`.
- The response returns the revision ID and expiry, not the polyline.
- `selectAnalysisGeometry("confirmed_google", ...)` returns `unavailable` when the file is missing, expired, synthetic, or not a Google route.
- The cached default remains available only when the caller asks for `labeled_default`.

The Playwright plan flow wrote a mock confirmation during this audit. That file is synthetic. It is not the Phase 4 Google route, and the selector rejects it for a confirmed-Google analysis. The coverage study still uses `cached_google_default_route` with fidelity UNVERIFIED.

## 8. Reproducibility status

| Result | Status |
| --- | --- |
| Registered, premium, geolocated, band, state, brand, gap, and Places decision counts | Validated against the stored sources |
| CSV hash, byte size, and row count | Validated |
| API page row counts versus `totalRegistro` | Validated inside each stored file |
| Official HTTP status and retrieval instants | UNVERIFIED |
| Official totals for the 14 reduced SP files | UNVERIFIED |
| Geolocated PR/SC/RS omission inside 5 km | Validated for the stored pages: 0 |
| SP omissions and 26 ungeolocated out-of-set premium records | Unknown |
| Places coordinate disagreement | Unknown |
| Phase 4 confirmed polyline | Not recoverable from retained files |

`scripts/phase5-1-audit.ts` is the deterministic check. It does not call a network API.

## 9. Test results

Commands run on 2026-11-17 after the audit changes. No paid external API was called.

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, no warnings |
| `npm run test:unit` | 109 passed |
| `npm run test:integration` | 19 passed |
| `npm run test:e2e` | 20 passed, 1 skipped |
| `npm run build` | Passed, Next.js 15.5.29 |
| `npm audit --omit=dev` | 0 vulnerabilities |

The new tests cover timezone parsing, the offset mislabel, chronological order, aggregate differences, confirmation expiry, rejection of a cached-default substitution, and a confirmation response that does not echo the polyline.

The dev server on port 3000 was stopped before the production build because both write `.next`. Playwright used its own server on port 3100 with Places disabled and an empty Places key.

## 10. Files changed

Phase 5 and Phase 5.1 remain uncommitted. Files added or modified for this audit:

- `lib/route-overlay/stations/chronology.ts`
- `lib/route-overlay/confirmed-route-store.ts`
- `app/api/routes/confirmed-geometry/route.ts`
- `components/assisted-planner.tsx`
- `playwright.config.ts`
- `scripts/phase5-analyze.ts`
- `scripts/phase5-1-audit.ts`
- `tests/unit/phase5-1.test.ts`
- `tests/integration/confirmed-route.test.ts`
- `data/phase5-1-reproducibility.json`
- `data/phase5-coverage-summary.json` (`chronologyAudit` added; historical timestamps kept)
- `docs/PHASE5_PREMIUM_FUEL_COVERAGE.md` (additive chronology and omission notes)
- `docs/PHASE5_1_DATA_QUALITY_AUDIT.md`

The broader Phase 5 coverage modules, page, and tests are still untracked on this branch. They were not redesigned.

## 11. Git status

```text
branch: feature/anp-premium-station-coverage
HEAD: 6c29fa36db2e383bfb796b5239897733a58c7a19
```

The branch has no new commit. `git status` shows the pre-existing Phase 5 modifications and untracked files, plus the audit files above. `.env.local` and `.route-overlay/` remain ignored. Nothing was committed, pushed, or merged.

Repository visibility, checked with `gh repo view tgoliveira11/route-overlay --json visibility,isPrivate`:

```text
visibility: PUBLIC
isPrivate: false
url: https://github.com/tgoliveira11/route-overlay
```

Visibility was not changed.

## 12. Remaining blockers

- The GitHub repository is public. Any later commit of this branch publishes the research summary to the internet. That decision belongs to the repository owner.
- The Phase 4 confirmed polyline is not on disk. Recovering it requires a new Routes call, which this audit did not make.
- São Paulo outside 19 municipalities is unknown unless a complete official page is obtained. A Cloudflare block must not be bypassed.
- Twenty-six premium records in PR, SC, and RS outside the seat set have no usable coordinate.
- Ten premium records depend on reduced São Paulo JSON.
- ANP coordinates used here are unvalidated by ANP's own text.
- Places distances were not retained, so coordinate disagreement stays unknown.
- Opening hours are Google-only for 20 of 24 sample stations.
- The route used for the counts is the cached Google default, fidelity UNVERIFIED.

## 13. Recommendation for the next phase

Do not merge this branch to `main`. Do not start fuel-stop planning on these counts.

The next decision is repository visibility. After that, the useful research step is a new explicit confirmation that writes the local geometry file, followed by a labeled rerun. That rerun still cannot close the São Paulo gap, the 26 ungeolocated records, the unvalidated ANP coordinates, or the missing Places distances without new source evidence.

Keep the Phase 5 verdict at CONDITIONAL GO.
