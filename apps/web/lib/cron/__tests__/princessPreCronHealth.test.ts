import { describe, expect, it } from "vitest";
import {
  BOOKING_LIFECYCLE_HOBBY_SCHEDULE,
  BOOKING_LIFECYCLE_PRO_SCHEDULE,
  BOOKING_LIFECYCLE_STALE_AFTER_MINUTES,
  classifyCronRunHealth,
  resolveBookingLifecycleCronStaleAfterMinutes,
} from "@/lib/cron/cronRunHealth";
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
    expect(h.staleAfterMinutes).toBe(BOOKING_LIFECYCLE_STALE_AFTER_MINUTES.hobbyDaily);
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

  it("reports succeeded when last success is fresh (local/manual threshold)", () => {
    const h = classifyCronRunHealth({
      jobName: "booking-lifecycle",
      rows: [{ created_at: "2026-07-16T11:55:00.000Z", status: "success", message: "ok" }],
      nowMs: now,
      staleAfterMinutes: 30,
      environment: "local",
    });
    expect(h.status).toBe("succeeded");
    expect(h.lastSuccessAt).toBe("2026-07-16T11:55:00.000Z");
  });

  it("reports stale when last success older than local/manual threshold", () => {
    const h = classifyCronRunHealth({
      jobName: "booking-lifecycle",
      rows: [{ created_at: "2026-07-16T10:00:00.000Z", status: "success" }],
      nowMs: now,
      staleAfterMinutes: 30,
      environment: "local",
    });
    expect(h.status).toBe("stale");
  });

  it("does not report stale on staging Hobby within the daily window", () => {
    const h = classifyCronRunHealth({
      jobName: "booking-lifecycle",
      rows: [{ created_at: "2026-07-15T14:00:00.000Z", status: "success" }],
      nowMs: now,
      environment: "staging",
    });
    expect(h.staleAfterMinutes).toBe(BOOKING_LIFECYCLE_STALE_AFTER_MINUTES.hobbyDaily);
    expect(h.status).toBe("succeeded");
  });

  it("reports stale-after-daily-window on staging Hobby", () => {
    const h = classifyCronRunHealth({
      jobName: "booking-lifecycle",
      rows: [{ created_at: "2026-07-15T09:00:00.000Z", status: "success" }],
      nowMs: now,
      environment: "staging",
    });
    // 27h > 26h Hobby staging threshold
    expect(h.status).toBe("stale");
    expect(h.staleAfterMinutes).toBe(26 * 60);
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

  it("keeps failed visible even when success would also be outside daily window", () => {
    const h = classifyCronRunHealth({
      jobName: "booking-lifecycle",
      rows: [
        { created_at: "2026-07-16T11:58:00.000Z", status: "error", message: "load failed" },
        { created_at: "2026-07-14T11:50:00.000Z", status: "success" },
      ],
      nowMs: now,
      environment: "staging",
    });
    expect(h.status).toBe("failed");
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

describe("Princess Hobby cron stale threshold resolution", () => {
  it("uses short threshold for local/manual test mode", () => {
    expect(resolveBookingLifecycleCronStaleAfterMinutes("local")).toBe(30);
    expect(resolveBookingLifecycleCronStaleAfterMinutes("development")).toBe(30);
  });

  it("uses >26h threshold for staging Hobby daily cadence", () => {
    expect(resolveBookingLifecycleCronStaleAfterMinutes("staging")).toBe(26 * 60);
    expect(resolveBookingLifecycleCronStaleAfterMinutes("preview")).toBe(26 * 60);
  });

  it("documents deferred Pro five-minute threshold without enabling it", () => {
    expect(BOOKING_LIFECYCLE_STALE_AFTER_MINUTES.proFiveMinute).toBe(30);
    expect(BOOKING_LIFECYCLE_PRO_SCHEDULE).toBe("*/5 * * * *");
    expect(BOOKING_LIFECYCLE_HOBBY_SCHEDULE).toBe("0 2 * * *");
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

  it("rejects missing Authorization and x-cron-secret", () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "staging-cron-secret-test";
    const r = verifyCronSecret(new Request("https://example.test/api/cron/booking-lifecycle"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
    if (prev !== undefined) process.env.CRON_SECRET = prev;
    else delete process.env.CRON_SECRET;
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

  it("rejects cookie/session-style headers without cron secret", () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "staging-cron-secret-test";
    const r = verifyCronSecret(
      new Request("https://example.test/api/cron/booking-lifecycle", {
        headers: {
          Cookie: "sb-access-token=customer-session; role=admin",
          // Intentionally not a JWT shape — proves browser session headers alone are insufficient.
          Authorization: "Bearer customer-session-token",
        },
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
    if (prev !== undefined) process.env.CRON_SECRET = prev;
    else delete process.env.CRON_SECRET;
  });

  it("accepts correct bearer secret for manual UAT invocation", () => {
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

  it("accepts correct x-cron-secret header", () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "staging-cron-secret-test";
    const r = verifyCronSecret(
      new Request("https://example.test/api/cron/booking-lifecycle", {
        headers: { "x-cron-secret": "staging-cron-secret-test" },
      }),
    );
    expect(r.ok).toBe(true);
    if (prev !== undefined) process.env.CRON_SECRET = prev;
    else delete process.env.CRON_SECRET;
  });
});

describe("Princess PR E booking-lifecycle static guards", () => {
  it("registers Hobby-compatible daily vercel.json schedule (not Pro */5)", () => {
    const vercelPath = join(process.cwd(), "vercel.json");
    const src = readFileSync(vercelPath, "utf8");
    const parsed = JSON.parse(src) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const lifecycle = parsed.crons.find((c) => c.path === "/api/cron/booking-lifecycle");
    expect(lifecycle).toBeDefined();
    expect(lifecycle!.schedule).toBe(BOOKING_LIFECYCLE_HOBBY_SCHEDULE);
    expect(lifecycle!.schedule).toBe("0 2 * * *");
    // Future Pro schedule must not be currently enabled for this path.
    expect(lifecycle!.schedule).not.toBe(BOOKING_LIFECYCLE_PRO_SCHEDULE);
    expect(lifecycle!.schedule).not.toContain("*/5");
  });

  it("Hobby schedule runs at most once per day", () => {
    // 0 2 * * * → minute 0, hour 2, every day → one invocation/day.
    const [minute, hour, dom, month, dow] = BOOKING_LIFECYCLE_HOBBY_SCHEDULE.split(" ");
    expect(minute).toBe("0");
    expect(hour).toBe("2");
    expect(dom).toBe("*");
    expect(month).toBe("*");
    expect(dow).toBe("*");
    expect(hour.includes(",")).toBe(false);
    expect(hour.includes("-")).toBe(false);
    expect(hour.includes("/")).toBe(false);
  });

  it("logs cron failure and uses lock + verifyCronSecret (manual path = scheduled path)", () => {
    const routePath = join(process.cwd(), "app/api/cron/booking-lifecycle/route.ts");
    const src = readFileSync(routePath, "utf8");
    expect(src).toContain("verifyCronSecret");
    expect(src).toContain("acquireCronLock");
    expect(src).toContain("releaseCronLock");
    expect(src).toContain('status: "error"');
    expect(src).toContain("logCronRun");
    expect(src).toContain("skipped: true");
    expect(src).toContain("leaseSeconds: 1200");
  });

  it("duplicate concurrent invocation is serialized by cron lock", () => {
    const routePath = join(process.cwd(), "app/api/cron/booking-lifecycle/route.ts");
    const src = readFileSync(routePath, "utf8");
    // Same handler for scheduled Vercel cron, pg_cron, and authenticated manual UAT.
    expect(src).toMatch(/if\s*\(\s*!lockAcq\.ok\s*\)/);
    expect(src).toContain("reason: lockAcq.reason");
  });
});
