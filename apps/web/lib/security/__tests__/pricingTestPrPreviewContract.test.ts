import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd(), "..", "..");
const workflow = readFileSync(join(root, ".github/workflows/pr-preview-pricing-test.yml"), "utf8");
const activator = readFileSync(join(root, "scripts/plesk-activate-prebuilt-pricing-test.sh"), "utf8");

describe("pricing-test PR preview safety contract", () => {
  it("builds PR previews only with staging public configuration", () => {
    expect(workflow).toContain('SHALEAN_APP_ENV: "staging"');
    expect(workflow).toContain("https://uwvnmluiqbczeduzjgse.supabase.co");
    expect(workflow).toContain('SHALEAN_EXPECTED_SUPABASE_REF: "uwvnmluiqbczeduzjgse"');
    expect(workflow).toContain("PLESK_STAGING_SUPABASE_PUBLISHABLE_KEY");
    expect(workflow).toContain("sb_publishable_");
    expect(workflow).toContain("PLESK_TEST_PAYSTACK_PUBLIC_KEY");
    expect(workflow).toContain("pk_test_preview_disabled");
    expect(workflow).toContain("pk_test_");
    expect(workflow).not.toContain("paqjwfulwywtsyyvdxrq");
    expect(workflow).not.toContain("PROD_PAYSTACK");
  });

  it("publishes only the isolated preview artifact branch", () => {
    expect(workflow).toContain("refs/heads/deploy/pr-preview");
    expect(workflow).not.toContain("git push --force origin HEAD:refs/heads/deploy/staging");
    expect(workflow).not.toContain("refs/heads/deploy/production");
    expect(workflow).toContain("github.event.pull_request.head.sha");
  });

  it("activates only a staging bundle and fails closed on environment drift", () => {
    expect(activator).toContain('HEALTH_URL="https://pricing-test.shalean.co.za/api/health/environment"');
    expect(activator).toContain('EXPECTED_REF="uwvnmluiqbczeduzjgse"');
    expect(activator).toContain('LIVE="$ROOT/pricing-test-runtime"');
    expect(activator).toContain('d.get("deployment")=="staging"');
    expect(activator).toContain('d.get("paystack") or {}).get("secretMode")=="test"');
    expect(activator).toContain('d.get("messaging") or {}).get("outboundDisabled") is True');
    expect(activator).not.toContain('HEALTH_URL="https://shalean.co.za/api/health/environment"');
    expect(activator).not.toContain("paqjwfulwywtsyyvdxrq");
  });
});
