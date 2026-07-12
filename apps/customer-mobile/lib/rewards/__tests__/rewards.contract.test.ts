import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildReferralInviteUrl, buildReferralShareMessage } from "../referralShare";
import { isBookingPendingCustomerReview, resolveReviewCleanerId } from "../reviewEligibility";

describe("referralShare", () => {
  it("builds invite URL with ref query", () => {
    const url = buildReferralInviteUrl("ABC12");
    assert.match(url, /\/refer\?ref=ABC12$/);
  });

  it("includes invite URL in share message", () => {
    const msg = buildReferralShareMessage("https://shalean.co.za/refer?ref=X");
    assert.match(msg, /refer\?ref=X/);
    assert.match(msg, /Shalean/);
  });
});

describe("reviewEligibility", () => {
  it("resolves solo cleaner_id", () => {
    assert.equal(
      resolveReviewCleanerId({ cleaner_id: "11111111-1111-4111-8111-111111111111" }),
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("falls back to payout_owner for team jobs", () => {
    assert.equal(
      resolveReviewCleanerId({
        cleaner_id: null,
        is_team_job: true,
        payout_owner_cleaner_id: "22222222-2222-4222-8222-222222222222",
      }),
      "22222222-2222-4222-8222-222222222222",
    );
  });

  it("marks completed unreviewed booking as pending", () => {
    assert.equal(
      isBookingPendingCustomerReview(
        {
          id: "b1",
          status: "completed",
          cleaner_id: "11111111-1111-4111-8111-111111111111",
        },
        new Set(),
      ),
      true,
    );
  });

  it("skips already reviewed or non-completed", () => {
    assert.equal(
      isBookingPendingCustomerReview(
        {
          id: "b1",
          status: "completed",
          cleaner_id: "11111111-1111-4111-8111-111111111111",
        },
        new Set(["b1"]),
      ),
      false,
    );
    assert.equal(
      isBookingPendingCustomerReview(
        {
          id: "b2",
          status: "confirmed",
          cleaner_id: "11111111-1111-4111-8111-111111111111",
        },
        new Set(),
      ),
      false,
    );
  });
});

describe("checkout credit regression", () => {
  it("confirm payload still accepts applyCleaningCreditZar (server spends credit)", async () => {
    const { buildConfirmPayload } = await import("../../booking/buildConfirmPayload");
    const { defaultBookingFormData } = await import("../../booking/defaultForm");
    const form = defaultBookingFormData("regular-cleaning");
    const payload = buildConfirmPayload(
      {
        ...form,
        serviceDetails: { bedrooms: "2", bathrooms: "1", extraRooms: "0", propertyType: "house" },
        address: "12 Ocean View Drive",
        suburb: "Claremont",
        serviceAreaLocationId: "00000000-0000-4000-8000-000000000010",
        serviceAreaCityId: "00000000-0000-4000-8000-000000000020",
        city: "Cape Town",
        postalCode: "7708",
        contactPhone: "0821234567",
        date: "2026-08-15",
        time: "09:00",
        pricingSummary: {
          ...form.pricingSummary,
          total: 574,
          estimated_total: 574,
        },
      },
      {
        applyCleaningCreditZar: 75,
        referralCode: "FRIEND",
      },
    );
    assert.equal(payload.applyCleaningCreditZar, 75);
    assert.equal(payload.referralCode, "FRIEND");
    assert.ok(!("creditBalance" in payload));
  });
});
