import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetPromotionTelemetryRateLimit,
  checkPromotionTelemetryRateLimit,
} from "@/lib/rateLimit/promotionTelemetryRateLimit";

const root = resolve(process.cwd());

function request(ip: string): Request {
  return new Request("https://shalean.co.za/api/promotions", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

describe("MASTER-01C-01 promotion telemetry service-role abuse boundary", () => {
  beforeEach(() => {
    __resetPromotionTelemetryRateLimit();
  });

  it("rate-limits repeated anonymous telemetry from one IP", () => {
    for (let i = 0; i < 60; i += 1) {
      expect(checkPromotionTelemetryRateLimit(request("203.0.113.10"))).toEqual({
        allowed: true,
      });
    }

    const blocked = checkPromotionTelemetryRateLimit(request("203.0.113.10"));
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("isolates rate-limit buckets by client IP", () => {
    for (let i = 0; i < 60; i += 1) {
      checkPromotionTelemetryRateLimit(request("203.0.113.10"));
    }

    expect(checkPromotionTelemetryRateLimit(request("203.0.113.11"))).toEqual({
      allowed: true,
    });
  });

  it("runs abuse control and payload validation before service-role access", () => {
    const source = readFileSync(
      resolve(root, "app/api/promotions/route.ts"),
      "utf8",
    );
    const postStart = source.indexOf("export async function POST");
    expect(postStart).toBeGreaterThanOrEqual(0);

    const postSource = source.slice(postStart);
    const limiter = postSource.indexOf("checkPromotionTelemetryRateLimit(request)");
    const admin = postSource.indexOf("const admin = getSupabaseAdmin()");
    expect(limiter).toBeGreaterThanOrEqual(0);
    expect(admin).toBeGreaterThan(limiter);

    expect(postSource).toContain("UUID_PATTERN.test(body.promotionId)");
    expect(postSource).toContain("MAX_SESSION_ID_LENGTH");
    expect(postSource).toContain('status: 400');
    expect(postSource).toContain("promotionTelemetryRateLimitResponse(limit)");
  });
});
