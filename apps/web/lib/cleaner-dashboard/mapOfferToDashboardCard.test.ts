import { describe, expect, it } from "vitest";
import type { CleanerOfferRow } from "@/lib/cleaner/cleanerOfferRow";
import { cleanerJobEarningFromCents, JOB_EARNING_LABEL } from "@/lib/cleaner/cleanerJobEarning";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import { mapOfferToDashboardCard } from "@/lib/cleaner-dashboard/mapOfferToDashboardCard";

const NOW = new Date("2026-05-13T08:00:00.000+02:00");

function offerWith(overrides: Partial<CleanerOfferRow> = {}): CleanerOfferRow {
  return {
    id: "o1",
    booking_id: "b1",
    cleaner_id: "c1",
    status: "pending",
    expires_at: new Date(NOW.getTime() + 10 * 60_000).toISOString(),
    created_at: NOW.toISOString(),
    booking: {
      id: "b1",
      service: "Standard cleaning",
      date: "2026-05-13",
      time: "08:00",
      location: "12 Main Rd, Tokai, Cape Town",
      customer_name: "C",
      customer_phone: null,
      status: "pending_assignment",
    },
    ...overrides,
  };
}

describe("mapOfferToDashboardCard — jobEarning propagation", () => {
  it("uses the server-provided jobEarning verbatim when present", () => {
    const card = mapOfferToDashboardCard(
      offerWith({ jobEarning: cleanerJobEarningFromCents(42500) }),
      NOW,
    );
    expect(card.jobEarning).toEqual({
      amount_cents: 42500,
      currency: "ZAR",
      label: JOB_EARNING_LABEL,
    });
  });

  it("falls back to the legacy displayEarningsCents mirror when jobEarning is missing", () => {
    const card = mapOfferToDashboardCard(
      offerWith({ displayEarningsCents: 30000 }),
      NOW,
    );
    expect(card.jobEarning.amount_cents).toBe(30000);
    expect(card.jobEarning.label).toBe(JOB_EARNING_LABEL);
  });

  it("derives jobEarning from booking row earnings fields when no top-level field is set", () => {
    const card = mapOfferToDashboardCard(
      offerWith({
        booking: {
          ...offerWith().booking!,
          // Cast through unknown — these fields exist on the wire but aren't in the
          // declared type yet (legacy shape). The mapper accepts them.
          ...(({
            display_earnings_cents: 25000,
          } as unknown) as Record<string, unknown>),
        } as CleanerOfferRow["booking"],
      }),
      NOW,
    );
    expect(card.jobEarning.amount_cents).toBe(25000);
  });

  it('renders unavailable shape (amount_cents=null) when no source-of-truth resolves — UI shows "Job earning unavailable"', () => {
    const card = mapOfferToDashboardCard(offerWith(), NOW);
    expect(card.jobEarning).toEqual({
      amount_cents: null,
      currency: "ZAR",
      label: JOB_EARNING_LABEL,
    });
    // Legacy compact label collapses to em-dash for unavailable rows so we
    // don't accidentally render "R0.00".
    expect(card.payZarLabel).toBe("—");
  });

  it("preserves the legacy payZarLabel for back-compat callers when amount is positive", () => {
    const card = mapOfferToDashboardCard(
      offerWith({ jobEarning: cleanerJobEarningFromCents(40000) }),
      NOW,
    );
    /** Locale punctuation is host-ICU dependent — assert via the same
     * formatter the production helper uses. */
    expect(card.payZarLabel).toBe(formatZarFromCents(40000));
  });
});
