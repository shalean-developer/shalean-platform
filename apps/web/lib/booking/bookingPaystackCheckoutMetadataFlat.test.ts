import type { BookingRowPaymentInput } from "@/lib/payments/bookingPaymentSummary";
import { bookingRowToPaymentSummary } from "@/lib/payments/bookingPaymentSummary";
import {
  buildCanonicalPaystackCheckoutMetadata,
  PAYSTACK_CHECKOUT_METADATA_CONTRACT_VERSION,
  parseLockTimingFromBookingSnapshotJson,
} from "@/lib/booking/bookingPaystackCheckoutMetadataFlat";
import { describe, expect, it } from "vitest";

describe("buildCanonicalPaystackCheckoutMetadata", () => {
  const minimal = {
    payment_path: "inline_checkout" as const,
    internalBookingId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    booking_json: JSON.stringify({ v: 1, cleaner_name: "Pat" }),
    booking_snapshot_version: "1",
    locked_at: "2026-05-01T10:00:00.000Z",
    quote_signature: "abc",
    lock_expires_at: "2026-05-01T11:00:00.000Z",
    selected_cleaner_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    cleaner_name: "Pat",
    assignment_type: "user_selected",
    service_slug: "standard_cleaning",
    customer_email: "c@example.com",
    customer_name: "C",
    customer_phone: "+27123456789",
    customer_user_id: "",
    customer_type: "guest",
    tip_zar: "0",
    discount_zar: "0",
    promo_code: "",
    locked_final_zar: "500",
    pay_total_zar: "500",
    expected_total_zar: "500",
    price_snapshot: JSON.stringify({ version: 1, total_zar: 500 }),
    booking: JSON.stringify({ service: "standard" }),
    payment_mode: "existing_booking",
    attribution_source: "",
    analytics_session_id: "",
  };

  it("mirrors selected_cleaner_id into cleaner_id and sets contract version", () => {
    const m = buildCanonicalPaystackCheckoutMetadata(minimal);
    expect(m.shalean_checkout_meta_v).toBe(PAYSTACK_CHECKOUT_METADATA_CONTRACT_VERSION);
    expect(m.payment_path).toBe("inline_checkout");
    expect(m.selected_cleaner_id).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(m.cleaner_id).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(m.assignment_type).toBe("user_selected");
    expect(m.service_slug).toBe("standard_cleaning");
    expect(m.shalean_booking_id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(m.booking_id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("normalizes empty selected cleaner to empty cleaner_id", () => {
    const m = buildCanonicalPaystackCheckoutMetadata({ ...minimal, selected_cleaner_id: "" });
    expect(m.selected_cleaner_id).toBe("");
    expect(m.cleaner_id).toBe("");
  });

  it("server_initialize path is labeled", () => {
    const m = buildCanonicalPaystackCheckoutMetadata({
      ...minimal,
      payment_path: "server_initialize",
    });
    expect(m.payment_path).toBe("server_initialize");
  });
});

describe("parseLockTimingFromBookingSnapshotJson", () => {
  it("reads lock fields from snapshot JSON", () => {
    const json = JSON.stringify({
      v: 2,
      locked: {
        lockedAt: "2026-01-02T08:00:00.000Z",
        quoteSignature: "sig1",
        lockExpiresAt: "2026-01-02T09:00:00.000Z",
      },
    });
    const t = parseLockTimingFromBookingSnapshotJson(json);
    expect(t.snapshotVersion).toBe("2");
    expect(t.lockedAt).toBe("2026-01-02T08:00:00.000Z");
    expect(t.quoteSignature).toBe("sig1");
    expect(t.lockExpiresAt).toBe("2026-01-02T09:00:00.000Z");
  });
});

describe("metadata parity: inline summary vs server-shaped canonical", () => {
  const cleanerUuid = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const row: BookingRowPaymentInput = {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    customer_email: "x@y.com",
    service: "Standard Cleaning",
    service_slug: "standard_cleaning",
    rooms: 2,
    bathrooms: 1,
    total_price: 900,
    status: "pending_payment",
    selected_cleaner_id: cleanerUuid,
    assignment_type: "user_selected",
    booking_snapshot: {
      v: 1,
      locked: {
        lockedAt: "2026-03-01T12:00:00.000Z",
        quoteSignature: "qs",
        lockExpiresAt: "2026-03-01T13:00:00.000Z",
        service: "standard_cleaning",
        date: "2026-03-10",
        time: "09:00",
        rooms: 2,
        bathrooms: 1,
        extras: [],
        location: "Cape Town",
        finalPrice: 900,
        cleanersCount: 1,
      },
      cleaner_name: "Lee",
      customer: { name: "A", email: "x@y.com", phone: "+27000000000", user_id: null, type: "guest" as const },
    },
  };

  it("buildInline-equivalent metadata carries selected_cleaner_id from DB row", () => {
    const summary = bookingRowToPaymentSummary(row);
    expect(summary.selectedCleanerId).toBe(cleanerUuid.toLowerCase());
    expect(summary.assignmentType).toBe("user_selected");
    expect(summary.serviceSlug).toBe("standard_cleaning");

    const lockTiming = parseLockTimingFromBookingSnapshotJson(summary.bookingSnapshotJson);
    const meta = buildCanonicalPaystackCheckoutMetadata({
      payment_path: "inline_checkout",
      internalBookingId: summary.id,
      booking_json: summary.bookingSnapshotJson ?? "",
      booking_snapshot_version: lockTiming.snapshotVersion,
      locked_at: lockTiming.lockedAt,
      quote_signature: lockTiming.quoteSignature,
      lock_expires_at: lockTiming.lockExpiresAt,
      selected_cleaner_id: summary.selectedCleanerId ?? "",
      cleaner_name: summary.cleanerName ?? "",
      assignment_type: summary.assignmentType?.trim() || (summary.selectedCleanerId ? "user_selected" : ""),
      service_slug: summary.serviceSlug ?? "",
      customer_email: "x@y.com",
      customer_name: summary.customerName ?? "",
      customer_phone: summary.customerPhone ?? "",
      customer_user_id: summary.customerUserId ?? "",
      customer_type: "guest",
      tip_zar: "0",
      discount_zar: "0",
      promo_code: "",
      locked_final_zar: String(summary.priceZar),
      pay_total_zar: String(summary.priceZar),
      expected_total_zar: String(summary.priceZar),
      price_snapshot: JSON.stringify({ version: 1, total_zar: summary.priceZar }),
      booking: JSON.stringify({ service: summary.service }),
      payment_mode: "existing_booking",
      attribution_source: "",
      analytics_session_id: "",
    });

    expect(meta.selected_cleaner_id).toBe(cleanerUuid.toLowerCase());
    expect(meta.cleaner_id).toBe(cleanerUuid.toLowerCase());
    expect(meta.quote_signature).toBe("qs");
    expect(meta.lock_expires_at).toBe("2026-03-01T13:00:00.000Z");
  });
});
