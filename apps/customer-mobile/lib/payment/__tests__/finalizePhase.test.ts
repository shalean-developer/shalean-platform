import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPaystackInlineHtml } from "../../../features/payment/buildPaystackInlineHtml";
import {
  mapVerifyFailureToPhase,
  mapVerifySuccessToPhase,
} from "../mapFinalizePhase";
import {
  STATUS_POLL_DELAY_MS,
  STATUS_POLL_MAX_ATTEMPTS,
  VERIFY_MAX_ATTEMPTS,
  VERIFY_RETRY_DELAY_MS,
} from "../verifyConstants";

describe("verifyConstants", () => {
  it("mirrors web booking/success verify + status poll caps", () => {
    assert.equal(VERIFY_MAX_ATTEMPTS, 3);
    assert.equal(VERIFY_RETRY_DELAY_MS, 1500);
    assert.equal(STATUS_POLL_MAX_ATTEMPTS, 10);
    assert.equal(STATUS_POLL_DELAY_MS, 2000);
  });
});

describe("mapFinalizePhase", () => {
  it("maps persisted verify to success", () => {
    const result = mapVerifySuccessToPhase({
      success: true,
      paymentStatus: "success",
      bookingInDatabase: true,
      bookingId: "bk-1",
      bookingReference: "SHL-BK-1",
    });
    assert.equal(result.phase, "success");
    assert.equal(result.bookingId, "bk-1");
  });

  it("maps unpaid persist to persist_pending until status leaves pending_payment", () => {
    const pending = mapVerifySuccessToPhase({
      success: true,
      paymentStatus: "success",
      bookingInDatabase: false,
      bookingId: null,
    });
    assert.equal(pending.phase, "persist_pending");

    const settled = mapVerifySuccessToPhase(
      {
        success: true,
        paymentStatus: "success",
        bookingInDatabase: false,
        bookingId: null,
      },
      { bookingId: "bk-2", status: "pending" },
    );
    assert.equal(settled.phase, "success");
    assert.equal(settled.bookingId, "bk-2");
  });

  it("maps failed verify to failed and pending exhaustion to needs_retry", () => {
    const failed = mapVerifyFailureToPhase(
      { success: false, paymentStatus: "failed", error: "Declined" },
      false,
    );
    assert.equal(failed?.phase, "failed");

    const retrying = mapVerifyFailureToPhase(
      { success: false, paymentStatus: "pending" },
      false,
    );
    assert.equal(retrying, null);

    const needsRetry = mapVerifyFailureToPhase(
      { success: false, paymentStatus: "pending", error: "Still processing" },
      true,
    );
    assert.equal(needsRetry?.phase, "needs_retry");
  });
});

describe("buildPaystackInlineHtml", () => {
  it("includes public key, reference, amount in kobo, currency, and metadata", () => {
    const html = buildPaystackInlineHtml({
      publicKey: "pk_test_abc",
      email: "customer@example.com",
      amountZar: 450,
      reference: "bv2_ref_123",
      bookingId: "00000000-0000-4000-8000-000000000099",
    });

    assert.match(html, /js\.paystack\.co\/v1\/inline\.js/);
    assert.match(html, /pk_test_abc/);
    assert.match(html, /bv2_ref_123/);
    assert.match(html, /amount:\s*45000/);
    assert.match(html, /currency:\s*'ZAR'/);
    assert.match(html, /booking_id/);
    assert.match(html, /pay_total_zar/);
    assert.match(html, /expected_total_zar/);
    assert.match(html, /type:\s*'success'/);
    assert.match(html, /type:\s*'cancel'/);
  });
});
