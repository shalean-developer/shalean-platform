import { describe, expect, it } from "vitest";
import {
  computeCleanerOfferEarningsSnapshot,
  OFFER_EARNINGS_SOURCE,
} from "@/lib/payout/computeCleanerOfferEarningsSnapshot";

const TODAY_BOOKING_DATE = "2026-05-12";
const TODAY_BOOKING_TIME = "10:00";

/** Junior tenure: under 4 months → 60% rate. */
const JUNIOR_JOINED_AT = "2026-04-01T00:00:00.000Z";
/** Experienced tenure: ≥ 4 months → 70% rate. */
const EXPERIENCED_JOINED_AT = "2024-01-01T00:00:00.000Z";

describe("computeCleanerOfferEarningsSnapshot", () => {
  describe("solo standard", () => {
    it("resolves canonical 60% × R600 = R360 → clamped to R300 cap for a junior cleaner", () => {
      /** R600 booking → 60% = R360 → capped at R300 (v3 canonical engine). */
      const r = computeCleanerOfferEarningsSnapshot({
        booking: {
          is_team_job: false,
          service: "Standard cleaning",
          date: TODAY_BOOKING_DATE,
          time: TODAY_BOOKING_TIME,
          total_paid_zar: 600,
        },
        cleaner: { joined_at: JUNIOR_JOINED_AT },
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.amount_cents).toBe(30_000);
      expect(r.source).toBe(OFFER_EARNINGS_SOURCE.CANONICAL);
      expect(r.diagnostics.payout_percentage).toBeCloseTo(0.6);
      expect(r.diagnostics.payout_mode).toBe("solo_percentage");
    });

    it("uses the experienced 70% rate capped at R300 when cleaner tenure ≥ 4 months", () => {
      /** Same R600 booking → 70% = R420 → capped at R300. */
      const r = computeCleanerOfferEarningsSnapshot({
        booking: {
          is_team_job: false,
          service: "Standard cleaning",
          date: TODAY_BOOKING_DATE,
          time: TODAY_BOOKING_TIME,
          total_paid_zar: 600,
        },
        cleaner: { joined_at: EXPERIENCED_JOINED_AT },
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.amount_cents).toBe(30_000);
      expect(r.diagnostics.payout_percentage).toBeCloseTo(0.7);
    });

    it("flags MISSING_PAYMENT_BASIS when solo standard has zero payment basis", () => {
      const r = computeCleanerOfferEarningsSnapshot({
        booking: {
          is_team_job: false,
          service: "Standard cleaning",
          date: TODAY_BOOKING_DATE,
          time: TODAY_BOOKING_TIME,
          total_paid_zar: null,
          total_paid_cents: 0,
          base_amount_cents: 0,
        },
        cleaner: { joined_at: EXPERIENCED_JOINED_AT },
      });
      expect(r.ok).toBe(false);
      expect(r.amount_cents).toBeNull();
      expect(r.source).toBe(OFFER_EARNINGS_SOURCE.MISSING_PAYMENT_BASIS);
    });

    it("flags MISSING_APPOINTMENT_INSTANT when solo standard cannot derive tenure", () => {
      const r = computeCleanerOfferEarningsSnapshot({
        booking: {
          is_team_job: false,
          service: "Standard cleaning",
          date: null,
          time: null,
          total_paid_zar: 600,
        },
        cleaner: { joined_at: EXPERIENCED_JOINED_AT },
      });
      expect(r.ok).toBe(false);
      expect(r.source).toBe(OFFER_EARNINGS_SOURCE.MISSING_APPOINTMENT_INSTANT);
    });

    it("returns junior amount with CLEANER_TENURE_UNKNOWN when cleaner has no joined_at/created_at", () => {
      const r = computeCleanerOfferEarningsSnapshot({
        booking: {
          is_team_job: false,
          service: "Standard cleaning",
          date: TODAY_BOOKING_DATE,
          time: TODAY_BOOKING_TIME,
          total_paid_zar: 600,
        },
        cleaner: { joined_at: null, created_at: null },
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      /** Tenure = 0 → junior rate, identical to a known-junior cleaner. */
      expect(r.amount_cents).toBe(30_000);
      expect(r.source).toBe(OFFER_EARNINGS_SOURCE.CLEANER_TENURE_UNKNOWN);
    });
  });

  describe("solo fixed special (deep / move / carpet)", () => {
    it("returns R250 for a deep clean regardless of tenure or payment basis", () => {
      const r = computeCleanerOfferEarningsSnapshot({
        booking: {
          is_team_job: false,
          service: "Deep cleaning",
          date: TODAY_BOOKING_DATE,
          time: TODAY_BOOKING_TIME,
          total_paid_zar: 600,
        },
        cleaner: { joined_at: JUNIOR_JOINED_AT },
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.amount_cents).toBe(25_000);
      expect(r.source).toBe(OFFER_EARNINGS_SOURCE.CANONICAL);
      expect(r.diagnostics.payout_mode).toBe("solo_fixed_special");
    });

    it("still resolves R250 for a move-in/out booking with zero payment basis", () => {
      /** Fixed specials are tenure-agnostic AND basis-agnostic for the cleaner share. */
      const r = computeCleanerOfferEarningsSnapshot({
        booking: {
          is_team_job: false,
          service: "Move out cleaning",
          date: TODAY_BOOKING_DATE,
          time: TODAY_BOOKING_TIME,
          total_paid_zar: null,
          total_paid_cents: 0,
        },
        cleaner: { joined_at: null, created_at: null },
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.amount_cents).toBe(25_000);
    });
  });

  describe("team job", () => {
    it("returns team percentage parity per cleaner (v3 standard team)", () => {
      const r = computeCleanerOfferEarningsSnapshot({
        booking: {
          is_team_job: true,
          service: "Standard cleaning",
          date: TODAY_BOOKING_DATE,
          time: TODAY_BOOKING_TIME,
          total_paid_zar: 600,
          team_member_count_snapshot: 3,
        },
        cleaner: { joined_at: JUNIOR_JOINED_AT },
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.amount_cents).toBe(30_000);
      expect(r.source).toBe(OFFER_EARNINGS_SOURCE.CANONICAL);
      expect(r.diagnostics.payout_mode).toBe("team_percentage_parity");
      expect(r.diagnostics.team_cleaner_count).toBe(3);
    });

    it("returns zero per cleaner when standard team has zero payment basis", () => {
      const r = computeCleanerOfferEarningsSnapshot({
        booking: {
          is_team_job: true,
          service: "Standard cleaning",
          date: TODAY_BOOKING_DATE,
          time: TODAY_BOOKING_TIME,
          total_paid_zar: null,
          total_paid_cents: 0,
        },
        cleaner: { joined_at: null, created_at: null },
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.amount_cents).toBe(0);
    });
  });

  describe("safety", () => {
    it("never returns a negative amount", () => {
      const r = computeCleanerOfferEarningsSnapshot({
        booking: {
          is_team_job: false,
          service: "Standard cleaning",
          date: TODAY_BOOKING_DATE,
          time: TODAY_BOOKING_TIME,
          total_paid_zar: 100,
        },
        cleaner: { joined_at: EXPERIENCED_JOINED_AT },
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.amount_cents).toBeGreaterThanOrEqual(0);
    });
  });
});
