import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bookingPaymentRecomputeBlockedByRefund,
  bookingSignalsPaidForZeroDisplayRecompute,
  bookingsPersistFullFinancialSelectSuffix,
  bookingsPersistSelectListForPersist,
  hasPersistedDisplayEarningsBasis,
  resolvePersistCleanerIdForBooking,
} from "@/lib/payout/bookingEarningsIntegrity";

describe("bookingEarningsIntegrity", () => {
  it("treats 0 display as persisted (promo / free jobs)", () => {
    expect(hasPersistedDisplayEarningsBasis(0)).toBe(true);
  });

  it("rejects null, undefined, and negative", () => {
    expect(hasPersistedDisplayEarningsBasis(null)).toBe(false);
    expect(hasPersistedDisplayEarningsBasis(undefined)).toBe(false);
    expect(hasPersistedDisplayEarningsBasis(-1)).toBe(false);
  });

  it("resolves team payout owner over cleaner_id", () => {
    expect(
      resolvePersistCleanerIdForBooking({
        is_team_job: true,
        payout_owner_cleaner_id: "owner-uuid",
        cleaner_id: "other-uuid",
      }),
    ).toBe("owner-uuid");
  });

  it("resolves solo cleaner_id", () => {
    expect(
      resolvePersistCleanerIdForBooking({
        is_team_job: false,
        payout_owner_cleaner_id: null,
        cleaner_id: "solo-uuid",
      }),
    ).toBe("solo-uuid");
  });

  describe("bookingSignalsPaidForZeroDisplayRecompute", () => {
    it("is true when resolveTotalPaidCents path is positive", () => {
      expect(
        bookingSignalsPaidForZeroDisplayRecompute({
          total_paid_zar: 100,
          total_paid_cents: null,
          amount_paid_cents: null,
        }),
      ).toBe(true);
    });

    it("is true when cent columns are positive even if zar is zero", () => {
      expect(
        bookingSignalsPaidForZeroDisplayRecompute({
          total_paid_zar: 0,
          total_paid_cents: 10_000,
          amount_paid_cents: null,
        }),
      ).toBe(true);
      expect(
        bookingSignalsPaidForZeroDisplayRecompute({
          total_paid_zar: 0,
          total_paid_cents: null,
          amount_paid_cents: 5000,
        }),
      ).toBe(true);
    });

    it("is true for paid-like payment_status when amounts are still zero", () => {
      expect(
        bookingSignalsPaidForZeroDisplayRecompute({
          total_paid_zar: 0,
          total_paid_cents: 0,
          amount_paid_cents: 0,
          payment_status: "success",
        }),
      ).toBe(true);
      expect(
        bookingSignalsPaidForZeroDisplayRecompute({
          payment_status: "Succeeded",
        }),
      ).toBe(true);
    });

    it("is true when paid_at is set", () => {
      expect(
        bookingSignalsPaidForZeroDisplayRecompute({
          total_paid_zar: 0,
          total_paid_cents: 0,
          amount_paid_cents: 0,
          payment_status: "pending",
          paid_at: "2026-04-29T12:00:00.000Z",
        }),
      ).toBe(true);
    });

    it("is false when nothing indicates payment", () => {
      expect(
        bookingSignalsPaidForZeroDisplayRecompute({
          total_paid_zar: 0,
          total_paid_cents: 0,
          amount_paid_cents: 0,
          payment_status: "pending",
        }),
      ).toBe(false);
    });

    it("is false when refund signals block recompute despite success status", () => {
      expect(
        bookingSignalsPaidForZeroDisplayRecompute({
          total_paid_zar: 0,
          total_paid_cents: 0,
          amount_paid_cents: 0,
          payment_status: "success",
          refunded_at: "2026-04-29T14:00:00.000Z",
        }),
      ).toBe(false);
      expect(
        bookingSignalsPaidForZeroDisplayRecompute({
          payment_status: "success",
          refund_status: "partial",
        }),
      ).toBe(false);
    });
  });

  describe("bookingPaymentRecomputeBlockedByRefund", () => {
    it("detects refunded_at", () => {
      expect(bookingPaymentRecomputeBlockedByRefund({ refunded_at: "2026-01-01" })).toBe(true);
    });
    it("allows empty refund fields", () => {
      expect(bookingPaymentRecomputeBlockedByRefund({ refund_status: null, refunded_at: null })).toBe(false);
    });
  });

  describe("bookingsPersistSelectListForPersist", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("omits optional financial columns by default", () => {
      expect(bookingsPersistFullFinancialSelectSuffix()).toBe("");
      expect(bookingsPersistSelectListForPersist()).not.toContain("paid_at");
    });

    it("appends optional columns when SHALEAN_BOOKINGS_FINANCIAL_SNAPSHOT_COLS=1", () => {
      vi.stubEnv("SHALEAN_BOOKINGS_FINANCIAL_SNAPSHOT_COLS", "1");
      expect(bookingsPersistSelectListForPersist()).toContain("paid_at");
      expect(bookingsPersistSelectListForPersist()).toContain("refund_status");
    });
  });
});
