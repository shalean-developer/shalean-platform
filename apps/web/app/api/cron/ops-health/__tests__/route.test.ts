import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  withCronLock: vi.fn(),
  runProductionHealthScan: vi.fn(),
  buildProductionHealthSummary: vi.fn(),
  logCronRun: vi.fn(),
  logSystemEvent: vi.fn(),
  listOpsHealthAcknowledgements: vi.fn(),
  selectOpsHealthAlertCandidatesSafe: vi.fn(),
  recordOpsHealthAlertCooldownMarker: vi.fn(),
  postDispatchControlAlert: vi.fn(),
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

vi.mock("@/lib/observability/opsHealthAcknowledgements", () => ({
  listOpsHealthAcknowledgements: mocks.listOpsHealthAcknowledgements,
}));

vi.mock("@/lib/observability/opsHealthAlerts", () => ({
  selectOpsHealthAlertCandidatesSafe: mocks.selectOpsHealthAlertCandidatesSafe,
  recordOpsHealthAlertCooldownMarker: mocks.recordOpsHealthAlertCooldownMarker,
}));

vi.mock("@/lib/ops/dispatchControlWebhook", () => ({
  postDispatchControlAlert: mocks.postDispatchControlAlert,
}));

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

function criticalSummary(scanLimit = 500) {
  return {
    ok: true as const,
    generatedAt: "2026-05-14T10:00:00.000Z",
    scanLimit,
    findings: [
      {
        code: "payment_verified_not_finalized",
        severity: "critical",
        count: 1,
        message: "Verified payment was not finalized.",
        sampleIds: ["failed-job-1"],
      },
    ],
    totals: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
  };
}

function alertCandidate() {
  return {
    code: "payment_verified_not_finalized",
    severity: "critical",
    count: 1,
    message: "Verified payment has not finalized into booking settlement.",
    sampleIds: ["failed-job-1"],
    findingKey: "payment_verified_not_finalized:failed-job-1",
    cooldownKey: "payment_verified_not_finalized",
    cooldownMinutes: 15,
    payload: {
      kind: "ops_health_alert",
      code: "payment_verified_not_finalized",
      severity: "critical",
      count: 1,
      message: "Verified payment has not finalized into booking settlement.",
      sampleIds: ["failed-job-1"],
      findingKey: "payment_verified_not_finalized:failed-job-1",
      cooldownKey: "payment_verified_not_finalized",
      generatedAt: "2026-05-14T10:00:00.000Z",
    },
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
    delete process.env.OPS_HEALTH_ALERTS_ENABLED;
    mocks.getSupabaseAdmin.mockReturnValue({ from: vi.fn() });
    mocks.runProductionHealthScan.mockResolvedValue(healthySummary(250));
    mocks.buildProductionHealthSummary.mockReturnValue(degradedSummary(250));
    mocks.logCronRun.mockResolvedValue(undefined);
    mocks.logSystemEvent.mockResolvedValue(undefined);
    mocks.listOpsHealthAcknowledgements.mockResolvedValue([]);
    mocks.selectOpsHealthAlertCandidatesSafe.mockResolvedValue({ ok: true, candidates: [], suppressed: [], errors: [] });
    mocks.recordOpsHealthAlertCooldownMarker.mockResolvedValue({ ok: true });
    mocks.postDispatchControlAlert.mockResolvedValue(undefined);
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
      alerts: { enabled: false, candidates: 0, sent: 0, suppressed: 0, errors: [] },
    });
  });

  it("does not evaluate or send Ops Health alerts when the feature flag is off", async () => {
    mocks.runProductionHealthScan.mockResolvedValueOnce(criticalSummary(250));

    const res = await POST(request());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      status: "critical",
      alerts: { enabled: false, candidates: 0, sent: 0, suppressed: 0, errors: [] },
    });
    expect(mocks.listOpsHealthAcknowledgements).not.toHaveBeenCalled();
    expect(mocks.selectOpsHealthAlertCandidatesSafe).not.toHaveBeenCalled();
    expect(mocks.postDispatchControlAlert).not.toHaveBeenCalled();
    expect(mocks.recordOpsHealthAlertCooldownMarker).not.toHaveBeenCalled();
  });

  it("sends alert candidates when the feature flag is on", async () => {
    process.env.OPS_HEALTH_ALERTS_ENABLED = "true";
    const candidate = alertCandidate();
    mocks.runProductionHealthScan.mockResolvedValueOnce(criticalSummary(250));
    mocks.selectOpsHealthAlertCandidatesSafe.mockResolvedValueOnce({
      ok: true,
      candidates: [candidate],
      suppressed: [],
      errors: [],
    });

    const res = await POST(request());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.listOpsHealthAcknowledgements).toHaveBeenCalledWith(expect.anything());
    expect(mocks.selectOpsHealthAlertCandidatesSafe).toHaveBeenCalledWith(expect.anything(), criticalSummary(250), {
      acknowledgements: [],
    });
    expect(mocks.postDispatchControlAlert).toHaveBeenCalledWith(
      {
        errorType: "ops_health_payment_verified_not_finalized",
        message: "[Ops Health] CRITICAL payment_verified_not_finalized: Verified payment has not finalized into booking settlement.",
        dedupeKey: "ops_health:payment_verified_not_finalized",
        dedupeWindowMinutes: 15,
        extra: candidate.payload,
      },
      { supabase: expect.anything() },
    );
    expect(mocks.recordOpsHealthAlertCooldownMarker).toHaveBeenCalledWith(expect.anything(), candidate);
    expect(json.alerts).toEqual({ enabled: true, candidates: 1, sent: 1, suppressed: 0, errors: [] });
  });

  it("suppresses acknowledged findings through the alert policy selection", async () => {
    process.env.OPS_HEALTH_ALERTS_ENABLED = "true";
    const ack = {
      key: "payment_verified_not_finalized:failed-job-1",
      code: "payment_verified_not_finalized",
      sampleIds: ["failed-job-1"],
      status: "acknowledged",
      createdAt: "2026-05-14T10:05:00.000Z",
    };
    mocks.runProductionHealthScan.mockResolvedValueOnce(criticalSummary(250));
    mocks.listOpsHealthAcknowledgements.mockResolvedValueOnce([ack]);
    mocks.selectOpsHealthAlertCandidatesSafe.mockResolvedValueOnce({
      ok: true,
      candidates: [],
      suppressed: [],
      errors: [],
    });

    const res = await POST(request());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.selectOpsHealthAlertCandidatesSafe).toHaveBeenCalledWith(expect.anything(), criticalSummary(250), {
      acknowledgements: [ack],
    });
    expect(mocks.postDispatchControlAlert).not.toHaveBeenCalled();
    expect(json.alerts).toEqual({ enabled: true, candidates: 0, sent: 0, suppressed: 0, errors: [] });
  });

  it("reports cooldown-suppressed duplicate alerts", async () => {
    process.env.OPS_HEALTH_ALERTS_ENABLED = "true";
    mocks.runProductionHealthScan.mockResolvedValueOnce(criticalSummary(250));
    mocks.selectOpsHealthAlertCandidatesSafe.mockResolvedValueOnce({
      ok: true,
      candidates: [],
      suppressed: [{ candidate: alertCandidate(), reason: "cooldown", latestAt: "2026-05-14T09:55:00.000Z" }],
      errors: [],
    });

    const res = await POST(request());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.postDispatchControlAlert).not.toHaveBeenCalled();
    expect(mocks.recordOpsHealthAlertCooldownMarker).not.toHaveBeenCalled();
    expect(json.alerts).toEqual({ enabled: true, candidates: 0, sent: 0, suppressed: 1, errors: [] });
  });

  it("does not fail cron when webhook delivery fails", async () => {
    process.env.OPS_HEALTH_ALERTS_ENABLED = "true";
    mocks.runProductionHealthScan.mockResolvedValueOnce(criticalSummary(250));
    mocks.selectOpsHealthAlertCandidatesSafe.mockResolvedValueOnce({
      ok: true,
      candidates: [alertCandidate()],
      suppressed: [],
      errors: [],
    });
    mocks.postDispatchControlAlert.mockRejectedValueOnce(new Error("webhook down"));

    const res = await POST(request());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      status: "critical",
      alerts: {
        enabled: true,
        candidates: 1,
        sent: 0,
        suppressed: 0,
        errors: ["webhook down"],
      },
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
