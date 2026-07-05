import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bookingPaymentRecomputeBlockedByRefund,
  bookingSignalsPaidForZeroDisplayRecompute,
  bookingsPersistFullFinancialSelectSuffix,
  bookingsPersistSelectListForPersist,
  hasPersistedDisplayEarningsBasis,
  isCompletableDisplayEarningsCents,
  pickPrimaryRosterCleanerId,
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

  /**
   * Strict positive helper for the cleaner-self-complete gate. R0 is unsafe
   * here because the booking has no payment basis (e.g. unpaid recurring
   * monthly invoice, backfill line items priced at R0) — letting the cleaner
   * complete locks in a no-payout job. Differs from
   * {@link hasPersistedDisplayEarningsBasis} which intentionally accepts 0.
   */
  describe("isCompletableDisplayEarningsCents (strict positive completion gate)", () => {
    it("accepts strictly positive integer cents", () => {
      expect(isCompletableDisplayEarningsCents(1)).toBe(true);
      expect(isCompletableDisplayEarningsCents(40000)).toBe(true);
    });

    it("REJECTS zero (this is the bug fix — R0 backfill bookings)", () => {
      expect(isCompletableDisplayEarningsCents(0)).toBe(false);
    });

    it("rejects null and undefined", () => {
      expect(isCompletableDisplayEarningsCents(null)).toBe(false);
      expect(isCompletableDisplayEarningsCents(undefined)).toBe(false);
    });

    it("rejects negative and non-finite values", () => {
      expect(isCompletableDisplayEarningsCents(-1)).toBe(false);
      expect(isCompletableDisplayEarningsCents(Number.NaN)).toBe(false);
      expect(isCompletableDisplayEarningsCents(Number.POSITIVE_INFINITY)).toBe(false);
    });

    it("accepts numeric strings with positive value (defensive — DB driver coercion)", () => {
      expect(isCompletableDisplayEarningsCents("40000")).toBe(true);
      expect(isCompletableDisplayEarningsCents("0")).toBe(false);
    });
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

  it("pickPrimaryRosterCleanerId prefers primary/lead role", () => {
    expect(
      pickPrimaryRosterCleanerId([
        { cleaner_id: "member-b", role: "assistant" },
        { cleaner_id: "member-a", role: "primary" },
      ]),
    ).toBe("member-a");
    expect(pickPrimaryRosterCleanerId([{ cleaner_id: "only-one", role: "assistant" }])).toBe("only-one");
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

  /**
   * Production Readiness Audit H-11 — `paid_at`, `refunded_at`, and `refund_status`
   * must be unconditionally selected so refund-blocking and paid-signal heuristics
   * cannot silently degrade in environments where an env var was forgotten.
   */
  describe("bookingsPersistSelectListForPersist (H-11: financial snapshot is always on)", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("always returns the financial suffix regardless of SHALEAN_BOOKINGS_FINANCIAL_SNAPSHOT_COLS", () => {
      vi.stubEnv("SHALEAN_BOOKINGS_FINANCIAL_SNAPSHOT_COLS", "");
      expect(bookingsPersistFullFinancialSelectSuffix()).toBe(",paid_at,refunded_at,refund_status");

      vi.stubEnv("SHALEAN_BOOKINGS_FINANCIAL_SNAPSHOT_COLS", "0");
      expect(bookingsPersistFullFinancialSelectSuffix()).toBe(",paid_at,refunded_at,refund_status");

      vi.stubEnv("SHALEAN_BOOKINGS_FINANCIAL_SNAPSHOT_COLS", "1");
      expect(bookingsPersistFullFinancialSelectSuffix()).toBe(",paid_at,refunded_at,refund_status");
    });

    it("persist select list includes paid_at, refunded_at, refund_status by default", () => {
      vi.stubEnv("SHALEAN_BOOKINGS_FINANCIAL_SNAPSHOT_COLS", "");
      const list = bookingsPersistSelectListForPersist();
      expect(list).toContain("paid_at");
      expect(list).toContain("refunded_at");
      expect(list).toContain("refund_status");
    });

    it("env var removal does not silently strip refund signals (H-11 acceptance criterion)", () => {
      delete (process.env as Record<string, string | undefined>).SHALEAN_BOOKINGS_FINANCIAL_SNAPSHOT_COLS;
      const list = bookingsPersistSelectListForPersist();
      expect(list).toContain("refund_status");
      expect(list).toContain("refunded_at");
    });
  });

  /**
   * H-11 acceptance: refund-blocking is not silently bypassed when the SELECT loads a row
   * with refund columns populated. With the columns always selected, `bookingPaymentRecomputeBlockedByRefund`
   * receives the real values and returns the correct decision.
   */
  describe("refund-blocking visibility (H-11)", () => {
    it("blocks recompute when refund_status is a known terminal value", () => {
      for (const status of ["refunded", "full", "partial", "chargeback", "reversed", "failed_after_success"]) {
        expect(bookingPaymentRecomputeBlockedByRefund({ refund_status: status })).toBe(true);
      }
    });

    it("blocks recompute when refunded_at is set even with empty refund_status", () => {
      expect(
        bookingPaymentRecomputeBlockedByRefund({
          refund_status: null,
          refunded_at: "2026-04-29T12:00:00Z",
        }),
      ).toBe(true);
    });

    it("does not block recompute when both refund columns are empty (typical paid row)", () => {
      expect(
        bookingPaymentRecomputeBlockedByRefund({
          refund_status: null,
          refunded_at: null,
        }),
      ).toBe(false);
    });

    it("paid-signal still respects refund block when columns are loaded", () => {
      expect(
        bookingSignalsPaidForZeroDisplayRecompute({
          payment_status: "success",
          paid_at: "2026-04-29T12:00:00Z",
          refunded_at: "2026-04-30T12:00:00Z",
        }),
      ).toBe(false);
    });
  });
});
