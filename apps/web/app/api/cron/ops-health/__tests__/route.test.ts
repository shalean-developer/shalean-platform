import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  withCronLock: vi.fn(),
  runProductionHealthScan: vi.fn(),
  buildProductionHealthSummary: vi.fn(),
  logCronRun: vi.fn(),
  logSystemEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

vi.mock("@/lib/cron/cronLock", () => ({
  withCronLock: mocks.withCronLock,
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logCronRun: mocks.logCronRun,
  logSystemEvent: mocks.logSystemEvent,
}));

vi.mock("@/lib/observability/productionHealthMetrics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/observability/productionHealthMetrics")>();
  return {
    ...actual,
    runProductionHealthScan: mocks.runProductionHealthScan,
    buildProductionHealthSummary: mocks.buildProductionHealthSummary,
  };
});

import { POST } from "../route";

function healthySummary(scanLimit = 500) {
  return {
    ok: true as const,
    generatedAt: "2026-05-14T10:00:00.000Z",
    scanLimit,
    findings: [],
    totals: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  };
}

function degradedSummary(scanLimit = 500) {
  return {
    ok: true as const,
    degraded: true,
    generatedAt: "2026-05-14T10:00:00.000Z",
    scanLimit,
    findings: [
      {
        code: "scanner_query_failed",
        severity: "high",
        count: 1,
        message: "One or more Ops Health scanners could not read all required data.",
        sampleIds: ["payment_finalization_jobs"],
        diagnostics: { errors: [{ scanner: "payment_finalization_jobs", message: "failed_jobs unavailable" }] },
      },
    ],
    totals: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
  };
}

function request(path = "http://localhost/api/cron/ops-health?scanLimit=250", token = "secret") {
  return new Request(path, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("POST /api/cron/ops-health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "secret";
    mocks.getSupabaseAdmin.mockReturnValue({ from: vi.fn() });
    mocks.runProductionHealthScan.mockResolvedValue(healthySummary(250));
    mocks.buildProductionHealthSummary.mockReturnValue(degradedSummary(250));
    mocks.logCronRun.mockResolvedValue(undefined);
    mocks.logSystemEvent.mockResolvedValue(undefined);
    mocks.withCronLock.mockImplementation(async (_admin, _opts, fn) => ({
      ok: true,
      skipped: false,
      jobName: "cron:ops-health-metrics",
      ranIt: await fn(),
    }));
  });

  it("requires cron auth", async () => {
    const res = await POST(request("http://localhost/api/cron/ops-health", "wrong"));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized." });
    expect(mocks.runProductionHealthScan).not.toHaveBeenCalled();
  });

  it("uses the cron lock and records metrics by default on success", async () => {
    const res = await POST(request());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.withCronLock).toHaveBeenCalledWith(
      expect.anything(),
      { jobName: "cron:ops-health-metrics", leaseSeconds: 300 },
      expect.any(Function),
    );
    expect(mocks.runProductionHealthScan).toHaveBeenCalledWith(expect.anything(), {
      scanLimit: 250,
      recordMetrics: true,
    });
    expect(mocks.logSystemEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
        source: "cron/ops-health",
        message: "ops_health_scheduled_scan",
      }),
    );
    expect(mocks.logCronRun).toHaveBeenCalledWith(
      expect.objectContaining({
        jobName: "ops-health",
        status: "success",
      }),
    );
    expect(json).toMatchObject({
      ok: true,
      status: "healthy",
      counts: { totalFindings: 0 },
    });
  });

  it("returns skipped when another runner holds the lock", async () => {
    mocks.withCronLock.mockResolvedValueOnce({
      ok: true,
      skipped: true,
      reason: "concurrent_run",
      jobName: "cron:ops-health-metrics",
    });

    const res = await POST(request());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, skipped: true, reason: "concurrent_run" });
    expect(mocks.runProductionHealthScan).not.toHaveBeenCalled();
  });

  it("returns degraded scan summaries without failing the cron route", async () => {
    mocks.runProductionHealthScan.mockResolvedValueOnce(degradedSummary(250));

    const res = await POST(request());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      status: "degraded",
      degraded: true,
      counts: { high: 1, totalFindings: 1 },
      summaries: [{ code: "scanner_query_failed", sampleIds: ["payment_finalization_jobs"] }],
    });
    expect(mocks.logSystemEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "warn",
        source: "cron/ops-health",
      }),
    );
  });

  it("returns a safe degraded response when scanner throws", async () => {
    mocks.runProductionHealthScan.mockRejectedValueOnce(new Error("scanner exploded"));

    const res = await POST(request());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.buildProductionHealthSummary).toHaveBeenCalledWith({
      scanLimit: 250,
      scannerFailures: [{ scanner: "cron_ops_health", message: "scanner exploded" }],
    });
    expect(mocks.logCronRun).toHaveBeenCalledWith(
      expect.objectContaining({
        jobName: "ops-health",
        status: "error",
        message: "[handler] scanner exploded",
      }),
    );
    expect(json).toMatchObject({
      ok: true,
      status: "degraded",
      summaries: [{ code: "scanner_query_failed" }],
    });
  });
});
