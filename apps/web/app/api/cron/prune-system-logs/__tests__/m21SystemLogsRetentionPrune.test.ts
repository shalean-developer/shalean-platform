import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));

const adminRpcMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({ rpc: adminRpcMock })),
}));

import { POST } from "@/app/api/cron/prune-system-logs/route";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../../../..");
const migrationPath = path.join(
  repoRoot,
  "supabase/migrations/20260816044500_cr16_batched_system_log_retention.sql",
);

const TEST_SECRET = "test-cron-secret-cr16";

function request(bearer = TEST_SECRET): Request {
  return new Request("https://example.com/api/cron/prune-system-logs", {
    method: "POST",
    headers: { authorization: `Bearer ${bearer}` },
  });
}

beforeEach(() => {
  adminRpcMock.mockReset();
  adminRpcMock.mockResolvedValue({ data: 0, error: null });
  vi.mocked(logSystemEvent).mockClear();
  vi.mocked(reportOperationalIssue).mockClear();
  process.env.CRON_SECRET = TEST_SECRET;
  delete process.env.SYSTEM_LOG_RETENTION_DAYS;
  delete process.env.SYSTEM_LOG_ERROR_RETENTION_DAYS;
  delete process.env.SYSTEM_LOG_PROTECTED_RETENTION_DAYS;
  delete process.env.SYSTEM_LOG_PRUNE_BATCH_SIZE;
  delete process.env.SYSTEM_LOG_PRUNE_MAX_BATCHES;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.SYSTEM_LOG_RETENTION_DAYS;
  delete process.env.SYSTEM_LOG_ERROR_RETENTION_DAYS;
  delete process.env.SYSTEM_LOG_PROTECTED_RETENTION_DAYS;
  delete process.env.SYSTEM_LOG_PRUNE_BATCH_SIZE;
  delete process.env.SYSTEM_LOG_PRUNE_MAX_BATCHES;
});

describe("CR-16 batched system_logs retention", () => {
  it("keeps the cron route secret-guarded", async () => {
    expect((await POST(request("wrong"))).status).toBe(401);
    expect(adminRpcMock).not.toHaveBeenCalled();
  });

  it("uses tiered retention defaults and one bounded RPC when the backlog is empty", async () => {
    adminRpcMock.mockResolvedValueOnce({ data: 0, error: null });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(adminRpcMock).toHaveBeenCalledTimes(1);
    expect(adminRpcMock).toHaveBeenCalledWith("prune_system_logs", {
      p_retention_days: 30,
      p_error_retention_days: 90,
      p_protected_retention_days: 180,
      p_batch_size: 5000,
    });
    expect(logSystemEvent).not.toHaveBeenCalled();
  });

  it("drains multiple bounded batches and stops on the first partial batch", async () => {
    process.env.SYSTEM_LOG_PRUNE_BATCH_SIZE = "1000";
    process.env.SYSTEM_LOG_PRUNE_MAX_BATCHES = "5";
    adminRpcMock
      .mockResolvedValueOnce({ data: 1000, error: null })
      .mockResolvedValueOnce({ data: 1000, error: null })
      .mockResolvedValueOnce({ data: 125, error: null });

    const response = await POST(request());
    const body = (await response.json()) as { deleted: number; batches: number; backlogMayRemain: boolean };
    expect(body).toMatchObject({ deleted: 2125, batches: 3, backlogMayRemain: false });
    expect(adminRpcMock).toHaveBeenCalledTimes(3);
    expect(logSystemEvent).toHaveBeenCalledTimes(1);
  });

  it("caps a run when every batch is full so the request remains bounded", async () => {
    process.env.SYSTEM_LOG_PRUNE_BATCH_SIZE = "500";
    process.env.SYSTEM_LOG_PRUNE_MAX_BATCHES = "2";
    adminRpcMock.mockResolvedValue({ data: 500, error: null });

    const response = await POST(request());
    const body = (await response.json()) as { deleted: number; batches: number; backlogMayRemain: boolean };
    expect(body).toMatchObject({ deleted: 1000, batches: 2, backlogMayRemain: true });
  });

  it("preserves the invariant that error retention is not shorter than routine retention", async () => {
    process.env.SYSTEM_LOG_RETENTION_DAYS = "120";
    process.env.SYSTEM_LOG_ERROR_RETENTION_DAYS = "30";
    process.env.SYSTEM_LOG_PROTECTED_RETENTION_DAYS = "40";
    await POST(request());
    expect(adminRpcMock).toHaveBeenCalledWith("prune_system_logs", {
      p_retention_days: 120,
      p_error_retention_days: 120,
      p_protected_retention_days: 120,
      p_batch_size: 5000,
    });
  });

  it("returns 500 and records the failure without continuing batches", async () => {
    adminRpcMock.mockResolvedValueOnce({ data: null, error: { message: "statement timeout" } });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(adminRpcMock).toHaveBeenCalledTimes(1);
    expect(reportOperationalIssue).toHaveBeenCalledWith(
      "error",
      "cron/prune-system-logs",
      "statement timeout",
      expect.objectContaining({ batchSize: 5000, batches: 0, deleted: 0 }),
    );
  });

  it("ships a bounded SQL delete and daily cron schedule", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("limit batch_size");
    expect(sql).toContain("order by created_at asc, id asc");
    expect(sql).toContain("when level = 'error' then error_days");
    expect(sql).toContain("(audit|security|auth|permission|rbac|login)");
    expect(sql).toContain("'0 4 * * *'");
  });
});
