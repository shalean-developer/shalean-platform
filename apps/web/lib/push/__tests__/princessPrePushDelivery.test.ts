import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyExpoPushFailure } from "@/lib/push/classifyExpoPushError";
import { createMemoryExpoPushAdapter } from "@/lib/push/expoPushAdapter";
import { sanitizePushData } from "@/lib/push/sanitizePushPayload";
import { dispatchExpoPush } from "@/lib/push/dispatchExpoPush";
import { PRINCESS_PRE_FIXTURES } from "@/lib/notifications/testAdapters/memoryNotificationAdapters";
import { isValidExpoPushToken } from "@/lib/customer/customerPushTokens";

const claimMock = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => true));
const releaseMock = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => undefined));
const writeLogMock = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => undefined));
const deleteTokenMock = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({ ok: true as const })));

vi.mock("@/lib/notifications/notificationIdempotencyClaim", () => ({
  tryClaimNotificationIdempotency: (admin: unknown, params: unknown) => claimMock(admin, params),
  releaseNotificationIdempotencyClaim: (admin: unknown, params: unknown) => releaseMock(admin, params),
}));

vi.mock("@/lib/notifications/notificationLogWrite", () => ({
  writeNotificationLog: (input: unknown) => writeLogMock(input),
}));

vi.mock("@/lib/customer/customerPushTokens", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/customer/customerPushTokens")>();
  return {
    ...actual,
    deleteUserPushToken: (admin: unknown, userId: unknown, token: unknown) =>
      deleteTokenMock(admin, userId, token),
  };
});

describe("Princess PR E push token validation", () => {
  it("accepts synthetic Expo tokens and rejects garbage", () => {
    expect(isValidExpoPushToken(PRINCESS_PRE_FIXTURES.expoTokenA)).toBe(true);
    expect(isValidExpoPushToken("short")).toBe(false);
    expect(isValidExpoPushToken("ExponentPushToken[abc def]")).toBe(false);
  });
});

describe("Princess PR E push payload sanitization", () => {
  it("strips sensitive keys", () => {
    expect(
      sanitizePushData({
        type: "assigned",
        path: "/jobs/1",
        email: "secret@x.com",
        password: "x",
        bookingId: PRINCESS_PRE_FIXTURES.bookingId,
      }),
    ).toEqual({
      type: "assigned",
      path: "/jobs/1",
      bookingId: PRINCESS_PRE_FIXTURES.bookingId,
    });
  });
});

describe("Princess PR E Expo error classification", () => {
  it("maps DeviceNotRegistered to invalid_recipient", () => {
    const c = classifyExpoPushFailure({
      ticket: { status: "error", message: "DeviceNotRegistered", details: { error: "DeviceNotRegistered" } },
    });
    expect(c.category).toBe("device_not_registered");
    expect(c.failureClass).toBe("invalid_recipient");
  });

  it("maps MessageTooBig to permanent_validation", () => {
    const c = classifyExpoPushFailure({
      ticket: { status: "error", details: { error: "MessageTooBig" } },
    });
    expect(c.category).toBe("message_too_big");
    expect(c.failureClass).toBe("permanent_validation");
  });

  it("maps 429 to transient rate_limited", () => {
    const c = classifyExpoPushFailure({ httpStatus: 429 });
    expect(c.category).toBe("rate_limited");
    expect(c.failureClass).toBe("transient");
  });
});

describe("Princess PR E dispatchExpoPush", () => {
  const admin = {} as never;

  beforeEach(() => {
    claimMock.mockReset().mockResolvedValue(true);
    releaseMock.mockReset().mockResolvedValue(undefined);
    writeLogMock.mockReset().mockResolvedValue(undefined);
    deleteTokenMock.mockReset().mockResolvedValue({ ok: true });
  });

  const baseInput = {
    userId: PRINCESS_PRE_FIXTURES.userId,
    token: PRINCESS_PRE_FIXTURES.expoTokenA,
    title: "Job assigned",
    body: "You have a new job.",
    data: { type: "assigned", email: "leak@x.com" },
    eventType: "assigned",
    templateKey: "cleaner_assigned_push",
    role: "cleaner" as const,
    bookingId: PRINCESS_PRE_FIXTURES.bookingId,
    idempotencyKey: PRINCESS_PRE_FIXTURES.idempotencyKey,
    app: "cleaner" as const,
  };

  it("records success once", async () => {
    const adapter = createMemoryExpoPushAdapter();
    const out = await dispatchExpoPush({ admin, adapter, random: () => 0.5 }, baseInput);
    expect(out.status).toBe("sent");
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0]!.messages[0]!.data).not.toHaveProperty("email");
    expect(writeLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "push", status: "sent", provider: "expo" }),
    );
  });

  it("skips duplicate when idempotency claim fails", async () => {
    claimMock.mockResolvedValueOnce(false);
    const adapter = createMemoryExpoPushAdapter();
    const out = await dispatchExpoPush({ admin, adapter }, baseInput);
    expect(out.status).toBe("skipped_duplicate");
    expect(adapter.calls).toHaveLength(0);
  });

  it("removes invalid tokens on DeviceNotRegistered", async () => {
    const adapter = createMemoryExpoPushAdapter({
      nextResult: {
        ok: true,
        tickets: [
          {
            status: "error",
            message: "DeviceNotRegistered",
            details: { error: "DeviceNotRegistered" },
          },
        ],
      },
    });
    const out = await dispatchExpoPush({ admin, adapter }, baseInput);
    expect(out.status).toBe("dead_letter");
    if (out.status === "dead_letter") expect(out.tokenRemoved).toBe(true);
    expect(deleteTokenMock).toHaveBeenCalled();
  });

  it("schedules retry on transient provider error and releases claim", async () => {
    const adapter = createMemoryExpoPushAdapter({
      nextResult: { ok: false, httpStatus: 503, error: "expo_http_503" },
    });
    const out = await dispatchExpoPush(
      { admin, adapter, nowMs: 1_000_000, random: () => 0.5 },
      baseInput,
    );
    expect(out.status).toBe("retry");
    expect(releaseMock).toHaveBeenCalled();
    expect(writeLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        payload: expect.objectContaining({ terminal: false, decision: "retry_scheduled" }),
      }),
    );
  });

  it("dead-letters permanent MessageTooBig", async () => {
    const adapter = createMemoryExpoPushAdapter({
      nextResult: {
        ok: true,
        tickets: [{ status: "error", details: { error: "MessageTooBig" } }],
      },
    });
    const out = await dispatchExpoPush({ admin, adapter }, baseInput);
    expect(out.status).toBe("dead_letter");
  });

  it("retries then succeeds on second attempt metadata", async () => {
    const adapter = createMemoryExpoPushAdapter({
      responses: [
        { ok: false, httpStatus: 500, error: "boom" },
        { ok: true, tickets: [{ status: "ok", id: "t2" }] },
      ],
    });
    const first = await dispatchExpoPush(
      { admin, adapter, nowMs: 1_000_000, random: () => 0.5 },
      baseInput,
    );
    expect(first.status).toBe("retry");
    const second = await dispatchExpoPush(
      { admin, adapter, random: () => 0.5 },
      { ...baseInput, priorAttempts: 1, idempotencyKey: `${baseInput.idempotencyKey}:2` },
    );
    expect(second.status).toBe("sent");
  });
});
