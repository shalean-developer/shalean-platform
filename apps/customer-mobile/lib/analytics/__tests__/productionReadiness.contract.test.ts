import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CUSTOMER_ANALYTICS_EVENTS,
  isAllowedCustomerAnalyticsEvent,
  sanitizeAnalyticsPayload,
} from "../customerAnalyticsEvents";
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL, buildLegalUrl } from "../../../constants/legal";
import { sanitizeExtras } from "../../monitoring/sanitizeExtras";

describe("customer analytics contract", () => {
  it("only allows registry-mapped event types", () => {
    assert.equal(isAllowedCustomerAnalyticsEvent(CUSTOMER_ANALYTICS_EVENTS.PAGE_VIEW), true);
    assert.equal(isAllowedCustomerAnalyticsEvent("book_start"), false);
    assert.equal(isAllowedCustomerAnalyticsEvent("home_open"), false);
  });

  it("strips PII from analytics payloads and tags client", () => {
    const cleaned = sanitizeAnalyticsPayload({
      email: "a@b.com",
      phone: "082",
      screen: "home",
      booking_id: "11111111-1111-4111-8111-111111111111",
    });
    assert.equal(cleaned.email, undefined);
    assert.equal(cleaned.phone, undefined);
    assert.equal(cleaned.client, "customer_mobile");
    assert.equal(cleaned.screen, "home");
  });
});

describe("legal URLs", () => {
  it("points at shalean.co.za privacy and terms", () => {
    assert.equal(PRIVACY_POLICY_URL, "https://shalean.co.za/privacy-policy");
    assert.equal(TERMS_OF_SERVICE_URL, "https://shalean.co.za/terms-of-service");
    assert.equal(buildLegalUrl("/privacy-policy"), PRIVACY_POLICY_URL);
  });
});

describe("crash extras sanitizer", () => {
  it("drops token/email keys", () => {
    const out = sanitizeExtras({
      email: "x@y.com",
      token: "secret",
      screen: "pay",
    });
    assert.equal(out.email, undefined);
    assert.equal(out.token, undefined);
    assert.equal(out.screen, "pay");
  });
});
