import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdminSession: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  runProductionHealthScan: vi.fn(),
  buildProductionHealthSummary: vi.fn(),
  recordProductionHealthSummaryMetrics: vi.fn(),
}));

vi.mock("@/lib/admin/requireAdminSession", () => ({
  requireAdminSession: mocks.requireAdminSession,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

vi.mock("@/lib/observability/productionHealthMetrics", () => ({
  runProductionHealthScan: mocks.runProductionHealthScan,
  buildProductionHealthSummary: mocks.buildProductionHealthSummary,
  recordProductionHealthSummaryMetrics: mocks.recordProductionHealthSummaryMetrics,
}));

import { GET } from "../route";

function healthySummary(scanLimit = 500) {
  return {
    ok: true as const,
    generatedAt: "2026-05-14T10:00:00.000Z",
    scanLimit,
    findings: [],
    totals: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  };
}

function criticalSummary(scanLimit = 500) {
  return {
    ok: true as const,
    generatedAt: "2026-05-14T10:00:00.000Z",
    scanLimit,
    findings: [
      {
        code: "payment_verified_not_finalized",
        severity: "critical",
        count: 2,
        message: "Verified Paystack payment has an unresolved finalization/reconciliation job.",
        sampleIds: ["job-1", "job-2"],
      },
    ],
    totals: { critical: 2, high: 0, medium: 0, low: 0, info: 0 },
  };
}

describe("GET /api/admin/ops-health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminSession.mockResolvedValue({
      ok: true,
      user: { id: "admin-1", email: "admin@example.com" },
    });
    mocks.getSupabaseAdmin.mockReturnValue({ from: vi.fn() });
    mocks.runProductionHealthScan.mockResolvedValue(healthySummary());
    mocks.buildProductionHealthSummary.mockReturnValue(healthySummary());
    mocks.recordProductionHealthSummaryMetrics.mockResolvedValue(undefined);
  });

  it("requires admin auth", async () => {
    mocks.requireAdminSession.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    });

    const res = await GET(new Request("http://localhost/api/admin/ops-health"));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden." });
    expect(mocks.runProductionHealthScan).not.toHaveBeenCalled();
  });

  it("clamps bounded scan params and can record metrics by explicit param", async () => {
    mocks.runProductionHealthScan.mockResolvedValueOnce(healthySummary(5000));

    const res = await GET(new Request("http://localhost/api/admin/ops-health?scanLimit=999999&recordMetrics=1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.runProductionHealthScan).toHaveBeenCalledWith(expect.anything(), {
      scanLimit: 5000,
      recordMetrics: true,
    });
    expect(json).toMatchObject({
      ok: true,
      status: "healthy",
      degraded: false,
      counts: { critical: 0, high: 0, medium: 0, low: 0, totalFindings: 0 },
      lastScan: { scanLimit: 5000, metricsRecorded: true },
      summaries: [],
      sampleIds: {},
    });
  });

  it("returns an empty healthy response", async () => {
    const res = await GET(new Request("http://localhost/api/admin/ops-health"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      status: "healthy",
      degraded: false,
      generatedAt: "2026-05-14T10:00:00.000Z",
      lastScan: {
        source: "production_health",
        scanLimit: 500,
        metricsRecorded: false,
        degraded: false,
      },
      counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, totalFindings: 0 },
      summaries: [],
      sampleIds: {},
    });
  });

  it("returns critical drift response with scanner summaries and sample ids", async () => {
    mocks.runProductionHealthScan.mockResolvedValueOnce(criticalSummary());

    const res = await GET(new Request("http://localhost/api/admin/ops-health?scanLimit=200"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      status: "critical",
      degraded: false,
      counts: { critical: 2, high: 0, medium: 0, low: 0, info: 0, totalFindings: 2 },
      sampleIds: { payment_verified_not_finalized: ["job-1", "job-2"] },
    });
    expect(json.summaries).toHaveLength(1);
  });

  it("returns a safe degraded response when scanner throws", async () => {
    mocks.runProductionHealthScan.mockRejectedValueOnce(new Error("scanner exploded"));
    mocks.buildProductionHealthSummary.mockReturnValueOnce(healthySummary(50));

    const res = await GET(new Request("http://localhost/api/admin/ops-health?scanLimit=50&recordMetrics=1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.recordProductionHealthSummaryMetrics).toHaveBeenCalledWith(expect.objectContaining({ scanLimit: 50 }));
    expect(json).toMatchObject({
      ok: true,
      status: "degraded",
      degraded: true,
      error: "scanner exploded",
      lastScan: { scanLimit: 50, metricsRecorded: true, degraded: true },
      counts: { totalFindings: 0 },
      summaries: [],
      sampleIds: {},
    });
  });

  it("returns a safe degraded response when Supabase admin is unavailable", async () => {
    mocks.getSupabaseAdmin.mockReturnValueOnce(null);
    mocks.buildProductionHealthSummary.mockReturnValueOnce(healthySummary(10));

    const res = await GET(new Request("http://localhost/api/admin/ops-health?scanLimit=10"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.runProductionHealthScan).not.toHaveBeenCalled();
    expect(json).toMatchObject({
      ok: true,
      status: "degraded",
      degraded: true,
      error: "Server configuration error.",
      lastScan: { scanLimit: 10 },
    });
  });
});
