# Security audit — phase 3

Audit date: 2026-11-16. Host: local Windows. Commands: `npm audit --json` and `npm audit --omit=dev --json`. No `npm audit fix --force`. No audit suppressions were added.

## Totals

| Tree | Before this phase | After this phase |
| --- | --- | --- |
| Full install | 16 (2 low, 11 moderate, 1 high, 2 critical) | 6 (3 low, 1 moderate, 2 critical) |
| Production (`--omit=dev`) | 8 (2 low, 5 moderate, 1 high, 0 critical) | 0 |

The before count is the audit of the restored lockfile (584 packages, Next.js 15.5.29, Vitest 3.2.4, nested `next/node_modules/postcss` 8.4.31). The after count is the tree after the changes below (Vitest 3.2.7, hoisted PostCSS 8.5.33).

## Findings before remediation

npm groups related packages into one report entry, so the 16 count includes both the vulnerable package and dependents that npm lists because they pull it in.

| Package | Installed then | Vulnerable range | Advisory | Severity | Direct? | Prod or dev | Context | Exploitability here | Patched version | Remediation taken | Compatibility | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| postcss (nested under next) | 8.4.31 | `<=8.5.22` | [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93), [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q), [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp), [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) | high | Transitive of next | Production build tool | CSS stringify XSS and source-map file reads when PostCSS parses untrusted CSS | The app does not parse visitor CSS. The copy ran inside the Next.js build. A malicious stylesheet in the repo could have been processed at build time. | 8.5.23 and later. 8.5.33 is installed. | npm's only suggested fix was Next.js 16.4.6. An override pins every `postcss` copy to 8.5.33 instead. | Same major. Production build is the compatibility check. | Remediated |
| next | 15.5.29 | Listed because it depended on the vulnerable PostCSS | Same PostCSS advisories | high, via postcss | Direct | Production | Framework build | No separate Next advisory was the high finding. | Next 16.4.6 would also replace PostCSS. | Not upgraded. | A Next 16 major would move React tooling and the App Router integration without a demonstrated need once PostCSS is patched. | Major upgrade not taken |
| minimatch | 10.2.6 under `@typescript-eslint/typescript-estree` and `@ts-morph/common`. Root 3.1.5 is outside the range. | `7.0.0 - 11.0.0` | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) | moderate | Transitive | ESLint and the shadcn CLI | ReDoS through crafted glob parts | The running app does not pass request input to minimatch. | 11.0.8 is outside `<=11.0.0`. | `npm audit fix` updated the TypeScript ESLint copy. An override sets `@ts-morph/common`'s minimatch to 11.0.8. | minimatch 11 stays on the CLI/lint path. The application routes were not changed. | Remediated for the copies that were in range |
| vitest | 3.2.4 | `<=4.1.10`, later reported as `0.0.95 - 4.1.10` | UI file read while the Vitest UI server is listening; [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9); tinypool | critical | Direct devDependency | Test process | Test runner | `npm run test` does not start the Vitest UI server. Worker options are not taken from HTTP requests. | npm offers Vitest 5.1.0, a breaking change. 3.2.7 is the newest 3.x release and is still in range. | Updated to 3.2.7 with `npm audit fix`. The UI-server title was no longer in the via list after that patch. The mocker and tinypool issues remain. | Existing tests passed on 3.2.7. Vitest 5 was not installed. | Partial. Residual risk accepted for the remainder. |
| @vitest/mocker | 3.2.4, then 3.2.7 | `<=4.1.11` | [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9), [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8) | moderate | Transitive dev | Test process | Path traversal in the mock redirect, and code injection through unauthenticated manual mock registration | Requires a reachable Vitest process and attacker-controlled mock setup. The Next server does not load this package. | `@vitest/mocker` 4.1.12 or newer, which means leaving Vitest 3. | Not upgraded beyond 3.2.7. | A Vitest 5 upgrade can break the suite and was not required to ship the local app. | Residual, dev-only |
| tinypool | 1.1.1 | `<=2.1.1` | [GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3), [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) | critical | Transitive of vitest | Test worker pool | Prototype pollution in worker `run` options leading to code execution | The gadget needs control of tinypool options. This application does not expose that API. Tinypool 2.2.0 exists, but Vitest 3.2.7 still depends on 1.1.1. Forcing 2.x into Vitest 3 was not attempted. | tinypool `>=2.1.2`. npm's non-breaking fix does not move this package there. | Left on 1.1.1. | A major Vitest upgrade is the documented fix path. | Residual, dev-only |
| deepmerge | 4.3.1 | `>=4.2.0 <=4.3.1` | [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) | low | Transitive of shadcn | shadcn CLI | Prototype pollution in `mergeObject` | The Next routes do not import `deepmerge` or `shadcn`. | npm's suggested repair downgrades the CLI to `shadcn@1.0.0`. | Not applied. `shadcn` was moved to devDependencies so the production audit no longer includes it. | Keeping shadcn 4 avoids replacing the component generator with the 1.0 CLI. | Residual, dev CLI only |
| shadcn and @shadcn/registry, ts-morph, @ts-morph/common, and the TypeScript ESLint packages | shadcn 4.23.0 | Listed because they depend on deepmerge, ts-morph, or minimatch | The advisories of those dependencies | low or moderate | shadcn was a direct production dependency even though the app never imported it | CLI and lint | Not on the request path | Same as the underlying packages. | Follows the dependency fixes. | minimatch copies updated. shadcn reclassified as a devDependency. | The UI components in the repo do not import the `shadcn` package. | Dependents cleared from the production tree |

npm did not attach CVE identifiers in the JSON used for this table. The GitHub Security Advisory links above are the identifiers that were checked.

## What changed in the tree

- `package.json` `overrides.postcss` is `8.5.33`.
- `package.json` overrides `@ts-morph/common` → `minimatch` `11.0.8`.
- `shadcn` moved from `dependencies` to `devDependencies`.
- `npm audit fix` (without `--force`) updated Vitest to 3.2.7 and `@typescript-eslint/*` to 8.73.0.
- Next.js, React, and the application source API were not upgraded.

Afterward, `npm audit --omit=dev` reports zero vulnerabilities. The full audit still reports:

| Package | Version now | Severity | Why it remains |
| --- | --- | --- | --- |
| vitest | 3.2.7 | critical | Still inside `0.0.95 - 4.1.10` because of `@vitest/mocker` and tinypool. Fix path is Vitest 5.1.0. |
| tinypool | 1.1.1 | critical | Still `<=2.1.1`. Vitest 3.2.7 has not moved off this release. |
| @vitest/mocker | 3.2.7 | moderate | Still `<=4.1.11`. |
| deepmerge | 4.3.1 | low | Still inside `>=4.2.0 <=4.3.1`. |
| shadcn, @shadcn/registry | 4.23.0 | low | They depend on deepmerge. DevDependencies only. |

## Accepted residual risk

The two critical findings execute only if someone runs Vitest and can influence worker options or the mocker. This project's production server does not start Vitest. The dev server binds to `127.0.0.1`. The residual risk is accepted for this phase because removing it requires a major test-runner upgrade, and the running application is not the vulnerable process.

`deepmerge` is accepted because it is confined to the component CLI, the suggested npm repair is a breaking downgrade, and application code does not call it.

Next.js 16 was not installed. The high-severity production finding was the nested PostCSS release, and that copy is gone.

## Controls that were rechecked

Short-link expansion still uses `redirect: "manual"`, an exact Google Maps hostname set, HTTPS, no userinfo, public DNS answers only, at most five redirects, and a timeout. `tests/unit/expand-short-link.test.ts` still covers unsafe targets that must not be fetched. `dev` and `start` still pass `-H 127.0.0.1`.

Confirmed sessions are validated before restore. A stored object that claims `fidelityIndependentlyVerified: true`, a version other than 2, an empty `routingRevision`, or a confirmed URL that is not the imported URL is discarded. The Routes API key is not written into reconstruction JSON. The mocked-HTTP test asserts the test key is absent from the returned object. The Maps JavaScript key is omitted from `/api/routes/status` unless map display is explicitly enabled and configured.

## Phase 3.1 recheck

Rechecked on 2026-11-16 after the correctness fixes, without `npm audit fix` and without changing `package-lock.json` in this pass. `npm audit --json` exited 1 and reported 3 findings: 0 low, 1 moderate, 0 high, 2 critical. `npm audit --omit=dev --json` exited 0 and reported 0 findings. Production dependencies still have no known critical or high finding in this audit.

| Package | Version still installed | Severity in this audit | Exposure |
| --- | --- | --- | --- |
| vitest | 3.2.7 | critical | Dev-only. Still inside `0.0.95 - 4.1.10`. The advisory npm attached is the mocker path traversal. The documented fix remains Vitest 5.1.0. Not upgraded. |
| tinypool | 1.1.1 | critical | Dev-only, pulled by Vitest 3.2.7. Advisories remain GHSA-5gmw-xhrv-c9v3 (`<=2.1.0`) and GHSA-85c8-ppgw-ccpr (`<2.1.2`). The production server does not start this worker pool. |
| @vitest/mocker | 3.2.7 | moderate | Dev-only. Range `<=4.1.11`. Path traversal and unauthenticated manual-mock registration require a reachable Vitest process. |

`deepmerge` 4.3.1 and `shadcn` 4.23.0 are still installed as development dependencies. This audit invocation did not list them. Their earlier low finding, GHSA-gcqx-w48m-w2h4, is unchanged in the tree: application routes still do not import `deepmerge`. No advisory was suppressed.

PostCSS remains overridden at 8.5.33. Next.js remains 15.5.29. No major framework upgrade was made. The two critical findings are still confined to the test runner. The running application is not that process, and `dev` and `start` still bind to `127.0.0.1`.
