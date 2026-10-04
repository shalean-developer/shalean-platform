import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const routePath = path.join(
  process.cwd(),
  "app/api/admin/inv-e2e-01d/zoho-repair-dry-run/route.ts",
);

describe("INV-E2E-01D temporary Zoho repair dry-run endpoint", () => {
  const source = fs.readFileSync(routePath, "utf8");

  it("is integration-manage protected and read-only", () => {
    expect(source).toContain('requireAdminPermissionFromRequest(request, "integration.manage")');
    expect(source).toContain('writes_performed: false');
    expect(source).not.toMatch(/\.insert\s*\(/);
    expect(source).not.toMatch(/\.update\s*\(/);
    expect(source).not.toMatch(/\.delete\s*\(/);
    expect(source).not.toMatch(/\.upsert\s*\(/);
  });

  it("hardcodes the audited current Zoho organization and ten-record allowlist", () => {
    expect(source).toContain('organizationId === "927500285"');
    expect(source).toContain('allowlist_count: checks.length');
    expect(source.match(/"[0-9a-f]{8}-[0-9a-f-]{27}"/g)?.length).toBeGreaterThanOrEqual(10);
  });
});
