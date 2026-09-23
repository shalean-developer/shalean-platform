import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function repoSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), "../..", relativePath), "utf8");
}

const autoDeploy = repoSource("scripts/plesk-pricing-test-auto-deploy.sh");
const prepare = repoSource("scripts/plesk-pricing-test-git-prepare.sh");
const healthRoute = readFileSync(
  join(process.cwd(), "app/api/health/environment/route.ts"),
  "utf8",
);
const pricingWorkflow = repoSource(".github/workflows/plesk-pricing-test.yml");

describe("PLESK-AUTO-03 pricing-test deployment contract", () => {
  it("waits for and activates only the exact release SHA", () => {
    expect(autoDeploy).toContain('TARGET_SHA="$(branch_sha)"');
    expect(autoDeploy).toContain('r.get("head_sha")==target');
    expect(autoDeploy).toContain("timed out waiting for exact-SHA artifact workflow");
    expect(autoDeploy).toContain(
      'release branch moved while waiting; refusing stale activation',
    );
    expect(autoDeploy).toContain(
      '/bin/bash "$SCRIPT_DIR/plesk-pricing-test-git-prepare.sh" "$TARGET_SHA"',
    );
  });

  it("serializes deployments and bounds GitHub requests", () => {
    expect(autoDeploy).toContain('/usr/bin/flock -w "$LOCK_WAIT_SECONDS" 9');
    expect(autoDeploy).toContain("--connect-timeout 10");
    expect(autoDeploy).toContain("--max-time 30");
    expect(autoDeploy).toContain(
      "could not re-check release branch after preparation; activation skipped",
    );
    expect(prepare).toContain("--connect-timeout 10");
    expect(prepare).toContain("--max-time 30");
  });

  it("creates an exact-SHA pricing-test workflow for every integration push", () => {
    expect(pricingWorkflow).toContain("- integration/shalean-release");
    expect(pricingWorkflow).not.toMatch(/\n\s+paths:/);
  });

  it("restarts through Passenger and rolls back failed public activation", () => {
    expect(autoDeploy).toContain('$STABLE/tmp/restart.txt');
    expect(autoDeploy).toContain('d.get("releaseSha")==expected');
    expect(autoDeploy).toContain("candidate public health failed; rolling back");
    expect(autoDeploy).toContain("candidate activation failed; previous release restored");
    expect(autoDeploy).toContain("PLESK_AUTO_03=PASS");
  });

  it("makes preparation exact-SHA aware and exposes runtime release identity", () => {
    expect(prepare).toContain('EXPECTED_SHA="${1:-}"');
    expect(prepare).toContain('r.get("head_sha")==target');
    expect(prepare).toContain("process.env.SHALEAN_RELEASE_SHA=String(meta.artifact_sha)");
    expect(healthRoute).toContain(
      "releaseSha: process.env.SHALEAN_RELEASE_SHA?.trim() || null",
    );
  });
});
