import { describe, expect, it } from "vitest";
import {
  decidePaymentLinkAction,
  deliveryHasSuccessfulSend,
  normalizePhoneTryOrder,
  normalizePhoneTryOrderForCustomer,
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

describe("normalizePhoneTryOrderForCustomer", () => {
  it("keeps SMS only and never adds WhatsApp", () => {
    expect(normalizePhoneTryOrderForCustomer(["sms", "whatsapp"])).toEqual(["sms"]);
    expect(normalizePhoneTryOrderForCustomer(["whatsapp", "sms"])).toEqual(["sms"]);
  });
});

describe("parsePaymentLinkDeliveryChannels", () => {
  it("detects successful send", () => {
    const ch = parsePaymentLinkDeliveryChannels({ whatsapp: "failed", sms: "sent", email: "skipped" });
    expect(deliveryHasSuccessfulSend(ch)).toBe(true);
  });
});

describe("selectOptimalChannelStrategy", () => {
  it("customer target is SMS-only on phone (no WhatsApp)", () => {
    const order = selectOptimalChannelStrategy({
      channelStats: richStats,
      priorPaymentConversionBucket: null,
      target: "customer",
    });
    expect(order).toEqual(["sms"]);
  });

  it("admin target yields no phone channels", () => {
    expect(
      selectOptimalChannelStrategy({
        channelStats: defaultStats,
        priorPaymentConversionBucket: null,
        target: "admin",
      }),
    ).toEqual([]);
  });

  it("cleaner: prefers SMS first when WA success rate is poor (enough sample)", () => {
    const order = selectOptimalChannelStrategy({
      channelStats: richStats,
      priorPaymentConversionBucket: null,
      target: "cleaner",
    });
    expect(order[0]).toBe("sms");
  });

  it("cleaner: defaults to WhatsApp first when WA is healthy", () => {
    const order = selectOptimalChannelStrategy({
      channelStats: defaultStats,
      priorPaymentConversionBucket: "fast",
      target: "cleaner",
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
  it("customer: email then SMS, no WhatsApp in channels; phone order SMS-only", () => {
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
    expect(d.target).toBe("customer");
    expect(d.channels).toEqual(["email", "sms"]);
    expect(d.channels.includes("whatsapp")).toBe(false);
    expect(d.phoneTryOrder).toEqual(["sms"]);
    expect(d.reason).toContain("policy_customer_email_first");
    expect(d.send_now).toBe(true);
  });

  it("customer: includes email for chain_plus_email (and does not put WhatsApp in channels)", () => {
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
    expect(d.channels.includes("whatsapp")).toBe(false);
  });

  it("cleaner: channels are WhatsApp then SMS when phone present", () => {
    const d = decidePaymentLinkAction({
      target: "cleaner",
      intent: "initial_send",
      notificationMode: "chain",
      hasPhone: true,
      hasEmail: true,
      priorPaymentConversionBucket: null,
      channelStats: defaultStats,
      booking: {},
      nowMs: Date.now(),
    });
    expect(d.target).toBe("cleaner");
    expect(d.reason).toContain("policy_cleaner_whatsapp");
    expect(d.channels[0]).toBe("whatsapp");
    expect(d.channels.includes("email")).toBe(false);
  });

  it("admin: email only, no phone try order", () => {
    const d = decidePaymentLinkAction({
      target: "admin",
      intent: "initial_send",
      notificationMode: "chain_plus_email",
      hasPhone: true,
      hasEmail: true,
      priorPaymentConversionBucket: null,
      channelStats: defaultStats,
      booking: {},
      nowMs: Date.now(),
    });
    expect(d.target).toBe("admin");
    expect(d.channels).toEqual(["email"]);
    expect(d.phoneTryOrder).toEqual([]);
    expect(d.reason).toContain("policy_admin_email_only");
  });
});
