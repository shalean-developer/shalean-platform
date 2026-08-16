import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));

const adminRpcMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({ rpc: adminRpcMock })),
}));

import { GET, POST } from "@/app/api/cron/prune-system-logs/route";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const TEST_SECRET = "test-cron-secret-m21";

function request(method: "GET" | "POST" = "POST", bearer: string | null = TEST_SECRET): Request {
  const headers: Record<string, string> = {};
  if (bearer !== null) headers.authorization = `Bearer ${bearer}`;
  return new Request("https://example.com/api/cron/prune-system-logs", { method, headers });
}

beforeEach(() => {
  adminRpcMock.mockReset();
  adminRpcMock.mockResolvedValue({ data: 0, error: null });
  vi.mocked(logSystemEvent).mockClear();
  vi.mocked(reportOperationalIssue).mockClear();
  vi.mocked(getSupabaseAdmin).mockReset();
  vi.mocked(getSupabaseAdmin).mockReturnValue({ rpc: adminRpcMock } as unknown as ReturnType<typeof getSupabaseAdmin>);
  process.env.CRON_SECRET = TEST_SECRET;
  delete process.env.SYSTEM_LOG_RETENTION_DAYS;
  delete process.env.SYSTEM_LOG_PRUNE_BATCH_SIZE;
  delete process.env.SYSTEM_LOG_PRUNE_MAX_BATCHES;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.SYSTEM_LOG_RETENTION_DAYS;
  delete process.env.SYSTEM_LOG_PRUNE_BATCH_SIZE;
  delete process.env.SYSTEM_LOG_PRUNE_MAX_BATCHES;
});

describe("M-21/CR-16 prune-system-logs", () => {
  it("rejects missing or invalid cron auth", async () => {
    delete process.env.CRON_SECRET;
    expect((await POST(request())).status).toBe(503);
    process.env.CRON_SECRET = TEST_SECRET;
    expect((await POST(request("POST", null))).status).toBe(401);
    expect((await POST(request("POST", "wrong"))).status).toBe(401);
    expect(adminRpcMock).not.toHaveBeenCalled();
  });

  it("returns 503 when the Supabase admin client is unavailable", async () => {
    vi.mocked(getSupabaseAdmin).mockReturnValueOnce(null);
    expect((await POST(request())).status).toBe(503);
    expect(adminRpcMock).not.toHaveBeenCalled();
  });

  it("uses safe defaults and the bounded batch RPC", async () => {
    adminRpcMock.mockResolvedValueOnce({ data: 17, error: null });
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(adminRpcMock).toHaveBeenCalledWith("prune_system_logs_batch", {
      p_retention_days: 30,
      p_batch_size: 5000,
    });
    expect(await res.json()).toEqual({
      ok: true,
      deleted: 17,
      batches: 1,
      retentionDays: 30,
      batchSize: 5000,
      maxBatches: 10,
    });
  });

  it.each(["0", "-7", "", "   ", "forever"])(
    "falls back to 30 days for unsafe retention value %p",
    async (value) => {
      process.env.SYSTEM_LOG_RETENTION_DAYS = value;
      await POST(request());
      expect(adminRpcMock).toHaveBeenCalledWith("prune_system_logs_batch", {
        p_retention_days: 30,
        p_batch_size: 5000,
      });
    },
  );

  it("honours positive retention values and clamps the upper bound", async () => {
    process.env.SYSTEM_LOG_RETENTION_DAYS = "9999";
    await POST(request());
    expect(adminRpcMock).toHaveBeenCalledWith("prune_system_logs_batch", {
      p_retention_days: 365,
      p_batch_size: 5000,
    });
  });

  it("loops in bounded batches and stops on a partial batch", async () => {
    process.env.SYSTEM_LOG_PRUNE_BATCH_SIZE = "1000";
    process.env.SYSTEM_LOG_PRUNE_MAX_BATCHES = "4";
    adminRpcMock
      .mockResolvedValueOnce({ data: 1000, error: null })
      .mockResolvedValueOnce({ data: 1000, error: null })
      .mockResolvedValueOnce({ data: 250, error: null });

    const res = await POST(request());
    const json = await res.json();
    expect(adminRpcMock).toHaveBeenCalledTimes(3);
    expect(json).toMatchObject({ deleted: 2250, batches: 3, batchSize: 1000, maxBatches: 4 });
    expect(logSystemEvent).toHaveBeenCalledTimes(1);
  });

  it("does not write an idle success log when no rows are deleted", async () => {
    adminRpcMock.mockResolvedValueOnce({ data: 0, error: null });
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe(0);
    expect(logSystemEvent).not.toHaveBeenCalled();
    expect(reportOperationalIssue).not.toHaveBeenCalled();
  });

  it("reports RPC failure and preserves partial progress", async () => {
    adminRpcMock
      .mockResolvedValueOnce({ data: 5000, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "statement timeout" } });

    const res = await POST(request());
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ deleted: 5000, batches: 1, retentionDays: 30 });
    expect(reportOperationalIssue).toHaveBeenCalledWith(
      "error",
      "cron/prune-system-logs",
      "statement timeout",
      expect.objectContaining({ deleted: 5000, batches: 1, retentionDays: 30 }),
    );
  });

  it("GET delegates to the same bounded prune path", async () => {
    adminRpcMock.mockResolvedValueOnce({ data: "9", error: null });
    const res = await GET(request("GET"));
    expect(res.status).toBe(200);
    expect(adminRpcMock).toHaveBeenCalledWith("prune_system_logs_batch", {
      p_retention_days: 30,
      p_batch_size: 5000,
    });
    expect((await res.json()).deleted).toBe(9);
  });
});
