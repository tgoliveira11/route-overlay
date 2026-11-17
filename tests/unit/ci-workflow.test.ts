import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(path.join(process.cwd(), ".github", "workflows", "ci.yml"), "utf8");

describe("GitHub Actions CI workflow", () => {
  it("runs the offline quality suite on pull requests to main and on main pushes", () => {
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("- main");
    expect(workflow).toContain("push:");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("runs-on: ubuntu-24.04");
    expect(workflow).toContain("node-version: 24");
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("npm run typecheck");
    expect(workflow).toContain("npm run lint");
    expect(workflow).toContain("npm run test:unit");
    expect(workflow).toContain("npm run test:integration");
    expect(workflow).toContain("npm run test:e2e");
    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("npm audit --omit=dev");
    expect(workflow).toContain("npx playwright install --with-deps chromium");
  });

  it("keeps permissions minimal and does not execute untrusted code with a privileged trigger", () => {
    expect(workflow).toContain("permissions:");
    expect(workflow).toContain("contents: read");
    expect(workflow).not.toContain("pull_request_target");
    expect(workflow).not.toContain("contents: write");
    expect(workflow).not.toContain("secrets.");
    expect(workflow).toContain("persist-credentials: false");
  });

  it("disables paid Google providers and pins third-party actions to commits", () => {
    expect(workflow).toContain('ROUTE_OVERLAY_GOOGLE_API_ENABLED: "false"');
    expect(workflow).toContain('ROUTE_OVERLAY_GOOGLE_MAPS_JS_ENABLED: "false"');
    expect(workflow).toContain('ROUTE_OVERLAY_PLACES_ENABLED: "false"');
    expect(workflow).toContain('ROUTE_OVERLAY_LIVE_EXPERIMENT: "false"');
    expect(workflow).toContain('GOOGLE_ROUTES_API_KEY: ""');
    expect(workflow).toContain('GOOGLE_MAPS_JS_API_KEY: ""');
    expect(workflow).toContain('GOOGLE_PLACES_API_KEY: ""');
    expect(workflow).not.toMatch(/AIza[0-9A-Za-z_-]{10,}/);
    const uses = workflow.match(/uses: actions\/[A-Za-z0-9-]+@[0-9a-f]{40}/g) ?? [];
    expect(uses).toHaveLength(3);
  });

  it("keeps Playwright failure traces short-lived and out of private environment paths", () => {
    expect(workflow).toContain("retention-days: 7");
    expect(workflow).toContain("test-results");
    expect(workflow).toContain("playwright-report");
    expect(workflow).not.toContain(".env");
    expect(workflow).not.toContain(".route-overlay");
  });
});
