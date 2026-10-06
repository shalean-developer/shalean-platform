import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { checkPromotionTelemetryRateLimit } from "@/lib/rateLimit/promotionTelemetryRateLimit";

const root = resolve(process.cwd());

function request(ip: string): Request {
  return new Request("https://shalean.co.za/api/promotions", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

function adminWithRpc(
  impl: (args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: unknown;
  }>,
): { admin: SupabaseClient; rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => impl(args));
  return { admin: { rpc } as unknown as SupabaseClient, rpc };
}

describe("MASTER-01C-01 promotion telemetry service-role abuse boundary", () => {
  it("consumes shared global and hashed-client buckets", async () => {
    const { admin, rpc } = adminWithRpc(async () => ({
      data: [{ allowed: true, retry_after_seconds: 0, request_count: 1 }],
      error: null,
    }));

    await expect(
      checkPromotionTelemetryRateLimit(admin, request("203.0.113.10")),
    ).resolves.toEqual({ allowed: true });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]?.[0]).toBe("consume_promotion_telemetry_rate_limit");
    const clientKey = String(rpc.mock.calls[0]?.[1]?.p_rate_key ?? "");
    expect(clientKey).toMatch(/^client:[0-9a-f]{64}$/);
    expect(clientKey).not.toContain("203.0.113.10");
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      p_limit: 60,
      p_window_seconds: 60,
    });

    expect(rpc.mock.calls[1]?.[1]).toMatchObject({
      p_rate_key: "global",
      p_limit: 600,
      p_window_seconds: 60,
    });
  });

  it("fails closed if shared rate-limit state is unavailable", async () => {
    const { admin, rpc } = adminWithRpc(async () => ({
      data: null,
      error: { message: "db unavailable" },
    }));

    await expect(
      checkPromotionTelemetryRateLimit(admin, request("203.0.113.10")),
    ).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 60,
      reason: "unavailable",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("stops at the client bucket without consuming global quota", async () => {
    const { admin, rpc } = adminWithRpc(async () => ({
      data: [{ allowed: false, retry_after_seconds: 11, request_count: 61 }],
      error: null,
    }));

    await expect(
      checkPromotionTelemetryRateLimit(admin, request("203.0.113.10")),
    ).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 11,
      reason: "client",
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(String(rpc.mock.calls[0]?.[1]?.p_rate_key ?? "")).toMatch(
      /^client:[0-9a-f]{64}$/,
    );
  });

  it("checks global quota only after the client bucket is allowed", async () => {
    let call = 0;
    const { admin, rpc } = adminWithRpc(async () => {
      call += 1;
      if (call === 1) {
        return {
          data: [{ allowed: true, retry_after_seconds: 0, request_count: 1 }],
          error: null,
        };
      }
      return {
        data: [{ allowed: false, retry_after_seconds: 17, request_count: 601 }],
        error: null,
      };
    });

    await expect(
      checkPromotionTelemetryRateLimit(admin, request("203.0.113.10")),
    ).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 17,
      reason: "global",
    });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(String(rpc.mock.calls[0]?.[1]?.p_rate_key ?? "")).toMatch(
      /^client:[0-9a-f]{64}$/,
    );
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({
      p_rate_key: "global",
      p_limit: 600,
      p_window_seconds: 60,
    });
  });

  it("validates payload, consumes shared limits, then records telemetry", () => {
    const source = readFileSync(
      resolve(root, "app/api/promotions/route.ts"),
      "utf8",
    );
    const postStart = source.indexOf("export async function POST");
    expect(postStart).toBeGreaterThanOrEqual(0);

    const postSource = source.slice(postStart);
    const validation = postSource.indexOf("UUID_PATTERN.test(body.promotionId)");
    const admin = postSource.indexOf("const admin = getSupabaseAdmin()");
    const limiter = postSource.indexOf(
      "await checkPromotionTelemetryRateLimit(admin, request)",
    );
    const write = postSource.indexOf("await recordPromotionEvent(admin");

    expect(validation).toBeGreaterThanOrEqual(0);
    expect(admin).toBeGreaterThan(validation);
    expect(limiter).toBeGreaterThan(admin);
    expect(write).toBeGreaterThan(limiter);

    expect(postSource).toContain("MAX_SESSION_ID_LENGTH");
    expect(postSource).toContain("promotionTelemetryRateLimitResponse(limit)");
  });

  it("uses an atomic service-role-only database rate-limit contract", () => {
    const sql = readFileSync(
      resolve(
        root,
        "../../supabase/migrations/20261006144500_master_01c_01_promotion_telemetry_rate_limit.sql",
      ),
      "utf8",
    ).toLowerCase();

    expect(sql).toContain("promotion_telemetry_rate_limit_buckets");
    expect(sql).toContain(
      "create index if not exists promotion_telemetry_rate_limit_client_updated_idx",
    );
    expect(sql).toContain("on public.promotion_telemetry_rate_limit_buckets (updated_at)");
    expect(sql).toContain("where rate_key like 'client:%'");
    expect(sql).toContain(
      "insert into public.promotion_telemetry_rate_limit_buckets as bucket",
    );
    expect(sql).toContain("on conflict (rate_key) do nothing");
    expect(sql).toContain(
      "returning bucket.window_started_at, bucket.request_count",
    );
    expect(sql).toContain("bucket.request_count < p_limit");
    expect(sql).toContain("and v_count >= p_limit then");
    expect(sql).toContain("fast reject path");
    expect(sql).not.toContain("on conflict (rate_key) do update");
    expect(sql).toContain("consume_promotion_telemetry_rate_limit");
    expect(sql).toContain(
      "revoke all on function public.consume_promotion_telemetry_rate_limit",
    );
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.consume_promotion_telemetry_rate_limit");
    expect(sql).toContain("to service_role");
  });

  it("runs web-test when the governed telemetry migration changes", () => {
    const workflow = readFileSync(
      resolve(root, "../../.github/workflows/web-test.yml"),
      "utf8",
    );

    expect(workflow).toContain(
      "supabase/migrations/20261006144500_master_01c_01_promotion_telemetry_rate_limit\\.sql$",
    );
  });

  it("does not rely on process-local maps for the production boundary", () => {
    const source = readFileSync(
      resolve(root, "lib/rateLimit/promotionTelemetryRateLimit.ts"),
      "utf8",
    );
    expect(source).not.toContain("new Map");
    expect(source).not.toContain("sweepExpiredBuckets");
    expect(source).toContain('admin.rpc("consume_promotion_telemetry_rate_limit"');
  });
});
