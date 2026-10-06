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
  it("uses one atomic RPC for client and global limits", async () => {
    const { admin, rpc } = adminWithRpc(async () => ({
      data: [{
        allowed: true,
        reason: null,
        retry_after_seconds: 0,
        client_request_count: 1,
        global_request_count: 1,
      }],
      error: null,
    }));

    await expect(
      checkPromotionTelemetryRateLimit(admin, request("203.0.113.10")),
    ).resolves.toEqual({ allowed: true });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]?.[0]).toBe("consume_promotion_telemetry_limits");
    const args = rpc.mock.calls[0]?.[1] ?? {};
    const clientKey = String(args.p_client_rate_key ?? "");
    expect(clientKey).toMatch(/^client:[0-9a-f]{64}$/);
    expect(clientKey).not.toContain("203.0.113.10");
    expect(args).toMatchObject({
      p_client_limit: 60,
      p_global_limit: 600,
      p_window_seconds: 60,
    });
  });

  it("retries transient lock contention outside the database", async () => {
    let call = 0;
    const { admin, rpc } = adminWithRpc(async () => {
      call += 1;
      if (call === 1) {
        return {
          data: [{
            allowed: false,
            reason: "busy",
            retry_after_seconds: 1,
            client_request_count: 0,
            global_request_count: 0,
          }],
          error: null,
        };
      }
      return {
        data: [{
          allowed: true,
          reason: null,
          retry_after_seconds: 0,
          client_request_count: 1,
          global_request_count: 1,
        }],
        error: null,
      };
    });

    await expect(
      checkPromotionTelemetryRateLimit(admin, request("203.0.113.10")),
    ).resolves.toEqual({ allowed: true });

    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("fails closed if the atomic limiter RPC is unavailable", async () => {
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

  it("returns client saturation from the atomic RPC", async () => {
    const { admin, rpc } = adminWithRpc(async () => ({
      data: [{
        allowed: false,
        reason: "client",
        retry_after_seconds: 11,
        client_request_count: 60,
        global_request_count: 599,
      }],
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
  });

  it("returns global saturation from the atomic RPC", async () => {
    const { admin, rpc } = adminWithRpc(async () => ({
      data: [{
        allowed: false,
        reason: "global",
        retry_after_seconds: 17,
        client_request_count: null,
        global_request_count: 600,
      }],
      error: null,
    }));

    await expect(
      checkPromotionTelemetryRateLimit(admin, request("203.0.113.10")),
    ).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 17,
      reason: "global",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
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

  it("rate-limits public offer landing telemetry before recording", () => {
    const source = readFileSync(
      resolve(root, "app/(marketing)/offers/[slug]/page.tsx"),
      "utf8",
    );

    const limiter = source.indexOf("await checkPromotionTelemetryRateLimit(");
    const write = source.indexOf("await recordPromotionEvent(admin");

    expect(limiter).toBeGreaterThanOrEqual(0);
    expect(write).toBeGreaterThan(limiter);
    expect(source).toContain("if (limit.allowed)");
    expect(source).toContain("headers()");
  });

  it("uses one atomic service-role-only database limiter contract", () => {
    const originalSql = readFileSync(
      resolve(
        root,
        "../../supabase/migrations/20261006144500_master_01c_01_promotion_telemetry_rate_limit.sql",
      ),
      "utf8",
    ).toLowerCase();
    const atomicSql = readFileSync(
      resolve(
        root,
        "../../supabase/migrations/20261006173500_master_01c_01_atomic_promotion_telemetry_limit.sql",
      ),
      "utf8",
    ).toLowerCase();

    expect(originalSql).toContain("promotion_telemetry_rate_limit_buckets");
    expect(atomicSql).toContain("consume_promotion_telemetry_limits");
    expect(atomicSql).toContain("pg_try_advisory_xact_lock");
    expect(atomicSql).not.toContain("perform pg_advisory_xact_lock");
    expect(atomicSql).toContain("fast reject already-saturated global traffic before taking the advisory");
    expect(atomicSql).toContain("recheck global");
    expect(atomicSql).toContain("saturation under the lock before touching any client bucket");

    const globalFastReject = atomicSql.indexOf(
      "fast reject already-saturated global traffic before taking the advisory",
    );
    const clientFastReject = atomicSql.indexOf(
      "fast reject an already-saturated client before taking the advisory",
    );
    const lock = atomicSql.indexOf("pg_try_advisory_xact_lock");
    const lockedGlobalRecheck = atomicSql.indexOf(
      "saturation under the lock before touching any client bucket",
    );
    const lockedClientRecheck = atomicSql.indexOf(
      "refresh the client snapshot under the same lock before any mutation",
    );

    expect(globalFastReject).toBeGreaterThanOrEqual(0);
    expect(clientFastReject).toBeGreaterThan(globalFastReject);
    expect(lock).toBeGreaterThan(clientFastReject);
    expect(lockedGlobalRecheck).toBeGreaterThan(lock);
    expect(lockedClientRecheck).toBeGreaterThan(lockedGlobalRecheck);
    expect(atomicSql).toContain("both buckets have capacity under the same transaction lock");
    expect(atomicSql).toContain(
      "revoke all on function public.consume_promotion_telemetry_limits",
    );
    expect(atomicSql).toContain("from public, anon, authenticated");
    expect(atomicSql).toContain(
      "grant execute on function public.consume_promotion_telemetry_limits",
    );
    expect(atomicSql).toContain("to service_role");
    expect(atomicSql).toContain(
      "create or replace function public.consume_promotion_telemetry_rate_limit",
    );
    expect(atomicSql).toContain(
      "rolling-deploy compatibility: old runtimes call the legacy rpc twice",
    );
    expect(atomicSql).toContain(
      "making the global call read-only and delegating the client call to the new",
    );
    expect(atomicSql).toContain(
      "client rejection cannot consume global quota",
    );
    expect(atomicSql).toContain(
      "from public.consume_promotion_telemetry_limits(",
    );
    expect(atomicSql).toContain(
      "old runtimes cannot interpret the new 'busy' reason",
    );
    expect(atomicSql).toContain("for v_count in 0..3 loop");
    expect(atomicSql).toContain("perform pg_sleep(");
  });

  it("runs web-test when the governed telemetry migration changes", () => {
    const workflow = readFileSync(
      resolve(root, "../../.github/workflows/web-test.yml"),
      "utf8",
    );

    expect(workflow).toContain(
      "supabase/migrations/20261006144500_master_01c_01_promotion_telemetry_rate_limit\\.sql$",
    );
    expect(workflow).toContain(
      "supabase/migrations/20261006173500_master_01c_01_atomic_promotion_telemetry_limit\\.sql$",
    );
  });

  it("does not rely on process-local maps for the production boundary", () => {
    const source = readFileSync(
      resolve(root, "lib/rateLimit/promotionTelemetryRateLimit.ts"),
      "utf8",
    );
    expect(source).not.toContain("new Map");
    expect(source).not.toContain("sweepExpiredBuckets");
    expect(source).toContain('admin.rpc("consume_promotion_telemetry_limits"');
    expect(source).toContain('typed.reason === "busy"');
    expect(source).toContain("BUSY_RETRY_DELAYS_MS");
    expect(source).not.toContain('admin.from("promotion_telemetry_rate_limit_buckets")');
  });
});
