import { describe, expect, it } from "vitest";
import {
  decideNotificationRetry,
  maskNotificationRecipient,
  notificationRetryDelayMs,
  NOTIFICATION_RETRY_MAX_ATTEMPTS,
} from "@/lib/notifications/retryContract";
import { createMemoryEmailAdapter, PRINCESS_PRE_FIXTURES } from "@/lib/notifications/testAdapters/memoryNotificationAdapters";
import { classifyResendSendError } from "@/lib/email/classifyResendSendError";
import { buildDeadLetterOperatorView } from "@/lib/notifications/deadLetterOperatorView";

describe("Princess PR E retry contract", () => {
  it("bounds attempts and dead-letters at max", () => {
    const d = decideNotificationRetry({
      priorAttempts: NOTIFICATION_RETRY_MAX_ATTEMPTS - 1,
      failureClass: "transient",
      random: () => 0.5,
    });
    expect(d.action).toBe("dead_letter");
    if (d.action === "dead_letter") {
      expect(d.attempt).toBe(NOTIFICATION_RETRY_MAX_ATTEMPTS);
      expect(d.reason).toContain("max_attempts");
    }
  });

  it("schedules exponential backoff with jitter on first transient failure", () => {
    const d = decideNotificationRetry({
      priorAttempts: 0,
      failureClass: "transient",
      nowMs: 1_000_000,
      random: () => 0.5,
    });
    expect(d.action).toBe("retry");
    if (d.action === "retry") {
      expect(d.attempt).toBe(1);
      expect(d.delayMs).toBe(notificationRetryDelayMs(1, { random: () => 0.5 }));
      expect(d.nextAttemptAt).toBe(new Date(1_000_000 + d.delayMs).toISOString());
    }
  });

  it("does not retry permanent / authorization / invalid recipient", () => {
    for (const failureClass of ["permanent", "authorization", "invalid_recipient", "permanent_validation"] as const) {
      const d = decideNotificationRetry({ priorAttempts: 0, failureClass });
      expect(d.action).toBe("dead_letter");
    }
  });

  it("masks recipients for operator views", () => {
    expect(maskNotificationRecipient("alice@example.com")).toContain("***@example.com");
    expect(maskNotificationRecipient(PRINCESS_PRE_FIXTURES.expoTokenA)).toContain("ExponentPushToken");
    expect(maskNotificationRecipient("+27821234567")).toBe("***4567");
  });
});

describe("Princess PR E email adapter fixtures", () => {
  it("records success through memory adapter", async () => {
    const email = createMemoryEmailAdapter();
    const r = await email.send({
      to: PRINCESS_PRE_FIXTURES.emailAllowlisted,
      subject: "Shalean booking update",
      html: "<p>Hello</p>",
    });
    expect(r.ok).toBe(true);
    expect(email.sends).toHaveLength(1);
  });

  it("classifies provider 429 and 5xx as transient", () => {
    expect(classifyResendSendError({ name: "rate_limit_exceeded", statusCode: 429 })).toBe("transient");
    expect(classifyResendSendError({ name: "internal_server_error", statusCode: 500 })).toBe("transient");
    expect(classifyResendSendError({ name: "validation_error", statusCode: 422 })).toBe("permanent_validation");
  });

  it("simulates 429 then success via scripted adapter", async () => {
    const email = createMemoryEmailAdapter({
      responses: [
        { ok: false, statusCode: 429, name: "rate_limit_exceeded", message: "slow down" },
        { ok: true, id: "ok-2" },
      ],
    });
    const first = await email.send({
      to: PRINCESS_PRE_FIXTURES.emailAllowlisted,
      subject: "t",
      html: "h",
    });
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(classifyResendSendError({ name: first.name, statusCode: first.statusCode })).toBe("transient");
    }
    const second = await email.send({
      to: PRINCESS_PRE_FIXTURES.emailAllowlisted,
      subject: "t",
      html: "h",
    });
    expect(second.ok).toBe(true);
  });
});

describe("Princess PR E dead-letter operator view", () => {
  it("exposes required operator fields with masked recipient", () => {
    const view = buildDeadLetterOperatorView({
      id: "log-1",
      channel: "email",
      recipient: "alice@example.com",
      event_type: "reminder_2h",
      booking_id: PRINCESS_PRE_FIXTURES.bookingId,
      status: "failed",
      error: "rate_limit_exceeded",
      provider: "resend",
      role: "customer",
      created_at: "2026-07-16T00:00:00.000Z",
      payload: {
        attempts: 5,
        terminal: true,
        error_category: "transient",
        decision: "dead_letter",
        user_id: PRINCESS_PRE_FIXTURES.userId,
      },
    });
    expect(view.notificationId).toBe("log-1");
    expect(view.recipientMasked).not.toContain("alice@");
    expect(view.attemptCount).toBe(5);
    expect(view.terminal).toBe(true);
    expect(view.bookingId).toBe(PRINCESS_PRE_FIXTURES.bookingId);
    expect(view.lastErrorCategory).toBe("transient");
  });
});
