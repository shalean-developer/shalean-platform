import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("@/lib/twilioSend", () => ({
  sendSms: vi.fn(),
}));
vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notifications/notificationLogWrite", () => ({
  writeNotificationLog: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notifications/smsFallback", () => ({
  sendSmsFallback: vi.fn().mockResolvedValue({ sent: false, error: "stub", messageSid: null }),
}));
vi.mock("@/lib/dispatch/metaWhatsAppSend", () => ({
  sendViaMetaWhatsApp: vi.fn().mockResolvedValue({ ok: true }),
  sendViaMetaWhatsAppTemplateBody: vi.fn().mockResolvedValue({ ok: true, messageId: "mock" }),
}));
vi.mock("@/lib/metrics/counters", () => ({
  metrics: { increment: vi.fn() },
}));
vi.mock("@/lib/cleaner/cleanerJobMagicLink", () => ({
  cleanerJobDeepLinkForSms: () => "https://example.test/job",
}));
vi.mock("@/lib/dispatch/offerLinkBaseUrl", () => ({
  getOfferSmsTrackedUrl: () => "https://example.test/o/abc",
}));
vi.mock("@/lib/dispatch/offerTokenFormat", () => ({
  isValidOfferTokenFormat: () => true,
}));
vi.mock("@/lib/whatsapp/cleanerWhatsappTemplates", () => ({
  formatCleanerPayZarLabel: () => "R250",
  resolveMetaTemplateName: () => "tpl",
}));

const VALID_OFFER_TOKEN = "11111111-2222-4333-8444-555555555555";

const adminMock = {
  from: vi.fn(),
};

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => adminMock,
}));

// ── Imports under test (after mocks) ────────────────────────────────────────
import { notifyCleanerOfDispatchOffer } from "@/lib/dispatch/offerNotifications";
import { sendSms } from "@/lib/twilioSend";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { writeNotificationLog } from "@/lib/notifications/notificationLogWrite";

const sendSmsMock = vi.mocked(sendSms);
const logMock = vi.mocked(logSystemEvent);
const writeNotificationLogMock = vi.mocked(writeNotificationLog);

function maybeSingle(data: unknown) {
  return { maybeSingle: vi.fn(async () => ({ data, error: null })) };
}
function eqChainTo<T>(target: T) {
  return { eq: vi.fn(() => target) };
}

beforeEach(() => {
  sendSmsMock.mockReset();
  logMock.mockClear();
  writeNotificationLogMock.mockClear();
  adminMock.from = vi.fn((table: string) => {
    if (table === "dispatch_offers") {
      // Throttle counter and sms_sent_at update.
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            gte: vi.fn(async () => ({ count: 0, error: null })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        })),
      };
    }
    if (table === "cleaners") {
      return {
        select: vi.fn(() => eqChainTo(maybeSingle({ phone_number: "+27821234567", full_name: "Cleaner X" }))),
      };
    }
    if (table === "bookings") {
      return {
        select: vi.fn(() =>
          eqChainTo(
            maybeSingle({
              id: "book-1",
              location: "343 Foo St, Cape Town",
              date: "2026-05-15",
              time: "10:00",
              total_paid_zar: 500,
              amount_paid_cents: null,
            }),
          ),
        ),
      };
    }
    return { select: vi.fn() };
  });
});

const params = {
  bookingId: "book-1",
  offerId: "offer-1",
  cleanerId: "cleaner-1",
  expiresAtIso: new Date(Date.now() + 60_000).toISOString(),
  offerToken: VALID_OFFER_TOKEN,
};

describe("notifyCleanerOfDispatchOffer resilience", () => {
  it("does not throw when sendSms returns ok:false (auth failed)", async () => {
    sendSmsMock.mockResolvedValueOnce({
      ok: false,
      error: "twilio_auth_failed (status=401, code=20003): Authenticate — verify TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN env vars",
    });

    await expect(notifyCleanerOfDispatchOffer(params)).resolves.toBeUndefined();

    const failureLog = logMock.mock.calls.find((c) => c[0]?.source === "dispatch_offer_sms_failed");
    expect(failureLog).toBeDefined();
    expect(failureLog![0]?.level).toBe("warn");

    const writeFailed = writeNotificationLogMock.mock.calls.find((c) => c[0]?.status === "failed");
    expect(writeFailed).toBeDefined();
    expect(writeFailed![0]?.template_key).toBe("dispatch_offer_link");
  });

  it("does not throw when sendSms throws an exception", async () => {
    sendSmsMock.mockRejectedValueOnce(new Error("boom: socket hang up"));

    await expect(notifyCleanerOfDispatchOffer(params)).resolves.toBeUndefined();

    const exceptionLog = logMock.mock.calls.find((c) => c[0]?.source === "dispatch_offer_sms_exception");
    expect(exceptionLog).toBeDefined();
    expect(exceptionLog![0]?.level).toBe("warn");
  });
});
