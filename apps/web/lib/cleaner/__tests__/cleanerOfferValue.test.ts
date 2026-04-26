import { describe, expect, it } from "vitest";
import type { CleanerOfferRow } from "@/lib/cleaner/cleanerOfferRow";
import {
  adjustedOfferValueScore,
  offerValueScoreCentsPerHour,
  sortCleanerOffersByAdjustedValue,
} from "@/lib/cleaner/cleanerOfferValue";

function offer(
  id: string,
  cents: number,
  expires: string,
  created: string,
  snapHours: number,
): CleanerOfferRow {
  return {
    id,
    booking_id: `b-${id}`,
    cleaner_id: "c1",
    status: "pending",
    expires_at: expires,
    created_at: created,
    displayEarningsCents: cents,
    booking: {
      id: `b-${id}`,
      service: "Standard",
      date: "2026-01-02",
      time: "09:00",
      location: "Cape Town",
      customer_name: "A",
      customer_phone: "1",
      status: "pending",
      booking_snapshot: { locked: { finalHours: snapHours } },
    },
  };
}

const ctx = (idle: number, nowIso: string) => ({
  now: new Date(nowIso),
  idleMinutesSinceLastCompleted: idle,
});

describe("sortCleanerOffersByAdjustedValue", () => {
  it("orders by higher pay per hour first when ages similar", () => {
    const t0 = "2026-01-01T10:00:00Z";
    const a = offer("a", 40_000, "2099-01-01T12:00:00Z", t0, 2);
    const b = offer("b", 45_000, "2099-01-01T12:00:00Z", t0, 3);
    const sorted = sortCleanerOffersByAdjustedValue([b, a], ctx(0, "2026-01-01T12:00:00Z"));
    expect(sorted[0]!.id).toBe("a");
    expect(offerValueScoreCentsPerHour(a)).toBe(20_000);
  });

  it("breaks ties with sooner expiry first", () => {
    const t0 = "2026-01-01T10:00:00Z";
    const late = offer("late", 20_000, "2099-06-01T12:00:00Z", t0, 1);
    const soon = offer("soon", 20_000, "2099-01-01T12:00:00Z", t0, 1);
    const sorted = sortCleanerOffersByAdjustedValue([late, soon], ctx(0, "2026-01-01T12:00:00Z"));
    expect(sorted[0]!.id).toBe("soon");
  });

  it("boosts older pending offer when base value ties", () => {
    const old = offer("old", 20_000, "2099-01-01T12:00:00Z", "2026-01-01T08:00:00Z", 1);
    const young = offer("young", 20_000, "2099-01-01T12:00:00Z", "2026-01-01T11:30:00Z", 1);
    const now = new Date("2026-01-01T12:00:00Z");
    expect(adjustedOfferValueScore(young, { now, idleMinutesSinceLastCompleted: 0 })).toBeLessThan(
      adjustedOfferValueScore(old, { now, idleMinutesSinceLastCompleted: 0 }),
    );
    const sorted = sortCleanerOffersByAdjustedValue([young, old], { now, idleMinutesSinceLastCompleted: 0 });
    expect(sorted[0]!.id).toBe("old");
  });
});
