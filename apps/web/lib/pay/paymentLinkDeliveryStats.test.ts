import { describe, expect, it } from "vitest";
import {
  aggregatePaymentLinkDeliveryStats,
  escalateReminderSchedule,
  reminderScheduleForPriorBucket,
} from "@/lib/pay/paymentLinkDeliveryStats";

describe("aggregatePaymentLinkDeliveryStats", () => {
  it("returns zeros for empty input", () => {
    const s = aggregatePaymentLinkDeliveryStats([]);
    expect(s.sample_size).toBe(0);
    expect(s.whatsapp_success_rate).toBeNull();
    expect(s.sms_fallback_rate).toBeNull();
    expect(s.email_only_rate).toBeNull();
  });

  it("computes WA success among attempts", () => {
    const s = aggregatePaymentLinkDeliveryStats([
      { payment_link_delivery: { whatsapp: "sent", sms: "skipped", email: "skipped" } },
      { payment_link_delivery: { whatsapp: "failed", sms: "sent", email: "skipped" } },
      { payment_link_delivery: { whatsapp: "failed", sms: "failed", email: "sent" } },
    ]);
    expect(s.sample_size).toBe(3);
    expect(s.whatsapp_success_rate).toBeCloseTo(1 / 3, 4);
    expect(s.sms_fallback_rate).toBeCloseTo(0.5, 4);
    expect(s.email_only_rate).toBeCloseTo(1 / 3, 4);
  });
});

describe("reminderScheduleForPriorBucket", () => {
  it("skips reminders for instant payers", () => {
    const r = reminderScheduleForPriorBucket("instant");
    expect(r.skipReminders).toBe(true);
  });

  it("widens windows for slow/medium", () => {
    const r = reminderScheduleForPriorBucket("slow");
    expect(r.skipReminders).toBe(false);
    expect(r.window1hMin).toBe(98);
    expect(r.window15mMin).toBe(32);
  });
});

describe("escalateReminderSchedule", () => {
  it("shifts windows earlier on high risk", () => {
    const base = reminderScheduleForPriorBucket("fast");
    const up = escalateReminderSchedule(base, "high");
    expect(up.window1hMin).toBeGreaterThan(base.window1hMin);
    expect(up.window15mMin).toBeGreaterThan(base.window15mMin);
  });

  it("no-ops for low risk", () => {
    const base = reminderScheduleForPriorBucket("fast");
    expect(escalateReminderSchedule(base, "low")).toEqual(base);
  });
});
