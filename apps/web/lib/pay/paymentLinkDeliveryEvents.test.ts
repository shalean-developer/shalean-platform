import type { AdminPaymentLinkDeliveryResult } from "@/lib/admin/adminPaymentLinkDelivery";
import { describe, expect, it } from "vitest";
import {
  buildPaymentLinkDeliveryEventRows,
  paymentAttributionFromSentChannelList,
  resolvePaymentLinkPassType,
} from "@/lib/pay/paymentLinkDeliveryEvents";

function result(by: AdminPaymentLinkDeliveryResult["byChannel"]): AdminPaymentLinkDeliveryResult {
  const email = by.email === "sent" ? "sent" : by.email === "failed" ? "failed" : "skipped";
  const sms = by.sms === "sent" ? "sent" : by.sms === "failed" ? "failed" : "skipped";
  return {
    whatsappOk: null,
    smsOk: null,
    emailOk: null,
    twilioSmsSid: null,
    primaryChannel: "none",
    fallbackTrace: "",
    byChannel: by,
    smsDeliveryRole: "none",
    delivery: { email, sms },
  };
}

describe("resolvePaymentLinkPassType", () => {
  it("prefers explicit passType", () => {
    expect(resolvePaymentLinkPassType({ passType: "admin_initial", pass: "reminder_1h" })).toBe("admin_initial");
  });
  it("maps legacy pass", () => {
    expect(resolvePaymentLinkPassType({ pass: "admin_resend" })).toBe("admin_resend");
    expect(resolvePaymentLinkPassType({ pass: "reminder_15m" })).toBe("reminder_15m");
  });
});

describe("paymentAttributionFromSentChannelList", () => {
  it("returns empty assists for 0–2 touches", () => {
    expect(paymentAttributionFromSentChannelList([])).toEqual({
      firstTouch: null,
      lastTouch: null,
      assistChannels: [],
    });
    expect(paymentAttributionFromSentChannelList(["whatsapp"])).toEqual({
      firstTouch: "whatsapp",
      lastTouch: "whatsapp",
      assistChannels: [],
    });
    expect(paymentAttributionFromSentChannelList(["whatsapp", "sms"])).toEqual({
      firstTouch: "whatsapp",
      lastTouch: "sms",
      assistChannels: [],
    });
  });

  it("dedupes ordered middle assists", () => {
    expect(paymentAttributionFromSentChannelList(["whatsapp", "sms", "whatsapp", "email"])).toEqual({
      firstTouch: "whatsapp",
      lastTouch: "email",
      assistChannels: ["sms", "whatsapp"],
    });
  });
});

describe("buildPaymentLinkDeliveryEventRows", () => {
  it("omits skipped channels", () => {
    const r = result({ whatsapp: "failed", sms: "sent", email: "skipped" });
    const rows = buildPaymentLinkDeliveryEventRows("b1", r, "admin_initial");
    expect(rows).toEqual([
      { booking_id: "b1", channel: "whatsapp", status: "failed", pass_type: "admin_initial" },
      { booking_id: "b1", channel: "sms", status: "sent", pass_type: "admin_initial" },
    ]);
  });
});
