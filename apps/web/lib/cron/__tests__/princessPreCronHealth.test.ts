import { describe, expect, it } from "vitest";
import { classifyCronRunHealth } from "@/lib/cron/cronRunHealth";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Princess PR E cron run health", () => {
  const now = Date.parse("2026-07-16T12:00:00.000Z");

  it("reports never_run when no rows", () => {
    const h = classifyCronRunHealth({
      jobName: "booking-lifecycle",
      rows: [],
      nowMs: now,
      environment: "staging",
    });
    expect(h.status).toBe("never_run");
    expect(h.lastSuccessAt).toBeNull();
  });

  it("reports currently_running when lock held", () => {
    const h = classifyCronRunHealth({
      jobName: "booking-lifecycle",
      rows: [{ created_at: "2026-07-16T11:55:00.000Z", status: "success" }],
      lockHeld: true,
      nowMs: now,
    });
    expect(h.status).toBe("currently_running");
  });

  it("reports succeeded when last success is fresh", () => {
    const h = classifyCronRunHealth({
      jobName: "booking-lifecycle",
      rows: [{ created_at: "2026-07-16T11:55:00.000Z", status: "success", message: "ok" }],
      nowMs: now,
      staleAfterMinutes: 30,
    });
    expect(h.status).toBe("succeeded");
    expect(h.lastSuccessAt).toBe("2026-07-16T11:55:00.000Z");
  });

  it("reports stale when last success older than threshold", () => {
    const h = classifyCronRunHealth({
      jobName: "booking-lifecycle",
      rows: [{ created_at: "2026-07-16T10:00:00.000Z", status: "success" }],
      nowMs: now,
      staleAfterMinutes: 30,
    });
    expect(h.status).toBe("stale");
  });

  it("reports failed when latest invocation errored after success", () => {
    const h = classifyCronRunHealth({
      jobName: "booking-lifecycle",
      rows: [
        { created_at: "2026-07-16T11:58:00.000Z", status: "error", message: "load failed" },
        { created_at: "2026-07-16T11:50:00.000Z", status: "success" },
      ],
      nowMs: now,
      staleAfterMinutes: 30,
    });
    expect(h.status).toBe("failed");
    expect(h.lastFailureAt).toBe("2026-07-16T11:58:00.000Z");
  });

  it("redacts secrets from cron messages", () => {
    const h = classifyCronRunHealth({
      jobName: "booking-lifecycle",
      rows: [
        {
          created_at: "2026-07-16T11:55:00.000Z",
          status: "success",
          message: "Bearer super-secret-token CRON_SECRET=abc123",
        },
      ],
      nowMs: now,
    });
    expect(h.lastMessage).not.toContain("super-secret");
    expect(h.lastMessage).not.toContain("abc123");
  });
});

describe("Princess PR E cron authentication", () => {
  it("rejects missing secret configuration", () => {
    const prev = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    const r = verifyCronSecret(new Request("https://example.test/api/cron/booking-lifecycle"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
    if (prev !== undefined) process.env.CRON_SECRET = prev;
  });

  it("rejects invalid secret", () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "staging-cron-secret-test";
    const r = verifyCronSecret(
      new Request("https://example.test/api/cron/booking-lifecycle", {
        headers: { Authorization: "Bearer wrong" },
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
    if (prev !== undefined) process.env.CRON_SECRET = prev;
    else delete process.env.CRON_SECRET;
  });

  it("accepts correct bearer secret", () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "staging-cron-secret-test";
    const r = verifyCronSecret(
      new Request("https://example.test/api/cron/booking-lifecycle", {
        headers: { Authorization: "Bearer staging-cron-secret-test" },
      }),
    );
    expect(r.ok).toBe(true);
    if (prev !== undefined) process.env.CRON_SECRET = prev;
    else delete process.env.CRON_SECRET;
  });
});

describe("Princess PR E booking-lifecycle static guards", () => {
  it("registers booking-lifecycle in vercel.json", () => {
    const vercelPath = join(process.cwd(), "vercel.json");
    const src = readFileSync(vercelPath, "utf8");
    expect(src).toContain("/api/cron/booking-lifecycle");
    expect(src).toContain("*/5 * * * *");
  });

  it("logs cron failure and uses lock + verifyCronSecret", () => {
    const routePath = join(process.cwd(), "app/api/cron/booking-lifecycle/route.ts");
    const src = readFileSync(routePath, "utf8");
    expect(src).toContain("verifyCronSecret");
    expect(src).toContain("acquireCronLock");
    expect(src).toContain("releaseCronLock");
    expect(src).toContain('status: "error"');
    expect(src).toContain("logCronRun");
  });
});
