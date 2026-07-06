import { describe, expect, it } from "vitest";
import {
  applyCustomerDisplayCleanerNamesToRows,
  applyPairedRosterDisplayCleanerNames,
  extractCustomerDisplayCleanerIds,
} from "@/lib/customer/customerCleanerNameEnrichment";
import type { BookingRow } from "@/lib/dashboard/types";
import { mapBookingRow } from "@/lib/dashboard/bookingUtils";

describe("customerCleanerNameEnrichment", () => {
  it("collects assigned cleaner_id before selected_cleaner_id", () => {
    const ids = extractCustomerDisplayCleanerIds([
      { cleaner_id: "aaa", selected_cleaner_id: "bbb" },
      { cleaner_id: null, selected_cleaner_id: "ccc" },
    ] as BookingRow[]);
    expect(ids.sort()).toEqual(["aaa", "ccc"]);
  });

  it("sets display_cleaner_name from preferred pick when unassigned", () => {
    const rows = [{ cleaner_id: null, selected_cleaner_id: "pref-id" }] as BookingRow[];
    const nameById = new Map([["pref-id", "Princess Saidi"]]);
    expect(applyCustomerDisplayCleanerNamesToRows(rows, nameById)).toBe(1);
    expect(rows[0]!.display_cleaner_name).toBe("Princess Saidi");
  });

  it("mapBookingRow surfaces enriched preferred cleaner name", () => {
    const mapped = mapBookingRow({
      id: "bk-1",
      service: "regular-cleaning",
      date: "2026-06-20",
      time: "09:00",
      location: "1 Long St",
      total_paid_zar: 800,
      amount_paid_cents: 80000,
      currency: "ZAR",
      status: "assigned",
      booking_snapshot: null,
      created_at: "2026-06-10T12:00:00.000Z",
      paystack_reference: "bv2_test",
      selected_cleaner_id: "pref-id",
      display_cleaner_name: "Princess Saidi",
    } as BookingRow);
    expect(mapped.cleaner?.name).toBe("Princess Saidi");
  });

  it("sets display_cleaner_name to all roster members for paired jobs", () => {
    const rows = [
      { id: "bk-paired", cleaner_id: "lead-id", cleaner_count: 2 },
    ] as BookingRow[];
    const rosterByBookingId = new Map([
      [
        "bk-paired",
        [
          { full_name: "Nyasha Mudani", role: "lead" },
          { full_name: "Ethel Chizombe", role: "member" },
        ],
      ],
    ]);
    expect(applyPairedRosterDisplayCleanerNames(rows, rosterByBookingId)).toBe(1);
    expect(rows[0]!.display_cleaner_name).toBe("Nyasha Mudani, Ethel Chizombe");
  });
});
