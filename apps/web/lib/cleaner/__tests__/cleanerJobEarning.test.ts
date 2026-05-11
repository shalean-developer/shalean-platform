import { describe, expect, it } from "vitest";
import {
  cleanerJobEarningFromCents,
  formatCleanerJobEarningDisplay,
  formatCleanerJobEarningStrictDisplay,
  isCleanerJobEarningAvailable,
  isCleanerJobEarningPositive,
  JOB_EARNING_BLOCK_COMPLETION_MESSAGE,
  JOB_EARNING_CURRENCY,
  JOB_EARNING_LABEL,
  JOB_EARNING_UNAVAILABLE_CONTACT_LABEL,
  JOB_EARNING_UNAVAILABLE_ERROR_CODE,
  JOB_EARNING_UNAVAILABLE_LABEL,
  resolveCleanerJobEarning,
} from "@/lib/cleaner/cleanerJobEarning";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";

describe("cleanerJobEarning", () => {
  describe("cleanerJobEarningFromCents", () => {
    it("returns the canonical shape for a positive amount", () => {
      const e = cleanerJobEarningFromCents(40000);
      expect(e).toEqual({
        amount_cents: 40000,
        currency: JOB_EARNING_CURRENCY,
        label: JOB_EARNING_LABEL,
      });
    });

    it("preserves R0 (legitimate zero, e.g. complimentary visit) — does NOT collapse to unavailable", () => {
      expect(cleanerJobEarningFromCents(0).amount_cents).toBe(0);
    });

    it("clamps negatives to 0 (defensive only — should never come from canonical resolver)", () => {
      expect(cleanerJobEarningFromCents(-500).amount_cents).toBe(0);
    });

    it("rounds non-integer cents to nearest integer", () => {
      expect(cleanerJobEarningFromCents(40050.6).amount_cents).toBe(40051);
    });

    it("returns unavailable for null", () => {
      expect(cleanerJobEarningFromCents(null).amount_cents).toBeNull();
    });

    it("returns unavailable for undefined", () => {
      expect(cleanerJobEarningFromCents(undefined).amount_cents).toBeNull();
    });

    it("returns unavailable for NaN / Infinity", () => {
      expect(cleanerJobEarningFromCents(Number.NaN).amount_cents).toBeNull();
      expect(cleanerJobEarningFromCents(Number.POSITIVE_INFINITY).amount_cents).toBeNull();
    });
  });

  describe("resolveCleanerJobEarning", () => {
    it("prefers cleaner_earnings_total_cents (line-item finalized, set at completion)", () => {
      const e = resolveCleanerJobEarning({
        cleaner_earnings_total_cents: 50000,
        payout_frozen_cents: 30000,
        display_earnings_cents: 10000,
      });
      expect(e.amount_cents).toBe(50000);
    });

    it("falls back to payout_frozen_cents when line-item total is null", () => {
      const e = resolveCleanerJobEarning({
        cleaner_earnings_total_cents: null,
        payout_frozen_cents: 30000,
        display_earnings_cents: 10000,
      });
      expect(e.amount_cents).toBe(30000);
    });

    it("falls back to display_earnings_cents when both higher tiers are null", () => {
      const e = resolveCleanerJobEarning({
        cleaner_earnings_total_cents: null,
        payout_frozen_cents: null,
        display_earnings_cents: 40000,
      });
      expect(e.amount_cents).toBe(40000);
    });

    it("returns unavailable when all three booking fields are null (not yet persisted)", () => {
      const e = resolveCleanerJobEarning({
        cleaner_earnings_total_cents: null,
        payout_frozen_cents: null,
        display_earnings_cents: null,
      });
      expect(e.amount_cents).toBeNull();
    });
  });

  describe("formatCleanerJobEarningDisplay", () => {
    /**
     * Locale punctuation differs across Node ICU builds (en-ZA may emit
     * either "R400.00" or "R400,00"). We assert against the exact same
     * formatter the production code uses so the test is locale-agnostic
     * but still pins the wiring.
     */
    it('renders "Job earning: <ZAR amount>" for a positive amount', () => {
      const display = formatCleanerJobEarningDisplay(cleanerJobEarningFromCents(40000));
      expect(display).toBe(`${JOB_EARNING_LABEL}: ${formatZarFromCents(40000)}`);
      expect(display.startsWith("Job earning: R")).toBe(true);
    });

    it("renders zero with the same formatter (legitimate R0)", () => {
      expect(formatCleanerJobEarningDisplay(cleanerJobEarningFromCents(0))).toBe(
        `${JOB_EARNING_LABEL}: ${formatZarFromCents(0)}`,
      );
    });

    it('renders "Job earning unavailable" when amount is null', () => {
      const display = formatCleanerJobEarningDisplay(cleanerJobEarningFromCents(null));
      expect(display).toBe(JOB_EARNING_UNAVAILABLE_LABEL);
    });

    it("uses the canonical en-ZA formatter (delegates to formatZarFromCents)", () => {
      expect(formatCleanerJobEarningDisplay(cleanerJobEarningFromCents(120050))).toBe(
        `${JOB_EARNING_LABEL}: ${formatZarFromCents(120050)}`,
      );
    });
  });

  describe("isCleanerJobEarningAvailable", () => {
    it("returns true for any resolved cents (including R0)", () => {
      expect(isCleanerJobEarningAvailable(cleanerJobEarningFromCents(0))).toBe(true);
      expect(isCleanerJobEarningAvailable(cleanerJobEarningFromCents(40000))).toBe(true);
    });

    it("returns false for null amount and for null/undefined inputs", () => {
      expect(isCleanerJobEarningAvailable(cleanerJobEarningFromCents(null))).toBe(false);
      expect(isCleanerJobEarningAvailable(null)).toBe(false);
      expect(isCleanerJobEarningAvailable(undefined)).toBe(false);
    });
  });

  /**
   * R0 is intentionally treated as **unavailable** by the strict checker — the
   * server-side completion gate (`isCompletableDisplayEarningsCents`) returns
   * 422 `job_earning_unavailable` when `display_earnings_cents <= 0`, so all
   * cleaner-facing surfaces must render "unavailable" instead of "R0,00" to
   * match the actual completion behavior.
   */
  describe("isCleanerJobEarningPositive", () => {
    it("returns true only for a strictly positive resolved amount", () => {
      expect(isCleanerJobEarningPositive(cleanerJobEarningFromCents(40000))).toBe(true);
      expect(isCleanerJobEarningPositive(cleanerJobEarningFromCents(1))).toBe(true);
    });

    it("returns false for R0 (unavailable for the cleaner Complete gate)", () => {
      expect(isCleanerJobEarningPositive(cleanerJobEarningFromCents(0))).toBe(false);
    });

    it("returns false for null amount and for null/undefined inputs", () => {
      expect(isCleanerJobEarningPositive(cleanerJobEarningFromCents(null))).toBe(false);
      expect(isCleanerJobEarningPositive(null)).toBe(false);
      expect(isCleanerJobEarningPositive(undefined)).toBe(false);
    });
  });

  describe("formatCleanerJobEarningStrictDisplay", () => {
    it('renders "Job earning: <amount>" for a strictly positive amount', () => {
      const display = formatCleanerJobEarningStrictDisplay(cleanerJobEarningFromCents(40000));
      expect(display).toBe(`${JOB_EARNING_LABEL}: ${formatZarFromCents(40000)}`);
    });

    it('renders the "contact support" copy for R0 (matches what the API rejects)', () => {
      expect(formatCleanerJobEarningStrictDisplay(cleanerJobEarningFromCents(0))).toBe(
        JOB_EARNING_UNAVAILABLE_CONTACT_LABEL,
      );
    });

    it('renders the "contact support" copy for null amount', () => {
      expect(formatCleanerJobEarningStrictDisplay(cleanerJobEarningFromCents(null))).toBe(
        JOB_EARNING_UNAVAILABLE_CONTACT_LABEL,
      );
      expect(formatCleanerJobEarningStrictDisplay(null)).toBe(JOB_EARNING_UNAVAILABLE_CONTACT_LABEL);
      expect(formatCleanerJobEarningStrictDisplay(undefined)).toBe(JOB_EARNING_UNAVAILABLE_CONTACT_LABEL);
    });
  });

  describe("constants", () => {
    it("exposes the stable error code used by the completion API", () => {
      expect(JOB_EARNING_UNAVAILABLE_ERROR_CODE).toBe("job_earning_unavailable");
    });

    it("exposes the disabled-Complete sub-copy used on the job detail page", () => {
      expect(JOB_EARNING_BLOCK_COMPLETION_MESSAGE).toBe(
        "Cannot complete job until job earning is confirmed.",
      );
    });

    it('exposes "Job earning unavailable — contact support" as the strict copy', () => {
      expect(JOB_EARNING_UNAVAILABLE_CONTACT_LABEL).toBe(
        "Job earning unavailable — contact support",
      );
    });
  });
});
