import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd(), "..", "..");

describe("CF-02 established Plesk staging release safety", () => {
  it("keeps the original deploy/staging route and rollback", () => {
    const workflow = readFileSync(join(root, ".github/workflows/prebuilt-plesk-staging.yml"), "utf8");
    const activator = readFileSync(join(root, "scripts/plesk-activate-prebuilt-pricing-test.sh"), "utf8");
    expect(workflow).toContain("refs/heads/deploy/staging");
    expect(workflow).not.toContain("refs/heads/deploy/pr-preview");
    expect(activator).toContain('BACKUPS="$ROOT/plesk-pricing-test-releases"');
    expect(activator).toContain('PLESK_PR_PREVIEW_DEPLOY=ROLLBACK');
    expect(activator).toContain('(d.get("zoho") or {}).get("writesBlocked") is True');
    expect(activator).toContain('d.get("shaleanAppEnv")=="staging"');
  });

  it("exposes only the effective nonproduction Zoho write policy", () => {
    const health = readFileSync(join(process.cwd(), "app/api/health/environment/route.ts"), "utf8");
    expect(health).toContain("writesBlocked: isZohoBooksWriteBlocked(process.env.SHALEAN_APP_ENV)");
    expect(health).not.toContain("943440851");
    expect(health).not.toContain("927500285");
  });
});
