import { describe, expect, it } from "vitest";
import type { CleanerOfferRow } from "@/lib/cleaner/cleanerOfferRow";
import { sortCleanerOffersByAcceptanceScore } from "@/lib/cleaner/cleanerOfferAcceptanceRank";

function offer(
  id: string,
  cents: number,
  expires: string,
  date: string,
  time: string,
  snap?: { flat?: Record<string, unknown>; locked?: { finalHours?: number } },
): CleanerOfferRow {
  return {
    id,
    booking_id: `b-${id}`,
    cleaner_id: "c1",
    status: "pending",
    expires_at: expires,
    created_at: "2026-01-01T10:00:00Z",
    displayEarningsCents: cents,
    booking: {
      id: `b-${id}`,
      service: "Standard",
      date,
      time,
      location: "Somewhere",
      customer_name: "A",
      customer_phone: "1",
      status: "pending",
      booking_snapshot: snap ?? { locked: { finalHours: 2 } },
    },
  };
}

const ctx = (iso: string) => ({ now: new Date(iso), cleanerCreatedAtIso: "2020-01-01T00:00:00Z" as string | null });

describe("sortCleanerOffersByAcceptanceScore", () => {
  it("ranks higher earning first when timing and drive similar", () => {
    const now = "2026-01-10T08:00:00Z";
    const a = offer("a", 30_000, "2099-01-01T12:00:00Z", "2026-01-10", "14:00", {
      flat: { drive_eta_minutes: 20 },
      locked: { finalHours: 2 },
    });
    const b = offer("b", 35_000, "2099-01-01T12:00:00Z", "2026-01-10", "14:00", {
      flat: { drive_eta_minutes: 20 },
      locked: { finalHours: 2 },
    });
    const sorted = sortCleanerOffersByAcceptanceScore([a, b], ctx(now));
    expect(sorted[0]!.id).toBe("b");
  });

  it("prefers shorter drive when pay is the same", () => {
    const now = "2026-01-10T08:00:00Z";
    const far = offer("far", 28_000, "2099-01-01T12:00:00Z", "2026-01-10", "12:00", {
      flat: { drive_eta_minutes: 40 },
      locked: { finalHours: 2 },
    });
    const near = offer("near", 28_000, "2099-01-01T12:00:00Z", "2026-01-10", "12:00", {
      flat: { drive_eta_minutes: 10 },
      locked: { finalHours: 2 },
    });
    const sorted = sortCleanerOffersByAcceptanceScore([far, near], ctx(now));
    expect(sorted[0]!.id).toBe("near");
  });

  it("prefers sooner job start when pay and drive match", () => {
    const now = "2026-01-10T08:00:00Z";
    const later = offer("later", 28_000, "2099-01-01T12:00:00Z", "2026-01-10", "18:00", {
      flat: { drive_eta_minutes: 15 },
      locked: { finalHours: 2 },
    });
    const sooner = offer("sooner", 28_000, "2099-01-01T12:00:00Z", "2026-01-10", "10:00", {
      flat: { drive_eta_minutes: 15 },
      locked: { finalHours: 2 },
    });
    const sorted = sortCleanerOffersByAcceptanceScore([later, sooner], ctx(now));
    expect(sorted[0]!.id).toBe("sooner");
  });
});
