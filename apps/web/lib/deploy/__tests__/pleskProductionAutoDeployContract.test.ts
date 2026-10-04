import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "../../scripts/plesk-production-auto-deploy.sh"),
  "utf8",
);

describe("PLESK-PROD-AUTO-01 production deployment contract", () => {
  it("is production-only and cannot target the pricing-test runtime", () => {
    expect(source).toContain('LIVE="$ROOT/plesk-runtime"');
    expect(source).toContain('HEALTH_URL="${PLESK_PROD_HEALTH_URL:-https://shalean.co.za/api/health/environment}"');
    expect(source).toContain('EXPECTED_REF="${PLESK_PROD_EXPECTED_SUPABASE_REF:-paqjwfulwywtsyyvdxrq}"');
    expect(source).not.toContain("pricing-test-runtime");
    expect(source).not.toContain("plesk-pricing-test-auto-deploy.sh");
  });

  it("requires the exact release production artifact and production metadata", () => {
    expect(source).toContain('name="plesk-prod-"+sha');
    expect(source).toContain('d.get("artifact_sha")==sha');
    expect(source).toContain('d.get("deployment_environment")=="production"');
    expect(source).toContain('d.get("target_host")=="shalean.co.za"');
    expect(source).toContain('d.get("supabase_ref")==ref');
  });

  it("allows large production artifact downloads without weakening metadata API timeouts", () => {
    expect(source).toContain("ghdownload(){");
    expect(source).toContain("--max-time 600");
    expect(source).toContain("--retry 4");
    expect(source).toContain('ghdownload "$API/actions/artifacts/$ART_ID/zip"');
    expect(source).toContain("ghget(){");
    expect(source).toContain("--max-time 30");
  });

  it("probes before activation and rolls back failed public health", () => {
    expect(source).toContain("candidate loopback health failed");
    expect(source).toContain('mv "$LIVE" "$ROLLBACK"');
    expect(source).toContain("if health_exact; then");
    expect(source).toContain("restore");
    expect(source).toContain('d.get("deployment")=="production"');
    expect(source).toContain('(d.get("paystack") or {}).get("secretMode")=="live"');
    expect(source).toContain('(d.get("paystack") or {}).get("publicMode")=="live"');
  });
});
