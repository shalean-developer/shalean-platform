import { describe, expect, it } from "vitest";
import {
  decidePaymentLinkAction,
  deliveryHasSuccessfulSend,
  normalizePhoneTryOrder,
  parsePaymentLinkDeliveryChannels,
  predictPaymentRisk,
  selectOptimalChannelStrategy,
} from "@/lib/pay/paymentDecisionEngine";
import type { PaymentLinkChannelStats } from "@/lib/pay/paymentLinkDeliveryStats";

const richStats: PaymentLinkChannelStats = {
  sample_size: 80,
  whatsapp_success_rate: 0.5,
  sms_fallback_rate: 0.55,
  email_only_rate: 0.1,
};

const defaultStats: PaymentLinkChannelStats = {
  sample_size: 80,
  whatsapp_success_rate: 0.9,
  sms_fallback_rate: 0.35,
  email_only_rate: 0.05,
};

describe("normalizePhoneTryOrder", () => {
  it("dedupes and appends missing channel", () => {
    expect(normalizePhoneTryOrder(["sms"])).toEqual(["sms", "whatsapp"]);
    expect(normalizePhoneTryOrder(["sms", "whatsapp"])).toEqual(["sms", "whatsapp"]);
  });
});

describe("parsePaymentLinkDeliveryChannels", () => {
  it("detects successful send", () => {
    const ch = parsePaymentLinkDeliveryChannels({ whatsapp: "failed", sms: "sent", email: "skipped" });
    expect(deliveryHasSuccessfulSend(ch)).toBe(true);
  });
});

describe("selectOptimalChannelStrategy", () => {
  it("prefers SMS first when WA success rate is poor (enough sample)", () => {
    const order = selectOptimalChannelStrategy({
      channelStats: richStats,
      priorPaymentConversionBucket: null,
    });
    expect(order[0]).toBe("sms");
  });

  it("defaults to WhatsApp first when WA is healthy", () => {
    const order = selectOptimalChannelStrategy({
      channelStats: defaultStats,
      priorPaymentConversionBucket: "fast",
    });
    expect(order).toEqual(["whatsapp", "sms"]);
  });
});

describe("predictPaymentRisk", () => {
  it("flags high when multiple sends and no channel success", () => {
    const r = predictPaymentRisk({
      payment_link_send_count: 2,
      payment_conversion_bucket: null,
      priorPaymentConversionBucket: "fast",
      payment_link_first_sent_at: new Date(Date.now() - 50 * 60_000).toISOString(),
      payment_link_delivery: { whatsapp: "failed", sms: "failed", email: "skipped" },
      nowMs: Date.now(),
    });
    expect(r.risk_level).toBe("high");
  });

  it("returns low for prior instant payers", () => {
    const r = predictPaymentRisk({
      payment_link_send_count: 3,
      payment_conversion_bucket: null,
      priorPaymentConversionBucket: "instant",
      payment_link_first_sent_at: new Date().toISOString(),
      payment_link_delivery: {},
      nowMs: Date.now(),
    });
    expect(r.risk_level).toBe("low");
  });
});

describe("decidePaymentLinkAction", () => {
  it("includes email in channel list for chain_plus_email", () => {
    const d = decidePaymentLinkAction({
      intent: "initial_send",
      notificationMode: "chain_plus_email",
      hasPhone: true,
      hasEmail: true,
      priorPaymentConversionBucket: null,
      channelStats: defaultStats,
      booking: {},
      nowMs: Date.now(),
    });
    expect(d.channels.includes("email")).toBe(true);
    expect(d.send_now).toBe(true);
  });
});
