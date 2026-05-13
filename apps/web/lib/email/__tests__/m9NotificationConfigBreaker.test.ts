import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { reportOperationalIssueMock } = vi.hoisted(() => ({
  reportOperationalIssueMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  reportOperationalIssue: reportOperationalIssueMock,
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
}));

import {
  createNotificationConfigBreaker,
  NOTIFICATION_CONFIG_BREAKER_SKIP_REASON,
} from "@/lib/email/notificationConfigBreaker";

beforeEach(() => {
  reportOperationalIssueMock.mockReset();
});

afterEach(() => {
  reportOperationalIssueMock.mockReset();
});

/**
 * M-9 — Tests for the per-cron-run breaker.
 *
 * Contract under test (this is the M-9 fix):
 *   - The breaker MUST trip on the first `permanent_config` outcome and
 *     stay tripped for the rest of the run.
 *   - The breaker MUST escalate to `reportOperationalIssue` exactly ONCE
 *     per run, regardless of how many subsequent permanent_config
 *     outcomes are recorded — this is what stops the per-invoice
 *     ops-log spam that was the user-visible symptom of M-9.
 *   - Transient and permanent_validation outcomes MUST NOT trip the
 *     breaker — the cron loop should keep trying other invoices.
 *   - Each call to the factory MUST return a fresh instance (no shared
 *     state across runs); this is what gives the daily "fix-it-and-
 *     retry-tomorrow" recovery semantics.
 */
describe("notificationConfigBreaker (M-9)", () => {
  it("starts untripped and `shouldSkipRemainingSends` is false", () => {
    const b = createNotificationConfigBreaker({ source: "test", channel: "email" });
    expect(b.shouldSkipRemainingSends()).toBe(false);
    expect(b.skipReason()).toBe(null);
    expect(b.snapshot().trippedAtIso).toBe(null);
    expect(b.snapshot().permanentConfigOutcomes).toBe(0);
  });

  it("transient outcome does NOT trip the breaker (M-9: still retry on next tick)", async () => {
    const b = createNotificationConfigBreaker({ source: "test", channel: "email" });
    await b.recordSendOutcome({ classification: "transient", errorMessage: "fetch failed", invoiceId: "inv_1" });
    expect(b.shouldSkipRemainingSends()).toBe(false);
    expect(reportOperationalIssueMock).not.toHaveBeenCalled();
  });

  it("permanent_validation outcome does NOT trip the breaker (M-9: per-recipient, not per-config)", async () => {
    const b = createNotificationConfigBreaker({ source: "test", channel: "email" });
    await b.recordSendOutcome({
      classification: "permanent_validation",
      errorMessage: "to is invalid.",
      invoiceId: "inv_1",
    });
    expect(b.shouldSkipRemainingSends()).toBe(false);
    expect(reportOperationalIssueMock).not.toHaveBeenCalled();
  });

  it("permanent_config outcome trips the breaker AND escalates exactly once", async () => {
    const b = createNotificationConfigBreaker({ source: "cron/test", channel: "email" });

    await b.recordSendOutcome({
      classification: "permanent_config",
      errorMessage: "RESEND_API_KEY not set",
      invoiceId: "inv_1",
    });

    expect(b.shouldSkipRemainingSends()).toBe(true);
    expect(b.skipReason()).toBe(NOTIFICATION_CONFIG_BREAKER_SKIP_REASON);
    expect(reportOperationalIssueMock).toHaveBeenCalledTimes(1);

    const [level, source, message, ctx] = reportOperationalIssueMock.mock.calls[0]!;
    expect(level).toBe("error");
    expect(source).toBe("cron/test");
    expect(message).toBe("notification_config_breaker_tripped");
    expect(ctx).toMatchObject({
      channel: "email",
      reason: "RESEND_API_KEY not set",
      first_invoice_id: "inv_1",
    });
    expect(String(ctx.remediation)).toMatch(/RESEND_API_KEY/);
  });

  it("subsequent permanent_config outcomes do NOT re-escalate (M-9: stops 100x ops-log spam)", async () => {
    const b = createNotificationConfigBreaker({ source: "cron/test", channel: "email" });
    for (let i = 0; i < 50; i++) {
      await b.recordSendOutcome({
        classification: "permanent_config",
        errorMessage: "RESEND_API_KEY not set",
        invoiceId: `inv_${i}`,
      });
    }
    expect(reportOperationalIssueMock).toHaveBeenCalledTimes(1);
    expect(b.snapshot().permanentConfigOutcomes).toBe(50);
    expect(b.snapshot().attemptedAfterTripCount).toBe(49);
  });

  it("recordSkippedInvoice increments the snapshot counter only when tripped", () => {
    const b = createNotificationConfigBreaker({ source: "cron/test", channel: "email" });
    b.recordSkippedInvoice("inv_1");
    expect(b.snapshot().skippedInvoiceCount).toBe(0);
  });

  it("recordSkippedInvoice increments the counter once tripped", async () => {
    const b = createNotificationConfigBreaker({ source: "cron/test", channel: "email" });
    await b.recordSendOutcome({
      classification: "permanent_config",
      errorMessage: "RESEND_API_KEY not set",
      invoiceId: "inv_1",
    });
    b.recordSkippedInvoice("inv_2");
    b.recordSkippedInvoice("inv_3");
    b.recordSkippedInvoice("inv_4");
    expect(b.snapshot().skippedInvoiceCount).toBe(3);
  });

  it("each factory call returns a FRESH breaker (M-9: no cross-run state)", async () => {
    const a = createNotificationConfigBreaker({ source: "cron/test", channel: "email" });
    await a.recordSendOutcome({ classification: "permanent_config", errorMessage: "x", invoiceId: "inv_1" });
    expect(a.shouldSkipRemainingSends()).toBe(true);

    const b = createNotificationConfigBreaker({ source: "cron/test", channel: "email" });
    expect(b.shouldSkipRemainingSends()).toBe(false);

    expect(reportOperationalIssueMock).toHaveBeenCalledTimes(1);
  });

  it("snapshot is frozen so callers can't accidentally mutate breaker state", () => {
    const b = createNotificationConfigBreaker({ source: "cron/test", channel: "email" });
    const s = b.snapshot();
    expect(Object.isFrozen(s)).toBe(true);
    expect(() => {
      (s as { trippedAtIso: string | null }).trippedAtIso = "tampered";
    }).toThrow();
  });

  it("missing errorMessage falls back to the canonical breaker reason token", async () => {
    const b = createNotificationConfigBreaker({ source: "cron/test", channel: "email" });
    await b.recordSendOutcome({ classification: "permanent_config", invoiceId: "inv_1" });
    expect(reportOperationalIssueMock).toHaveBeenCalledTimes(1);
    const ctx = reportOperationalIssueMock.mock.calls[0]![3];
    expect(ctx.reason).toBe(NOTIFICATION_CONFIG_BREAKER_SKIP_REASON);
  });

  it("scope.channel is preserved in snapshot and ops-issue context", async () => {
    const b = createNotificationConfigBreaker({ source: "cron/whatsapp", channel: "whatsapp" });
    await b.recordSendOutcome({ classification: "permanent_config", errorMessage: "no token", invoiceId: "inv_1" });
    expect(b.snapshot().channel).toBe("whatsapp");
    expect(reportOperationalIssueMock.mock.calls[0]![3].channel).toBe("whatsapp");
  });

  it("transient AFTER tripped permanent_config does not 'reset' the breaker", async () => {
    const b = createNotificationConfigBreaker({ source: "cron/test", channel: "email" });
    await b.recordSendOutcome({ classification: "permanent_config", errorMessage: "x", invoiceId: "inv_1" });
    await b.recordSendOutcome({ classification: "transient", errorMessage: "fetch failed", invoiceId: "inv_2" });
    expect(b.shouldSkipRemainingSends()).toBe(true);
  });
});
