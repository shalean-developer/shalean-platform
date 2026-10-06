import { readFileSync, readdirSync } from "node:fs";
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

  it("fails closed when a later migration touches the approved limiter contract", () => {
    const migrationsDir = resolve(root, "../../supabase/migrations");
    const migrationFiles = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort();

    const originalName =
      "20261006144500_master_01c_01_promotion_telemetry_rate_limit.sql";
    const atomicName =
      "20261006173500_master_01c_01_atomic_promotion_telemetry_limit.sql";

    const originalIndex = migrationFiles.indexOf(originalName);
    const atomicIndex = migrationFiles.indexOf(atomicName);

    expect(originalIndex).toBeGreaterThanOrEqual(0);
    expect(atomicIndex).toBeGreaterThan(originalIndex);

    const originalSql = readFileSync(
      resolve(migrationsDir, originalName),
      "utf8",
    ).toLowerCase();
    const atomicSql = readFileSync(
      resolve(migrationsDir, atomicName),
      "utf8",
    ).toLowerCase();

    expect(originalSql).toContain("promotion_telemetry_rate_limit_buckets");
    expect(atomicSql).toContain(
      "create or replace function public.consume_promotion_telemetry_limits(",
    );
    expect(atomicSql).toContain(
      "create or replace function public.consume_promotion_telemetry_rate_limit(",
    );

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
    const mutations = atomicSql.indexOf(
      "both buckets have capacity under the same transaction lock",
    );

    expect(globalFastReject).toBeGreaterThanOrEqual(0);
    expect(clientFastReject).toBeGreaterThan(globalFastReject);
    expect(lock).toBeGreaterThan(clientFastReject);
    expect(lockedGlobalRecheck).toBeGreaterThan(lock);
    expect(lockedClientRecheck).toBeGreaterThan(lockedGlobalRecheck);
    expect(mutations).toBeGreaterThan(lockedClientRecheck);

    expect(atomicSql).toContain(
      "revoke all on function public.consume_promotion_telemetry_limits",
    );
    expect(atomicSql).toContain(
      "grant execute on function public.consume_promotion_telemetry_limits",
    );
    expect(atomicSql).toContain(
      "revoke all on function public.consume_promotion_telemetry_rate_limit",
    );
    expect(atomicSql).toContain(
      "grant execute on function public.consume_promotion_telemetry_rate_limit",
    );
    expect(atomicSql).toContain("from public, anon, authenticated");
    expect(atomicSql).toContain("to service_role");

    expect(atomicSql).toContain(
      "making the global call read-only and delegating the client call to the new",
    );
    expect(atomicSql).toContain(
      "from public.consume_promotion_telemetry_limits(",
    );
    expect(atomicSql).toContain(
      "old runtimes cannot interpret the new 'busy' reason",
    );
    expect(atomicSql).toContain("for v_count in 0..3 loop");
    expect(atomicSql).toContain("perform pg_sleep(");

    const protectedTerms = [
      "consume_promotion_telemetry_limits",
      "consume_promotion_telemetry_rate_limit",
      "promotion_telemetry_rate_limit_buckets",
    ];
    const sensitivePrivilegePatterns = [
      /\b(?:grant|revoke)\b[\s\S]*?\bon\s+all\s+(?:functions|routines)\s+in\s+schema\s+"?public"?\b/i,
      /\b(?:grant|revoke)\b[\s\S]*?\bon\s+all\s+tables\s+in\s+schema\s+"?public"?\b/i,
      /\balter\s+default\s+privileges\b[\s\S]*?\b(?:functions|routines|tables)\b/i,
      /\bgrant\s+["a-z0-9_]+["]?\s+to\s+(?:"?(?:anon|authenticated|service_role)"?)\b/i,
      /\brevoke\s+["a-z0-9_]+["]?\s+from\s+(?:"?(?:anon|authenticated|service_role)"?)\b/i,
    ];

    const laterTouches = migrationFiles
      .slice(atomicIndex + 1)
      .map((name) => ({
        name,
        sql: readFileSync(resolve(migrationsDir, name), "utf8").toLowerCase(),
      }))
      .filter(
        ({ sql }) =>
          protectedTerms.some((term) => sql.includes(term)) ||
          sensitivePrivilegePatterns.some((pattern) => pattern.test(sql)),
      )
      .map(({ name }) => name);

    expect(laterTouches).toEqual([]);
  });

  it("runs web-test for every forward migration change", () => {
    const workflow = readFileSync(
      resolve(root, "../../.github/workflows/web-test.yml"),
      "utf8",
    );

    expect(workflow).toContain("supabase/migrations/");
    expect(workflow).not.toContain(
      "supabase/migrations/20261006144500_master_01c_01_promotion_telemetry_rate_limit\\.sql$",
    );
    expect(workflow).not.toContain(
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
