# Phase 6 — GitHub Actions CI

## 1. Workflow architecture

`.github/workflows/ci.yml` is one Linux job named `ci`. It runs on:

- `pull_request` targeting `main`
- `push` to `main`
- `workflow_dispatch`

Superseded pull-request runs cancel in the same concurrency group. A push to `main` does not cancel another in-progress main run. The job timeout is 30 minutes, and each command has its own shorter timeout.

The runner is `ubuntu-24.04`. Third-party actions are pinned to immutable commits:

| Action | Pin |
| --- | --- |
| `actions/checkout` v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node` v7.1.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| `actions/upload-artifact` v7.0.2 | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` |

Checkout does not persist the GitHub token in the local git config.

## 2. GitHub Actions security model

Workflow permissions are `contents: read`. The workflow does not use `pull_request_target`, does not read `secrets.*`, and does not receive a personal access token. Pull-request code therefore cannot see repository secrets through this workflow.

Paid Google access is forced off for every step:

- `ROUTE_OVERLAY_GOOGLE_API_ENABLED=false`
- `GOOGLE_ROUTES_API_KEY` empty
- `ROUTE_OVERLAY_GOOGLE_MAPS_JS_ENABLED=false`
- `GOOGLE_MAPS_JS_API_KEY` empty
- `ROUTE_OVERLAY_PLACES_ENABLED=false`
- `GOOGLE_PLACES_API_KEY` empty
- `ROUTE_OVERLAY_LIVE_EXPERIMENT=false`

Playwright's own web server also clears those provider flags unless the live-experiment flag is true. The workflow never sets that flag to true. Failure artifacts are limited to `test-results` and `playwright-report`, retained for 7 days. Environment files and `.route-overlay/` are not uploaded.

## 3. Node version

The repository does not declare an `engines` field. Next.js 15.5.29 accepts `^18.18.0 || ^19.8.0 || >=20.0.0`. Local development for this checkout uses Node.js 24.19.0 and npm 11.17.0, which produced `package-lock.json` at lockfile version 3. CI installs Node.js 24 through `actions/setup-node` and installs from that lockfile with `npm ci`. npm's setup-node cache is enabled.

## 4. Dependency installation

`npm ci` installs the locked tree, including dev dependencies required by TypeScript, ESLint, Vitest, and Playwright. Chromium and its Linux libraries are installed with `npx playwright install --with-deps chromium`. No Google package or API key is added.

## 5. Commands executed

1. `npm run typecheck`
2. `npm run lint`
3. `npm run test:unit`
4. `npm run test:integration`
5. `npm run test:e2e`
6. `npm run build`
7. `npm audit --omit=dev`

`npm run test:live` is not part of CI. That script is the only suite allowed to call a live provider, and only when `ROUTE_OVERLAY_LIVE_EXPERIMENT=true`.

## 6. Workflow URL

https://github.com/tgoliveira11/route-overlay/blob/main/.github/workflows/ci.yml

Actions workflow: https://github.com/tgoliveira11/route-overlay/actions/workflows/ci.yml

## 7. CI execution results

First GitHub-hosted run:

- URL: https://github.com/tgoliveira11/route-overlay/actions/runs/44183741048
- Event: `pull_request` for https://github.com/tgoliveira11/route-overlay/pull/3
- Head: `2d4a718e8be5c361db247930287de16cbae8b184`
- Conclusion: success
- Started: 2026-11-17T21:49:05Z
- Finished: 2026-11-17T21:51:52Z

The job `ci` passed typecheck, lint, unit tests, integration tests, Playwright Chromium, the production build, and `npm audit --omit=dev`. The failure-trace upload was skipped because Playwright passed. No Google API key was configured for the run.

## 8. Runtime and resource observations

The successful job took 2 minutes 43 seconds on one `ubuntu-24.04` runner. The workflow budget is 30 minutes. There is no matrix. Node.js 24 was installed from the official setup action, and `npm ci` used the lockfile cache.

## 9. Branch protection findings

Before this phase, `main` required a linear history, enforced the rule for administrators, required zero approving reviews, and required no status checks. Merge commits were disabled. Squash and rebase merges were allowed. This phase does not weaken those rules. A required status check named `ci` is added only after a real run reports that exact context, and only if the repository permissions allow the update.

## 10. Known limitations

- The workflow does not start the separate live-provider suite.
- `npm audit` consults the public advisory database. That network call is not a Google Maps Platform request.
- Playwright downloads Chromium during the job. That download is not a Maps JavaScript load.
- Required-check configuration depends on the GitHub plan and the caller's permission to edit branch protection.
- Cancelling a superseded pull-request run can leave an older commit without a completed check. The latest head is the commit that must pass.

## 11. Pull request and merged SHA

Pull request: https://github.com/tgoliveira11/route-overlay/pull/3

The hosted success above validated `2d4a718e8be5c361db247930287de16cbae8b184`. This documentation update is a later commit on the same branch, so it receives its own Actions run before merge. `main` uses rebase, which assigns a new SHA. The verified `origin/main` SHA is the one reported after that merge, not a hash predicted in this file.
