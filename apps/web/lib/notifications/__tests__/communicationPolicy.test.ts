import { afterEach, describe, expect, it } from "vitest";
import {
  getSmsOutboundDecision,
  isCleanerEmailOutboundAllowed,
} from "@/lib/notifications/communicationPolicy";

describe("communicationPolicy", () => {
  const prevSmsEnabled = process.env.SMS_OUTBOUND_ENABLED;

  afterEach(() => {
    if (prevSmsEnabled === undefined) delete process.env.SMS_OUTBOUND_ENABLED;
    else process.env.SMS_OUTBOUND_ENABLED = prevSmsEnabled;
  });

  it("never allows cleaner email outbound", () => {
    expect(isCleanerEmailOutboundAllowed()).toBe(false);
  });

  it("blocks all SMS when SMS_OUTBOUND_ENABLED is unset", () => {
    delete process.env.SMS_OUTBOUND_ENABLED;
    expect(getSmsOutboundDecision("cleaner")).toEqual({ allowed: false, reason: "sms_outbound_disabled" });
    expect(getSmsOutboundDecision("customer")).toEqual({ allowed: false, reason: "sms_outbound_disabled" });
    expect(getSmsOutboundDecision("admin")).toEqual({ allowed: false, reason: "sms_outbound_disabled" });
  });

  it("allows cleaner SMS only when SMS_OUTBOUND_ENABLED=true", () => {
    process.env.SMS_OUTBOUND_ENABLED = "true";
    expect(getSmsOutboundDecision("cleaner")).toEqual({ allowed: true });
    expect(getSmsOutboundDecision("customer")).toEqual({ allowed: false, reason: "customer_sms_disabled_by_policy" });
    expect(getSmsOutboundDecision("admin")).toEqual({ allowed: false, reason: "admin_sms_disabled_by_policy" });
    expect(getSmsOutboundDecision(undefined)).toEqual({ allowed: false, reason: "customer_sms_disabled_by_policy" });
  });
});
