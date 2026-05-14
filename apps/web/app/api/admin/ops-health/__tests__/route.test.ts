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

import { GET, POST } from "../route";

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
        diagnostics: {
          errors: [{ scanner: "payment_finalization_jobs", message: "failed_jobs unavailable" }],
        },
      },
    ],
    totals: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
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
      acknowledgedSummaries: [],
      acknowledgements: [],
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
      counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, totalFindings: 0, acknowledgedHidden: 0 },
      summaries: [],
      acknowledgedSummaries: [],
      acknowledgements: [],
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

  it("returns degraded status when scanner reports partial query failure", async () => {
    mocks.runProductionHealthScan.mockResolvedValueOnce(degradedSummary(200));

    const res = await GET(new Request("http://localhost/api/admin/ops-health?scanLimit=200"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      status: "degraded",
      degraded: true,
      lastScan: { scanLimit: 200, degraded: true },
      counts: { high: 1, totalFindings: 1, acknowledgedHidden: 0 },
      sampleIds: { scanner_query_failed: ["payment_finalization_jobs"] },
    });
    expect(json.summaries[0]).toMatchObject({
      code: "scanner_query_failed",
      diagnostics: {
        errors: [{ scanner: "payment_finalization_jobs", message: "failed_jobs unavailable" }],
      },
    });
  });

  it("keeps healthy empty scans healthy", async () => {
    mocks.runProductionHealthScan.mockResolvedValueOnce(healthySummary(25));

    const res = await GET(new Request("http://localhost/api/admin/ops-health?scanLimit=25"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      status: "healthy",
      degraded: false,
      lastScan: { scanLimit: 25, degraded: false },
      summaries: [],
      acknowledgedSummaries: [],
    });
  });

  it("hides acknowledged findings by default and can include them", async () => {
    mocks.runProductionHealthScan.mockResolvedValue(criticalSummary(200));
    const ackRow = {
      created_at: "2026-05-14T11:00:00.000Z",
      context: {
        key: "payment_verified_not_finalized:job-1|job-2",
        code: "payment_verified_not_finalized",
        sampleIds: ["job-1", "job-2"],
        status: "acknowledged",
        operatorEmail: "admin@example.com",
      },
    };
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: [ackRow], error: null }),
            })),
          })),
        })),
      })),
    };
    mocks.getSupabaseAdmin.mockReturnValue(admin);

    const hiddenRes = await GET(new Request("http://localhost/api/admin/ops-health?scanLimit=200"));
    const hidden = await hiddenRes.json();
    expect(hidden).toMatchObject({
      status: "healthy",
      counts: { critical: 0, totalFindings: 0, acknowledgedHidden: 2 },
      summaries: [],
      acknowledgedSummaries: [{ code: "payment_verified_not_finalized" }],
    });

    const shownRes = await GET(new Request("http://localhost/api/admin/ops-health?scanLimit=200&includeAcknowledged=1"));
    const shown = await shownRes.json();
    expect(shown).toMatchObject({
      status: "critical",
      counts: { critical: 2, totalFindings: 2, acknowledgedHidden: 2 },
      summaries: [{ code: "payment_verified_not_finalized", diagnostics: { acknowledged: true } }],
    });
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
      acknowledgedSummaries: [],
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

  it("persists acknowledgement actions with admin identity", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const admin = { from: vi.fn(() => ({ insert })) };
    mocks.getSupabaseAdmin.mockReturnValueOnce(admin);

    const res = await POST(
      new Request("http://localhost/api/admin/ops-health", {
        method: "POST",
        headers: { authorization: "Bearer token", "content-type": "application/json" },
        body: JSON.stringify({
          code: "payment_verified_not_finalized",
          sampleIds: ["job-1", "job-2"],
          status: "acknowledged",
          note: "Historical payment incident under review.",
        }),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      acknowledgement: {
        key: "payment_verified_not_finalized:job-1|job-2",
        code: "payment_verified_not_finalized",
        sampleIds: ["job-1", "job-2"],
        status: "acknowledged",
        note: "Historical payment incident under review.",
        operatorId: "admin-1",
        operatorEmail: "admin@example.com",
      },
    });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "ops_health_acknowledgement",
        message: "ops_health_finding_acknowledged",
        context: expect.objectContaining({
          operatorId: "admin-1",
          operatorEmail: "admin@example.com",
        }),
      }),
    );
  });
});
