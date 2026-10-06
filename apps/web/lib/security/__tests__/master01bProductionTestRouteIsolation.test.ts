import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { isProductionTestRouteBlocked } from "@/lib/security/productionTestRouteGuard";

const root = resolve(process.cwd());

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

describe("MASTER-01B-01 production test-route isolation", () => {
  it("blocks every governed production identity", () => {
    expect(
      isProductionTestRouteBlocked("https://internal.invalid/api/test", {
        SHALEAN_APP_ENV: "production",
      }),
    ).toBe(true);

    expect(
      isProductionTestRouteBlocked("https://shalean.co.za/api/test", {
        SHALEAN_APP_ENV: "staging",
        NODE_ENV: "production",
      }),
    ).toBe(true);

    expect(
      isProductionTestRouteBlocked("https://www.shalean.com/api/test", {
        SHALEAN_APP_ENV: "development",
      }),
    ).toBe(true);
  });

  it("keeps compiled staging test tooling available without trusting NODE_ENV", () => {
    expect(
      isProductionTestRouteBlocked("https://pricing-test.shalean.co.za/api/test", {
        SHALEAN_APP_ENV: "staging",
        NODE_ENV: "production",
      }),
    ).toBe(false);
  });

  it("fails closed when the request origin cannot be parsed", () => {
    expect(
      isProductionTestRouteBlocked("not-a-valid-url", {
        SHALEAN_APP_ENV: "staging",
      }),
    ).toBe(true);
  });

  it("guards all real-write test routes before secrets or side effects", () => {
    const cases = [
      {
        path: "app/api/test/create-booking/route.ts",
        sensitive: "loadTestSecret()",
      },
      {
        path: "app/api/test/whatsapp-meta-direct/route.ts",
        sensitive: "process.env.WHATSAPP_TEST_SEND_SECRET",
      },
      {
        path: "app/api/test/whatsapp-send/route.ts",
        sensitive: "process.env.WHATSAPP_TEST_SEND_SECRET",
      },
      {
        path: "app/api/test-email/route.ts",
        sensitive: "authorize(request)",
      },
    ] as const;

    for (const item of cases) {
      const source = read(item.path);
      const guard = source.indexOf("isProductionTestRouteBlocked(request.url)");
      const sensitive = source.indexOf(item.sensitive);

      expect(guard, item.path).toBeGreaterThanOrEqual(0);
      expect(sensitive, item.path).toBeGreaterThan(guard);
      expect(source, item.path).toContain('status: 404');
    }
  });

  it("does not let the cron credential authorize test email", () => {
    const source = read("app/api/test-email/route.ts");
    expect(source).not.toContain("CRON_SECRET");
    expect(source).toContain("EMAIL_TEST_SECRET");
  });

  it("removes the legacy production load-test override", () => {
    const source = read("app/api/test/create-booking/route.ts");
    expect(source).not.toContain("ENABLE_DISPATCH_LOAD_TEST");
  });
});
